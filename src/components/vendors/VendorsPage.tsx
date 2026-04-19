'use client'

import { useState, useEffect, useCallback, useRef, DragEvent } from 'react'
import { Check, Paperclip, FileText, Landmark, CreditCard, HardHat, Building2, User, Phone, Hash } from 'lucide-react'
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

  const fetchVendors = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('vendors').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setVendors(data || [])
    } catch (err) { console.error('거래처 로드 실패:', err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchVendors() }, [fetchVendors])

  // 필터링
  const filtered = vendors.filter(v => {
    if (v.vendor_type !== activeTab) return false
    if (search) {
      const q = search.toLowerCase()
      return v.name.toLowerCase().includes(q) || v.category.toLowerCase().includes(q) || v.contact_person?.toLowerCase().includes(q)
    }
    return true
  })

  const openCreateModal = () => {
    setEditingVendor(null)
    setForm({ ...EMPTY_VENDOR, vendor_type: activeTab })
    setDeleteConfirm(null)
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
    } catch (err) { console.error('저장 실패:', err); alert('저장에 실패했습니다.') }
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(vendor => (
            <div key={vendor.id} onClick={() => openEditModal(vendor)}
              className="bg-surface border border-border-primary rounded-[10px] p-5 hover:shadow-md hover:border-border-secondary transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-txt-primary truncate group-hover:text-accent-text transition-colors">
                    {vendor.name}
                  </h3>
                  {vendor.category && (
                    <span className="inline-block mt-1 px-[10px] py-[2px] rounded-full text-[11px] font-medium bg-surface-secondary text-txt-secondary">{vendor.category}</span>
                  )}
                </div>
                {/* 서류 상태 아이콘 */}
                <div className="flex gap-1 shrink-0 ml-2">
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

              <div className="mb-2">
                <StarRating value={vendor.rating} size="sm" />
              </div>

              <div className="space-y-1 text-sm">
                {vendor.contact_person && (
                  <div className="flex items-center gap-2 text-txt-secondary">
                    <User size={14} className="text-txt-tertiary" />
                    <span className="truncate">{vendor.contact_person}</span>
                  </div>
                )}
                {vendor.phone && (
                  <div className="flex items-center gap-2 text-txt-secondary">
                    <Phone size={14} className="text-txt-tertiary" />
                    <a href={`tel:${vendor.phone}`} onClick={e => e.stopPropagation()}
                      className="text-accent-text hover:underline truncate">{vendor.phone}</a>
                  </div>
                )}
                {vendor.vendor_type === '협력업체' && vendor.business_number && (
                  <div className="flex items-center gap-2 text-txt-secondary">
                    <Hash size={14} className="text-txt-tertiary" />
                    <span className="truncate">{vendor.business_number}</span>
                  </div>
                )}
              </div>
            </div>
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

              {/* 분류 (자유 입력) */}
              <div>
                <label className="label-field">분류</label>
                <input type="text" value={form.category} onChange={e => updateForm('category', e.target.value)}
                  placeholder={isWorker ? '예: 미장, 타일, 철거' : '예: 전기, 설비, 도배'}
                  className="input-field w-full" />
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
