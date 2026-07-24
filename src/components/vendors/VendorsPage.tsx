'use client'

import { useState, useEffect, useCallback, useMemo, useRef, DragEvent } from 'react'
import { Check, Paperclip, FileText, Landmark, CreditCard, HardHat, Building2, User, Phone, Hash, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// --- 타입 ---
interface Vendor {
  id: string
  name: string
  vendor_type: '협력업체' | '일용직'
  category: string
  contact_person: string
  phone: string
  email: string
  address: string
  business_number: string
  bank_info: string
  rating: number
  note: string
  biz_license_url: string | null
  bankbook_url: string | null
  id_card_url: string | null
  safety_cert_url: string | null
  created_at: string
}

type VendorType = '협력업체' | '일용직'

interface VendorCategory {
  id: string
  name: string
  created_at: string
}

// 분류 문자열 → 공종 목록 (기존 데이터의 "/" "," 구분자 모두 지원)
const splitCats = (s: string) => (s || '').split(/[,/]/).map(x => x.trim()).filter(Boolean)
const koCompare = (a: string, b: string) => a.localeCompare(b, 'ko')
const UNCATEGORIZED = '미분류'

const EMPTY_VENDOR = {
  name: '', vendor_type: '협력업체' as VendorType, category: '', contact_person: '', phone: '', email: '',
  address: '', business_number: '', bank_info: '', rating: 0, note: '',
  biz_license_url: null as string | null, bankbook_url: null as string | null,
  id_card_url: null as string | null, safety_cert_url: null as string | null,
}

const TABS: { key: VendorType; label: string }[] = [
  { key: '협력업체', label: '협력업체' },
  { key: '일용직', label: '일용직' },
]

// --- 별점 ---
function StarRating({ value, onChange, size = 'md' }: { value: number; onChange?: (v: number) => void; size?: 'sm' | 'md' }) {
  const [hover, setHover] = useState(0)
  const s = size === 'sm' ? 'text-lg' : 'text-2xl'
  const on = !!onChange
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button key={star} type="button" disabled={!on}
          className={`${s} ${on ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform disabled:opacity-100`}
          onMouseEnter={() => on && setHover(star)} onMouseLeave={() => on && setHover(0)}
          onClick={() => onChange?.(star === value ? 0 : star)}>
          <span className={hover >= star || (!hover && value >= star) ? 'text-yellow-400' : 'text-txt-quaternary'}>
            {hover >= star || (!hover && value >= star) ? '★' : '☆'}
          </span>
        </button>
      ))}
    </div>
  )
}

// --- 드래그앤드롭 파일 업로드 ---
function FileDropZone({ label, fileUrl, onUpload, onRemove }: {
  label: string; fileUrl: string | null; onUpload: (file: File) => void; onRemove: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onUpload(file)
  }
  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
  }

  const fileName = fileUrl ? fileUrl.split('/').pop()?.split('?')[0] || '파일' : null

  return (
    <div>
      <label className="label-field">{label}</label>
      {fileUrl ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-[10px]">
          <Check size={14} className="text-green-600" />
          <span className="text-sm text-green-700 truncate flex-1">{fileName}</span>
          <a href={fileUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-accent-text hover:underline shrink-0">보기</a>
          <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-600 shrink-0">삭제</button>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center border-[1.5px] border-dashed rounded-[10px] px-6 py-6 cursor-pointer transition-colors ${
            dragging ? 'border-accent bg-accent-light text-accent-text' : 'border-border-secondary hover:border-accent hover:bg-accent-light hover:text-accent-text'
          }`}>
          {uploading ? (
            <span className="text-sm text-txt-tertiary">업로드 중...</span>
          ) : (
            <>
              <Paperclip size={20} className="text-txt-tertiary mb-1" />
              <span className="text-xs text-txt-tertiary">드래그하거나 클릭하여 업로드</span>
            </>
          )}
          <input ref={inputRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleSelect} />
        </div>
      )}
    </div>
  )
}

// --- 메인 ---
export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<VendorType>('협력업체')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [form, setForm] = useState(EMPTY_VENDOR)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [chips, setChips] = useState<VendorCategory[]>([])
  const [addingChip, setAddingChip] = useState(false)
  const [chipInput, setChipInput] = useState('')
  const [chipDeleteConfirm, setChipDeleteConfirm] = useState<string | null>(null)
  const [chipPanelOpen, setChipPanelOpen] = useState(false)

  const fetchVendors = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('vendors').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setVendors(data || [])
    } catch (err) { console.error('거래처 로드 실패:', err) }
    finally { setLoading(false) }
  }, [])

  const fetchChips = useCallback(async () => {
    const { data, error } = await supabase.from('vendor_categories').select('*')
    if (!error && data) setChips(data)
  }, [])

  useEffect(() => { fetchVendors(); fetchChips() }, [fetchVendors, fetchChips])

  // --- 공종칩 등록/삭제 ---
  const sortedChipNames = useMemo(() => chips.map(c => c.name).sort(koCompare), [chips])

  const handleAddChip = async () => {
    const name = chipInput.trim()
    if (!name) return
    if (chips.some(c => c.name === name)) { alert('이미 등록된 공종입니다.'); return }
    const { error } = await supabase.from('vendor_categories').insert({ name })
    if (error) { alert(`공종 등록 실패: ${error.message}`); return }
    setChipInput('')
    setAddingChip(false)
    fetchChips()
  }

  const handleDeleteChip = async (chip: VendorCategory) => {
    const { error } = await supabase.from('vendor_categories').delete().eq('id', chip.id)
    if (error) { alert(`공종 삭제 실패: ${error.message}`); return }
    setChipDeleteConfirm(null)
    fetchChips()
  }

  // --- 분류(공종) 선택 토글 ---
  const selectedCats = useMemo(() => splitCats(form.category), [form.category])

  const toggleCat = (name: string) => {
    const next = selectedCats.includes(name)
      ? selectedCats.filter(c => c !== name)
      : [...selectedCats, name]
    setForm(prev => ({ ...prev, category: next.join('/') }))
  }

  // 필터링
  const filtered = vendors.filter(v => {
    if (v.vendor_type !== activeTab) return false
    if (search) {
      const q = search.toLowerCase()
      return v.name.toLowerCase().includes(q) || v.category.toLowerCase().includes(q) || v.contact_person?.toLowerCase().includes(q)
    }
    return true
  })

  // 공종별 그룹핑 (ㄱ~ㅎ 순, 여러 공종이면 각 그룹에 표시, 공종 없으면 미분류 맨 뒤)
  const grouped = useMemo(() => {
    const map = new Map<string, Vendor[]>()
    filtered.forEach(v => {
      const cats = splitCats(v.category)
      const keys = cats.length ? cats : [UNCATEGORIZED]
      keys.forEach(k => {
        if (!map.has(k)) map.set(k, [])
        map.get(k)!.push(v)
      })
    })
    const names = [...map.keys()].filter(k => k !== UNCATEGORIZED).sort(koCompare)
    if (map.has(UNCATEGORIZED)) names.push(UNCATEGORIZED)
    return names.map(name => ({
      name,
      vendors: map.get(name)!.slice().sort((a, b) => koCompare(a.name, b.name)),
    }))
  }, [filtered])

  const openCreateModal = () => {
    setEditingVendor(null)
    setForm({ ...EMPTY_VENDOR, vendor_type: activeTab })
    setDeleteConfirm(null)
    setChipPanelOpen(false)
    setModalOpen(true)
  }

  const openEditModal = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setForm({
      name: vendor.name, vendor_type: vendor.vendor_type, category: vendor.category || '',
      contact_person: vendor.contact_person || '', phone: vendor.phone || '', email: vendor.email || '',
      address: vendor.address || '', business_number: vendor.business_number || '', bank_info: vendor.bank_info || '', rating: vendor.rating || 0,
      note: vendor.note || '', biz_license_url: vendor.biz_license_url, bankbook_url: vendor.bankbook_url,
      id_card_url: vendor.id_card_url, safety_cert_url: vendor.safety_cert_url,
    })
    setDeleteConfirm(null)
    setChipPanelOpen(false)
    setModalOpen(true)
  }

  // 파일 업로드
  const uploadFile = async (file: File, field: string) => {
    const ext = file.name.split('.').pop()
    const path = `vendors/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage.from('attachments').upload(path, file)
    if (error) { alert('파일 업로드 실패'); return }
    const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(data.path)
    setForm(prev => ({ ...prev, [field]: urlData.publicUrl }))
  }

  const removeFile = (field: string) => setForm(prev => ({ ...prev, [field]: null }))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = { ...form }
      // 일용직은 email, business_number 빈값 처리
      if (form.vendor_type === '일용직') { payload.email = ''; payload.business_number = '' }
      if (editingVendor) {
        const { error } = await supabase.from('vendors').update(payload).eq('id', editingVendor.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('vendors').insert(payload)
        if (error) throw error
      }
      setModalOpen(false); fetchVendors()
    } catch (err) {
      console.error('저장 실패:', err)
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || ''
      alert(`저장에 실패했습니다.${msg ? '\n\n' + msg : ''}`)
    }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('vendors').delete().eq('id', id)
      if (error) throw error
      setDeleteConfirm(null); setModalOpen(false); fetchVendors()
    } catch (err) { console.error('삭제 실패:', err); alert('삭제에 실패했습니다.') }
  }

  const formatBusinessNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    if (digits.length <= 3) return digits
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
  }

  const updateForm = (field: string, value: string | number) => setForm(prev => ({ ...prev, [field]: value }))

  const isWorker = form.vendor_type === '일용직'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">거래처 DB</h1>
        <button onClick={openCreateModal} className="btn-primary">
          + {activeTab === '일용직' ? '일용직 등록' : '거래처 등록'}
        </button>
      </div>

      {/* 탭 */}
      <div className="tabs-container">
        {TABS.map(tab => {
          const count = vendors.filter(v => v.vendor_type === tab.key).length
          return (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSearch('') }}
              className={`tab-item ${activeTab === tab.key ? 'tab-active' : ''}`}>
              {tab.label}
              <span className={`ml-2 text-xs px-[10px] py-[2px] rounded-full font-medium ${
                activeTab === tab.key ? 'bg-accent-light text-accent-text' : 'bg-surface-tertiary text-txt-secondary'
              }`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* 공종칩 바 */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-medium text-txt-tertiary mr-1">공종</span>
        {sortedChipNames.map(name => {
          const chip = chips.find(c => c.name === name)!
          return chipDeleteConfirm === chip.id ? (
            <span key={chip.id} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full text-[12px] bg-red-50 border border-red-200 text-red-600">
              삭제?
              <button onClick={() => handleDeleteChip(chip)} className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[11px]">확인</button>
              <button onClick={() => setChipDeleteConfirm(null)} className="px-1.5 py-0.5 rounded-full bg-surface-secondary text-txt-secondary text-[11px]">취소</button>
            </span>
          ) : (
            <span key={chip.id} className="group/chip inline-flex items-center gap-1 pl-3 pr-2 py-1 rounded-full text-[12px] font-medium bg-surface-secondary text-txt-secondary border border-border-primary">
              {chip.name}
              <button onClick={() => setChipDeleteConfirm(chip.id)}
                className="opacity-0 group-hover/chip:opacity-100 transition-opacity text-txt-quaternary hover:text-red-500">
                <X size={12} />
              </button>
            </span>
          )
        })}
        {addingChip ? (
          <span className="inline-flex items-center gap-1">
            <input
              type="text" autoFocus value={chipInput}
              onChange={e => setChipInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddChip(); if (e.key === 'Escape') { setAddingChip(false); setChipInput('') } }}
              placeholder="공종명 입력"
              className="border border-border-primary rounded-full px-3 py-1 text-[12px] w-[120px] focus:border-accent outline-none"
            />
            <button onClick={handleAddChip} className="px-2.5 py-1 rounded-full bg-accent text-white text-[12px]">등록</button>
            <button onClick={() => { setAddingChip(false); setChipInput('') }} className="px-2.5 py-1 rounded-full bg-surface-secondary text-txt-secondary text-[12px]">취소</button>
          </span>
        ) : (
          <button onClick={() => setAddingChip(true)}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium border border-dashed border-border-secondary text-txt-tertiary hover:border-accent hover:text-accent-text transition-colors">
            <Plus size={12} /> 공종 추가
          </button>
        )}
      </div>

      {/* 검색 */}
      <div className="mb-5">
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder={activeTab === '일용직' ? '이름, 분류 검색...' : '업체명, 분류, 담당자 검색...'}
            value={search} onChange={e => setSearch(e.target.value)}
            className="input-field w-full pl-10 pr-4" />
        </div>
      </div>

      {/* 카드 그리드 */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-txt-tertiary">
          <div className="flex justify-center mb-3">{activeTab === '일용직' ? <HardHat size={36} className="text-txt-tertiary" /> : <Building2 size={36} className="text-txt-tertiary" />}</div>
          <p className="text-lg font-medium text-txt-quaternary">등록된 {activeTab}가 없습니다</p>
          <p className="text-sm mt-1">등록 버튼을 눌러 추가해 주세요</p>
        </div>
      ) : (
        <div className="space-y-7">
          {grouped.map(group => (
            <section key={group.name}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-[15px] font-semibold text-txt-primary">{group.name}</h2>
                <span className="text-xs px-2 py-[1px] rounded-full bg-surface-tertiary text-txt-secondary tabular-nums">{group.vendors.length}</span>
              </div>
              <div className="bg-surface border border-border-primary rounded-[10px] overflow-hidden divide-y divide-border-tertiary">
                {group.vendors.map(vendor => (
                  <div key={`${group.name}-${vendor.id}`} onClick={() => openEditModal(vendor)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-tertiary transition-colors cursor-pointer group">
                    {/* 이름 */}
                    <div className="w-[180px] shrink-0 min-w-0">
                      <span className="block font-medium text-sm text-txt-primary truncate group-hover:text-accent-text transition-colors">{vendor.name}</span>
                    </div>
                    {/* 공종칩 */}
                    <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden">
                      {splitCats(vendor.category).map(cat => (
                        <span key={cat} className="shrink-0 px-2 py-[1px] rounded-full text-[11px] font-medium bg-surface-secondary text-txt-secondary">{cat}</span>
                      ))}
                    </div>
                    {/* 별점 */}
                    <div className="shrink-0 hidden md:block">
                      <StarRating value={vendor.rating} size="sm" />
                    </div>
                    {/* 담당자 */}
                    <div className="w-[100px] shrink-0 hidden lg:flex items-center gap-1.5 text-sm text-txt-secondary min-w-0">
                      {vendor.contact_person && (
                        <>
                          <User size={13} className="text-txt-tertiary shrink-0" />
                          <span className="truncate">{vendor.contact_person}</span>
                        </>
                      )}
                    </div>
                    {/* 연락처 */}
                    <div className="w-[120px] shrink-0 text-sm">
                      {vendor.phone && (
                        <a href={`tel:${vendor.phone}`} onClick={e => e.stopPropagation()}
                          className="text-accent-text hover:underline whitespace-nowrap flex items-center gap-1.5">
                          <Phone size={13} className="text-txt-tertiary shrink-0" />{vendor.phone}
                        </a>
                      )}
                    </div>
                    {/* 사업자번호 */}
                    <div className="w-[110px] shrink-0 hidden xl:flex items-center gap-1.5 text-sm text-txt-secondary whitespace-nowrap">
                      {vendor.vendor_type === '협력업체' && vendor.business_number && (
                        <>
                          <Hash size={13} className="text-txt-tertiary shrink-0" />{vendor.business_number}
                        </>
                      )}
                    </div>
                    {/* 서류 상태 아이콘 */}
                    <div className="flex gap-1 shrink-0">
                      {vendor.vendor_type === '협력업체' ? (
                        <>
                          <span title="사업자등록증"><FileText size={14} className={vendor.biz_license_url ? 'text-green-500' : 'text-txt-quaternary'} /></span>
                          <span title="통장사본"><Landmark size={14} className={vendor.bankbook_url ? 'text-green-500' : 'text-txt-quaternary'} /></span>
                        </>
                      ) : (
                        <>
                          <span title="통장사본"><Landmark size={14} className={vendor.bankbook_url ? 'text-green-500' : 'text-txt-quaternary'} /></span>
                          <span title="신분증"><CreditCard size={14} className={vendor.id_card_url ? 'text-green-500' : 'text-txt-quaternary'} /></span>
                          <span title="안전교육증"><HardHat size={14} className={vendor.safety_cert_url ? 'text-green-500' : 'text-txt-quaternary'} /></span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* 모달 */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-container max-w-lg max-h-[90vh]" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="modal-header">
              <h2 className="modal-title text-lg">
                {editingVendor ? (isWorker ? '일용직 수정' : '거래처 수정') : (isWorker ? '일용직 등록' : '거래처 등록')}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-surface-secondary">
                <svg className="w-5 h-5 text-txt-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 바디 */}
            <div className="modal-body space-y-4">
              {/* 구분 */}
              <div>
                <label className="label-field">구분</label>
                <div className="flex gap-2">
                  {TABS.map(t => (
                    <button key={t.key} type="button" onClick={() => updateForm('vendor_type', t.key)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.vendor_type === t.key ? 'bg-accent text-white border-accent' : 'bg-surface text-txt-secondary border-border-primary hover:bg-surface-tertiary'
                      }`}>{t.label}</button>
                  ))}
                </div>
              </div>

              {/* 이름/업체명 */}
              <div>
                <label className="label-field">
                  {isWorker ? '이름' : '업체명'} <span className="text-red-500">*</span>
                </label>
                <input type="text" value={form.name} onChange={e => updateForm('name', e.target.value)}
                  placeholder={isWorker ? '이름을 입력하세요' : '업체명을 입력하세요'}
                  className="input-field w-full" />
              </div>

              {/* 분류 (공종칩 선택) */}
              <div>
                <label className="label-field">분류 (공종)</label>
                <div
                  onClick={() => setChipPanelOpen(o => !o)}
                  className="w-full min-h-[42px] border border-border-primary rounded-lg px-3 py-2 flex flex-wrap items-center gap-1.5 cursor-pointer hover:border-accent transition-colors"
                >
                  {selectedCats.length === 0 ? (
                    <span className="text-sm text-txt-quaternary">클릭해서 공종 선택</span>
                  ) : (
                    selectedCats.map(cat => (
                      <span key={cat} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-[3px] rounded-full text-[12px] font-medium bg-accent-light text-accent-text">
                        {cat}
                        <button onClick={e => { e.stopPropagation(); toggleCat(cat) }} className="hover:text-red-500">
                          <X size={12} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                {chipPanelOpen && (
                  <div className="mt-2 border border-border-primary rounded-lg p-2.5 max-h-[140px] overflow-y-auto">
                    {sortedChipNames.length === 0 ? (
                      <p className="text-sm text-txt-quaternary px-1">등록된 공종이 없습니다. 거래처 DB 화면 상단에서 공종을 추가하세요.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {sortedChipNames.map(name => {
                          const on = selectedCats.includes(name)
                          return (
                            <button key={name} type="button" onClick={() => toggleCat(name)}
                              className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-colors ${
                                on ? 'bg-accent text-white border-accent' : 'bg-surface text-txt-secondary border-border-primary hover:bg-surface-tertiary'
                              }`}>
                              {name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 협력업체 전용 필드 */}
              {!isWorker && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-field">담당자</label>
                      <input type="text" value={form.contact_person} onChange={e => updateForm('contact_person', e.target.value)}
                        placeholder="담당자명" className="input-field w-full" />
                    </div>
                    <div>
                      <label className="label-field">연락처</label>
                      <input type="tel" value={form.phone} onChange={e => updateForm('phone', e.target.value)}
                        placeholder="010-0000-0000" className="input-field w-full" />
                    </div>
                  </div>
                  <div>
                    <label className="label-field">이메일</label>
                    <input type="email" value={form.email} onChange={e => updateForm('email', e.target.value)}
                      placeholder="email@example.com" className="input-field w-full" />
                  </div>
                  <div>
                    <label className="label-field">주소</label>
                    <input type="text" value={form.address} onChange={e => updateForm('address', e.target.value)}
                      placeholder="사업장 주소" className="input-field w-full" />
                  </div>
                  <div>
                    <label className="label-field">사업자번호</label>
                    <input type="text" value={form.business_number} onChange={e => updateForm('business_number', formatBusinessNumber(e.target.value))}
                      placeholder="000-00-00000" className="input-field w-full" />
                  </div>
                </>
              )}

              {/* 일용직 전용 필드 */}
              {isWorker && (
                <div>
                  <label className="label-field">연락처</label>
                  <input type="tel" value={form.phone} onChange={e => updateForm('phone', e.target.value)}
                    placeholder="010-0000-0000" className="input-field w-full" />
                </div>
              )}

              {/* 계좌정보 (공통) */}
              <div>
                <label className="label-field">계좌정보</label>
                <input type="text" value={form.bank_info} onChange={e => updateForm('bank_info', e.target.value)}
                  placeholder="은행명 계좌번호 예금주" className="input-field w-full" />
              </div>

              {/* 서류 업로드 */}
              <div>
                <label className="block text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary mb-2">
                  <span className="flex items-center gap-1"><Paperclip size={14} className="text-txt-tertiary" /> 서류 첨부</span>
                </label>
                <div className="space-y-3">
                  {!isWorker ? (
                    <>
                      <FileDropZone label="사업자등록증" fileUrl={form.biz_license_url}
                        onUpload={f => uploadFile(f, 'biz_license_url')} onRemove={() => removeFile('biz_license_url')} />
                      <FileDropZone label="통장사본" fileUrl={form.bankbook_url}
                        onUpload={f => uploadFile(f, 'bankbook_url')} onRemove={() => removeFile('bankbook_url')} />
                    </>
                  ) : (
                    <>
                      <FileDropZone label="통장사본" fileUrl={form.bankbook_url}
                        onUpload={f => uploadFile(f, 'bankbook_url')} onRemove={() => removeFile('bankbook_url')} />
                      <FileDropZone label="신분증" fileUrl={form.id_card_url}
                        onUpload={f => uploadFile(f, 'id_card_url')} onRemove={() => removeFile('id_card_url')} />
                      <FileDropZone label="안전교육증" fileUrl={form.safety_cert_url}
                        onUpload={f => uploadFile(f, 'safety_cert_url')} onRemove={() => removeFile('safety_cert_url')} />
                    </>
                  )}
                </div>
              </div>

              {/* 별점 */}
              <div>
                <label className="label-field">평가</label>
                <StarRating value={form.rating} onChange={v => updateForm('rating', v)} />
              </div>

              {/* 메모 */}
              <div>
                <label className="label-field">메모</label>
                <textarea value={form.note} onChange={e => updateForm('note', e.target.value)} rows={2}
                  placeholder="특이사항, 주의사항 등"
                  className="input-field w-full py-2.5 resize-none" />
              </div>
            </div>

            {/* 푸터 */}
            <div className="modal-footer justify-between">
              <div>
                {editingVendor && (
                  deleteConfirm === editingVendor.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-red-600">정말 삭제?</span>
                      <button onClick={() => handleDelete(editingVendor.id)}
                        className="btn-danger">삭제</button>
                      <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">취소</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(editingVendor.id)}
                      className="btn-inline-danger">삭제</button>
                  )
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setModalOpen(false)} className="btn-secondary">취소</button>
                <button onClick={handleSave} disabled={!form.name.trim() || saving}
                  className="btn-primary disabled:opacity-50">
                  {saving ? '저장 중...' : editingVendor ? '수정' : '등록'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
