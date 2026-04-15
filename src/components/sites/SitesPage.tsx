'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import ImageViewer from '@/components/common/ImageViewer'
import ProcessCalendar from '@/components/sites/ProcessCalendar'

// --- 타입 ---
interface Site {
  id: string
  name: string
  address: string | null
  site_manager: string | null
  site_assistant: string | null
  client_manager: string | null
  client_phone: string | null
  start_date: string | null
  end_date: string | null
  status: string
  contract_type: string | null  // 수의계약 / 입찰
  budget: number
  spent: number
  memo: string | null
  progress: number
  created_at: string
}

interface Schedule {
  id: string
  site_id: string
  title: string
  start_date: string
  end_date: string
  contractor: string | null
  workers: string | null
  memo: string | null
  confirmed: boolean
  color: string
  sort_order: number
}

interface SiteLog {
  id: string
  site_id: string
  log_date: string
  weather: string | null
  today_work: string | null
  workers_detail: string | null
  materials: string | null
  remarks: string | null
  tomorrow_plan: string | null
  site_photos?: SitePhoto[]
}

interface SitePhoto {
  id: string
  site_log_id: string
  photo_type: 'fixed' | 'extra'
  slot_index: number | null
  file_url: string
  file_name: string | null
  caption: string | null
}

interface SiteDocument {
  id: string
  site_id: string
  stage: string
  doc_name: string
  status: 'pending' | 'done' | 'auto'
  file_url: string | null
  file_name: string | null
  source_tag: string | null
  sort_order: number
}

// --- 상수 ---
const SITE_STATUSES = ['계약', '착공', '공사중', '준공서류', '정산완료'] as const
const WEATHER_OPTIONS = ['맑음', '흐림', '비', '눈', '바람']
const DOC_STAGES = ['착공', '공사중', '준공', '상시서류', '수금', '기타'] as const
const SCHEDULE_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']

type SiteTabKey = '기본정보' | '현장일지' | '지출' | '서류'
const SITE_TABS: SiteTabKey[] = ['기본정보', '현장일지', '지출', '서류']

const STATUS_COLOR: Record<string, string> = {
  '계약': 'bg-[#e0e7ff] text-[#3730a3]',
  '착공': 'bg-[#ffedd5] text-[#9a3412]',
  '공사중': 'bg-[#ffedd5] text-[#9a3412]',
  '준공서류': 'bg-[#fef9c3] text-[#854d0e]',
  '정산완료': 'bg-[#d1fae5] text-[#065f46]',
}

// --- 메인 ---
export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRegister, setShowRegister] = useState(false)
  const [editSite, setEditSite] = useState<Site | null>(null)

  const loadSites = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .order('created_at', { ascending: false })
      if (!error) setSites((data as Site[]) || [])
    } catch { /* 테이블 미생성 시 무시 */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadSites() }, [loadSites])

  const handleDelete = async (site: Site) => {
    if (!confirm(`"${site.name}" 현장을 삭제하시겠습니까?`)) return
    await supabase.from('sites').delete().eq('id', site.id)
    loadSites()
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold text-[#111827]">현장관리</h1>
          <span className="text-[13px] text-[#9ca3af]">{sites.length}개 현장</span>
        </div>
        <button
          onClick={() => { setEditSite(null); setShowRegister(true) }}
          className="px-4 py-2 text-[13px] font-medium bg-[#5e6ad2] text-white rounded-lg hover:bg-[#4f56b3] transition-colors"
        >
          + 현장 등록
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-[#d1d5db]">불러오는 중...</div>
      ) : sites.length === 0 ? (
        <div className="text-center py-20 text-[#d1d5db]">
          등록된 현장이 없습니다.<br />
          <span className="text-[11px]">{`'+ 현장 등록' 버튼으로 새 현장을 추가하세요.`}</span>
        </div>
      ) : (
        <div>
          {/* 헤더 라인 */}
          <div className="flex items-center gap-4 px-5 py-2.5 bg-[#f1f3f5] rounded-t-[10px] border border-[#e5e7eb] text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider">
            <span className="w-4" />
            <span className="flex-1 min-w-0">현장명 / 주소</span>
            <span className="w-20 text-center">상태</span>
            <span className="w-20 text-center">소장</span>
            <span className="w-24 text-center">공정률</span>
            <span className="w-28 text-right">예산</span>
          </div>
          <div className="space-y-0">
          {sites.map(s => (
            <SiteAccordion
              key={s.id}
              site={s}
              expanded={expandedId === s.id}
              onToggle={() => setExpandedId(prev => prev === s.id ? null : s.id)}
              onEdit={() => { setEditSite(s); setShowRegister(true) }}
              onDelete={() => handleDelete(s)}
              onRefresh={loadSites}
            />
          ))}
          </div>
        </div>
      )}

      {showRegister && (
        <SiteRegisterModal
          site={editSite}
          onClose={() => { setShowRegister(false); setEditSite(null) }}
          onSaved={() => { setShowRegister(false); setEditSite(null); loadSites() }}
        />
      )}
    </div>
  )
}

// ===========================
//   현장 등록/수정 모달
// ===========================
function SiteRegisterModal({
  site,
  onClose,
  onSaved,
}: {
  site: Site | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!site
  const [name, setName] = useState(site?.name || '')
  const [address, setAddress] = useState(site?.address || '')
  const [siteManager, setSiteManager] = useState(site?.site_manager || '')
  const [siteAssistant, setSiteAssistant] = useState(site?.site_assistant || '')
  const [clientManager, setClientManager] = useState(site?.client_manager || '')
  const [clientPhone, setClientPhone] = useState(site?.client_phone || '')
  const [startDate, setStartDate] = useState(site?.start_date || '')
  const [endDate, setEndDate] = useState(site?.end_date || '')
  const [status, setStatus] = useState(site?.status || '계약')
  const [budget, setBudget] = useState(site?.budget?.toString() || '0')
  const [memo, setMemo] = useState(site?.memo || '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      address: address || null,
      site_manager: siteManager || null,
      site_assistant: siteAssistant || null,
      client_manager: clientManager || null,
      client_phone: clientPhone || null,
      start_date: startDate || null,
      end_date: endDate || null,
      status,
      budget: parseInt(budget) || 0,
      memo: memo || null,
    }
    if (isEdit) {
      await supabase.from('sites').update(payload).eq('id', site!.id)
    } else {
      await supabase.from('sites').insert(payload)
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#ffffff] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-[560px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#e5e7eb] flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[#111827]">{isEdit ? '현장 수정' : '현장 등록'}</h3>
          <button onClick={onClose} className="text-[#d1d5db] hover:text-[#4b5563] text-xl">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="현장명 *" value={name} onChange={setName} placeholder="예: OO아파트 리모델링" />
          <Field label="주소" value={address} onChange={setAddress} placeholder="도로명 주소" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="현장소장" value={siteManager} onChange={setSiteManager} />
            <Field label="현장보조" value={siteAssistant} onChange={setSiteAssistant} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="발주처 담당자" value={clientManager} onChange={setClientManager} />
            <Field label="발주처 연락처" value={clientPhone} onChange={setClientPhone} type="tel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="착공예정일" value={startDate} onChange={setStartDate} type="date" />
            <Field label="준공예정일" value={endDate} onChange={setEndDate} type="date" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#9ca3af] mb-1">상태</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full h-[36px] border border-[#e5e7eb] rounded-lg px-3 text-[13px] text-[#111827] focus:border-[#5e6ad2] focus:ring-2 focus:ring-[#5e6ad2]/20 focus:outline-none">
                {SITE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <Field label="예산 (원)" value={budget} onChange={setBudget} type="number" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#9ca3af] mb-1">메모</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-[13px] text-[#111827] focus:border-[#5e6ad2] focus:ring-2 focus:ring-[#5e6ad2]/20 focus:outline-none resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#e5e7eb] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-[13px] border border-[#e5e7eb] text-[#4b5563] rounded-lg hover:bg-[#e9ecef] transition-colors">취소</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim()} className="px-4 py-2 text-[13px] bg-[#5e6ad2] text-white rounded-lg hover:bg-[#4f56b3] disabled:opacity-50 transition-colors">
            {saving ? '저장 중...' : isEdit ? '수정' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[#9ca3af] mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full h-[36px] border border-[#e5e7eb] rounded-lg px-3 text-[13px] text-[#111827] focus:border-[#5e6ad2] focus:ring-2 focus:ring-[#5e6ad2]/20 focus:outline-none" />
    </div>
  )
}

// ===========================
//   아코디언 항목
// ===========================
function SiteAccordion({
  site, expanded, onToggle, onEdit, onDelete, onRefresh,
}: {
  site: Site; expanded: boolean; onToggle: () => void
  onEdit: () => void; onDelete: () => void; onRefresh: () => void
}) {
  return (
    <div className={`border border-[#e5e7eb] border-t-0 first:border-t first:rounded-t-[10px] last:rounded-b-[10px] overflow-hidden ${expanded ? '' : ''}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-4 px-5 py-3.5 bg-[#ffffff] hover:bg-[#e9ecef] transition-colors text-left">
        <span className={`transform transition-transform text-[#9ca3af] w-4 text-[11px] ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-[#111827] truncate">{site.name}</div>
          <div className="text-[12px] text-[#4b5563] truncate">{site.address || '-'}</div>
        </div>
        <span className={`w-20 text-center px-2 py-0.5 text-[11px] rounded-full font-medium ${STATUS_COLOR[site.status] || 'bg-[#f1f3f5] text-[#4b5563]'}`}>
          {site.status}
        </span>
        <span className="w-20 text-center text-[12px] text-[#4b5563] truncate">{site.site_manager || '-'}</span>
        <div className="w-24 shrink-0">
          <div className="flex items-center justify-between text-[11px] text-[#9ca3af] mb-0.5">
            <span>{site.progress}%</span>
          </div>
          <div className="w-full h-[3px] bg-[#f3f4f6] rounded overflow-hidden">
            <div className="h-full bg-[#5e6ad2] rounded transition-all" style={{ width: `${site.progress}%` }} />
          </div>
        </div>
        <div className="w-28 text-right shrink-0">
          <div className="text-[13px] font-semibold text-[#111827] tabular-nums">{site.budget.toLocaleString()}원</div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#f3f4f6]">
          <SiteDetail site={site} onEdit={onEdit} onDelete={onDelete} onRefresh={onRefresh} />
        </div>
      )}
    </div>
  )
}

// ===========================
//   현장 상세 (공정캘린더 + 4탭)
// ===========================
function SiteDetail({ site, onEdit, onDelete, onRefresh }: {
  site: Site; onEdit: () => void; onDelete: () => void; onRefresh: () => void
}) {
  const [activeTab, setActiveTab] = useState<SiteTabKey>('기본정보')
  const [schedules, setSchedules] = useState<Schedule[]>([])

  const loadSchedules = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('site_id', site.id)
        .order('sort_order')
      if (!error) setSchedules((data as Schedule[]) || [])
    } catch { /* 테이블 미생성 시 무시 */ }
  }, [site.id])

  useEffect(() => { loadSchedules() }, [loadSchedules])

  return (
    <div className="bg-[#f1f3f5] p-5">
      {/* 수정/삭제 버튼 */}
      <div className="flex justify-end gap-2 mb-3">
        <button onClick={onEdit} className="px-3 py-1.5 text-[11px] border border-[#e5e7eb] text-[#4b5563] rounded-lg hover:bg-[#ffffff] transition-colors">수정</button>
        <button onClick={onDelete} className="px-3 py-1.5 text-[11px] text-[#dc2626] border border-[#fecaca] rounded-lg hover:bg-[#fef2f2] transition-colors">삭제</button>
      </div>

      {/* 공정 캘린더 */}
      <ProcessCalendar siteId={site.id} schedules={schedules} onReload={loadSchedules} />

      {/* 탭 */}
      <div className="flex border-b border-[#e5e7eb] mt-5 mb-4">
        {SITE_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-[#5e6ad2] text-[#5e6ad2]'
                : 'border-transparent text-[#9ca3af] hover:text-[#4b5563]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-[#ffffff] rounded-[10px] border border-[#e5e7eb] p-4">
        {activeTab === '기본정보' && <TabBasicInfo site={site} onRefresh={onRefresh} />}
        {activeTab === '현장일지' && <TabSiteLogs siteId={site.id} />}
        {activeTab === '지출' && <TabExpenses siteId={site.id} />}
        {activeTab === '서류' && <TabDocuments siteId={site.id} />}
      </div>
    </div>
  )
}

// 이전 ProcessCalendar → ProcessCalendar.tsx로 분리됨
// (아래부터 탭 컴포넌트)
// ===========================
//   탭 1: 기본정보 (인라인 수정 - 레이아웃 유지)
// ===========================
// 박스 형태 인라인 필드 — 클릭 즉시 편집 가능, 1초 debounce 자동저장
function TabBasicInfo({ site, onRefresh }: { site: Site; onRefresh: () => void }) {
  const [form, setForm] = useState({
    name: site.name,
    address: site.address || '',
    site_manager: site.site_manager || '',
    site_assistant: site.site_assistant || '',
    client_manager: site.client_manager || '',
    client_phone: site.client_phone || '',
    start_date: site.start_date || '',
    end_date: site.end_date || '',
    status: site.status,
    contract_type: site.contract_type || '',
    budget: site.budget.toString(),
    memo: site.memo || '',
  })
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([])
  const [expenseTotal, setExpenseTotal] = useState(0)
  const [savedAt, setSavedAt] = useState<string>('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef(form)

  // 사이트 변경(다른 아코디언 펼침) 시 form 리셋
  useEffect(() => {
    const next = {
      name: site.name, address: site.address || '',
      site_manager: site.site_manager || '', site_assistant: site.site_assistant || '',
      client_manager: site.client_manager || '', client_phone: site.client_phone || '',
      start_date: site.start_date || '', end_date: site.end_date || '',
      status: site.status, contract_type: site.contract_type || '',
      budget: site.budget.toString(), memo: site.memo || '',
    }
    setForm(next)
    lastSavedRef.current = next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id])

  // 직원 목록 로드 (드롭다운용)
  useEffect(() => {
    supabase.from('staff').select('id, name').order('name').then(({ data }) => {
      if (data) setStaffList(data as { id: string; name: string }[])
    })
  }, [])

  // 지출내역서 합계 (expenses 테이블에서 site_id로 집계)
  useEffect(() => {
    supabase.from('expenses').select('amount').eq('site_id', site.id).then(({ data }) => {
      if (data) {
        const total = (data as { amount: number }[]).reduce((sum, e) => sum + (e.amount || 0), 0)
        setExpenseTotal(total)
      }
    })
  }, [site.id])

  // 값 업데이트 + 1초 debounce 자동저장
  const u = (key: keyof typeof form, val: string) => {
    setForm(prev => {
      const next = { ...prev, [key]: val }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => autoSave(next), 1000)
      return next
    })
  }

  const autoSave = async (next: typeof form) => {
    // 변화 없으면 스킵
    if (JSON.stringify(next) === JSON.stringify(lastSavedRef.current)) return
    const payload: Record<string, unknown> = {
      name: next.name,
      address: next.address || null,
      site_manager: next.site_manager || null,
      site_assistant: next.site_assistant || null,
      client_manager: next.client_manager || null,
      client_phone: next.client_phone || null,
      start_date: next.start_date || null,
      end_date: next.end_date || null,
      status: next.status,
      contract_type: next.contract_type || null,
      budget: parseInt(next.budget) || 0,
      memo: next.memo || null,
    }
    const { error } = await supabase.from('sites').update(payload).eq('id', site.id)
    // contract_type 컬럼 없을 때 graceful fallback
    if (error && /contract_type/.test(error.message)) {
      delete payload.contract_type
      await supabase.from('sites').update(payload).eq('id', site.id)
    }
    lastSavedRef.current = next
    const t = new Date()
    setSavedAt(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`)
    setTimeout(() => setSavedAt(''), 2000)
    onRefresh()
  }

  // 전화번호 하이픈 자동
  const formatPhone = (v: string) => {
    const digits = v.replace(/\D/g, '')
    if (digits.length < 4) return digits
    if (digits.length < 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    if (digits.length < 11) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`
  }
  // 금액 콤마
  const formatMoney = (v: string) => {
    const digits = v.replace(/\D/g, '')
    if (!digits) return ''
    return parseInt(digits).toLocaleString()
  }
  const parseMoney = (v: string) => v.replace(/\D/g, '')

  // 박스 필드 컴포넌트
  const Box = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="border border-[#e5e7eb] rounded-[10px] px-3 py-2 bg-[#ffffff] hover:border-[#5e6ad2]/40 focus-within:border-[#5e6ad2] focus-within:ring-2 focus-within:ring-[#5e6ad2]/10 transition-colors">
      <div className="text-[10px] font-medium text-[#9ca3af] mb-0.5">{label}</div>
      <div className="text-[13px] text-[#111827]">{children}</div>
    </div>
  )

  const inputCls = "w-full bg-transparent border-0 outline-none text-[13px] text-[#111827] placeholder:text-[#d1d5db] p-0"

  return (
    <div className="space-y-3">
      {/* 자동저장 상태 표시 */}
      <div className="flex justify-end h-4">
        {savedAt && <span className="text-[10px] text-[#059669]">✓ 저장됨 ({savedAt})</span>}
      </div>

      {/* 1행: 현장명 | 진행 상황 | 계약 종류 */}
      <div className="grid grid-cols-3 gap-3">
        <Box label="현장명">
          <input className={inputCls} value={form.name} onChange={e => u('name', e.target.value)} />
        </Box>
        <Box label="진행 상황">
          <select className={inputCls} value={form.status} onChange={e => u('status', e.target.value)}>
            {SITE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Box>
        <Box label="계약 종류">
          <select className={inputCls} value={form.contract_type} onChange={e => u('contract_type', e.target.value)}>
            <option value="">선택</option>
            <option value="수의계약">수의계약</option>
            <option value="입찰">입찰</option>
          </select>
        </Box>
      </div>

      {/* 2행: 주소 (전체 폭) */}
      <Box label="주소">
        <input className={inputCls} value={form.address} onChange={e => u('address', e.target.value)} placeholder="경기도 수원시 ..." />
      </Box>

      {/* 3행: 현장소장 | 현장보조 — 직원 드롭다운 */}
      <div className="grid grid-cols-2 gap-3">
        <Box label="현장소장">
          <select className={inputCls} value={form.site_manager} onChange={e => u('site_manager', e.target.value)}>
            <option value="">선택</option>
            {staffList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </Box>
        <Box label="현장보조">
          <select className={inputCls} value={form.site_assistant} onChange={e => u('site_assistant', e.target.value)}>
            <option value="">선택</option>
            {staffList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </Box>
      </div>

      {/* 4행: 계약부서 담당자 + 연락처 같은 라인 */}
      <div className="grid grid-cols-2 gap-3">
        <Box label="계약부서 담당자">
          <input className={inputCls} value={form.client_manager} onChange={e => u('client_manager', e.target.value)} />
        </Box>
        <Box label="계약부서 연락처">
          <input className={inputCls} value={form.client_phone} onChange={e => u('client_phone', formatPhone(e.target.value))} placeholder="010-0000-0000" />
        </Box>
      </div>

      {/* 5행: 착공예정일 | 준공예정일 같은 라인 */}
      <div className="grid grid-cols-2 gap-3">
        <Box label="착공예정일">
          <input type="date" className={inputCls} value={form.start_date} onChange={e => u('start_date', e.target.value)} />
        </Box>
        <Box label="준공예정일">
          <input type="date" className={inputCls} value={form.end_date} onChange={e => u('end_date', e.target.value)} />
        </Box>
      </div>

      {/* 6행: 공사금액 | 지출 (자동) */}
      <div className="grid grid-cols-2 gap-3">
        <Box label="공사금액 (원)">
          <input className={`${inputCls} tabular-nums`} value={formatMoney(form.budget)} onChange={e => u('budget', parseMoney(e.target.value))} placeholder="0" />
        </Box>
        <div className="border border-[#e5e7eb] rounded-[10px] px-3 py-2 bg-[#f9fafb]">
          <div className="text-[10px] font-medium text-[#9ca3af] mb-0.5">지출 (지출내역서 합계)</div>
          <div className="text-[13px] text-[#111827] tabular-nums">{expenseTotal.toLocaleString()}원</div>
        </div>
      </div>

      {/* 메모 */}
      <Box label="메모">
        <textarea className={`${inputCls} resize-none`} rows={2} value={form.memo} onChange={e => u('memo', e.target.value)} />
      </Box>
    </div>
  )
}

// ===========================
//   탭 2: 현장일지 (가로 테이블 형태)
// ===========================

// 일지 완성도 계산 (6개 필드 × 각 1점 = 0~6)
// KPI "현장일지 성실도 5점" 산출 기반 데이터
function calcLogCompletion(log: SiteLog): { score: number; max: number } {
  let score = 0
  if (log.weather && log.weather.trim()) score++
  if (log.workers_detail && log.workers_detail.trim()) score++
  if (log.materials && log.materials.trim()) score++
  if (log.today_work && log.today_work.trim().length >= 10) score++
  if (log.remarks && log.remarks.trim()) score++
  if (log.tomorrow_plan && log.tomorrow_plan.trim()) score++
  return { score, max: 6 }
}

function CompletionBadge({ score, max }: { score: number; max: number }) {
  const dots = Array.from({ length: max }, (_, i) => i < score)
  const color = score >= 5 ? '#059669' : score >= 3 ? '#d97706' : '#dc2626'
  return (
    <div className="inline-flex items-center gap-1 text-[10px] tabular-nums" title={`완성도 ${score}/${max}`}>
      <div className="flex gap-0.5">
        {dots.map((filled, i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: filled ? color : '#e5e7eb' }} />
        ))}
      </div>
      <span className="font-medium" style={{ color }}>{score}/{max}</span>
    </div>
  )
}

function TabSiteLogs({ siteId }: { siteId: string }) {
  const [logs, setLogs] = useState<SiteLog[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editLog, setEditLog] = useState<SiteLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewerImages, setViewerImages] = useState<{ url: string; name: string }[]>([])
  const [viewerIndex, setViewerIndex] = useState(0)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('site_logs')
        .select('*, site_photos(*)')
        .eq('site_id', siteId)
        .order('log_date', { ascending: false })
      if (!error) setLogs((data as SiteLog[]) || [])
    } catch { /* 무시 */ }
    setLoading(false)
  }, [siteId])

  useEffect(() => { loadLogs() }, [loadLogs])

  const handleDelete = async (id: string) => {
    if (!confirm('현장일지를 삭제하시겠습니까?')) return
    await supabase.from('site_logs').delete().eq('id', id)
    loadLogs()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-[#111827]">현장일지</h3>
        <button onClick={() => { setEditLog(null); setShowForm(true) }} className="px-3 py-1.5 text-[11px] bg-[#5e6ad2] text-white rounded-lg hover:bg-[#4f56b3] transition-colors">+ 일지 작성</button>
      </div>

      {showForm && (
        <SiteLogForm siteId={siteId} log={editLog}
          onClose={() => { setShowForm(false); setEditLog(null) }}
          onSave={() => { setShowForm(false); setEditLog(null); loadLogs() }} />
      )}

      {loading ? (
        <div className="text-center py-8 text-[#d1d5db] text-[13px]">불러오는 중...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-[#d1d5db] text-[13px]">작성된 일지가 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-[#f1f3f5] border-b border-[#e5e7eb]">
                <th className="px-3 py-2 text-left text-[11px] font-medium text-[#9ca3af] w-24">날짜</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-[#9ca3af] w-24">날씨</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-[#9ca3af]">금일작업 / 인력 / 자재</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-[#9ca3af] w-28">특이사항</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-[#9ca3af] w-28">익일계획</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-[#9ca3af] w-14">사진</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-[#9ca3af] w-20">완성도</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-[#9ca3af] w-20">관리</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const photos = log.site_photos || []
                const allImages = photos.map(p => ({ url: p.file_url, name: p.file_name || '' }))
                const completion = calcLogCompletion(log)
                return (
                  <tr key={log.id} className="border-b border-[#f3f4f6] hover:bg-[#e9ecef]/50">
                    <td className="px-3 py-2 text-[#111827] font-medium whitespace-nowrap">{log.log_date}</td>
                    <td className="px-3 py-2 text-[#4b5563] text-[11px]">{log.weather || '-'}</td>
                    <td className="px-3 py-2 text-[#4b5563] max-w-[300px]">
                      <div className="line-clamp-2 text-[13px]">{log.today_work || '-'}</div>
                      {(log.workers_detail || log.materials) && (
                        <div className="mt-0.5 text-[10px] text-[#9ca3af] leading-tight">
                          {log.workers_detail && <span>👷 {log.workers_detail}</span>}
                          {log.workers_detail && log.materials && <span> · </span>}
                          {log.materials && <span>📦 {log.materials}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#4b5563]">
                      <div className="line-clamp-2 text-[11px]">{log.remarks || '-'}</div>
                    </td>
                    <td className="px-3 py-2 text-[#4b5563]">
                      <div className="line-clamp-2 text-[11px] whitespace-pre-wrap">{log.tomorrow_plan || '-'}</div>
                    </td>
                    <td className="px-3 py-2">
                      {allImages.length > 0 ? (
                        <button
                          onClick={() => { setViewerImages(allImages); setViewerIndex(0) }}
                          className="text-[11px] text-[#5e6ad2] hover:text-[#4f56b3]"
                        >
                          {allImages.length}장
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#d1d5db]">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <CompletionBadge score={completion.score} max={completion.max} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => { setEditLog(log); setShowForm(true) }} className="text-[11px] text-[#5e6ad2] hover:text-[#4f56b3]">수정</button>
                        <button onClick={() => handleDelete(log.id)} className="text-[11px] text-[#dc2626] hover:text-[#dc2626]/80">삭제</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewerImages.length > 0 && (
        <ImageViewer images={viewerImages} initialIndex={viewerIndex} onClose={() => setViewerImages([])} />
      )}
    </div>
  )
}

// --- 날씨 분해 헬퍼 ---
function splitWeather(weatherStr: string | null): { cond: string; temp: string } {
  if (!weatherStr) return { cond: '', temp: '' }
  const parts = weatherStr.split('·').map(s => s.trim())
  return { cond: parts[0] || '', temp: parts[1] || '' }
}
function joinWeather(cond: string, temp: string): string | null {
  const c = cond.trim(), t = temp.trim()
  if (!c && !t) return null
  if (c && t) return `${c} · ${t}`
  return c || t
}

// --- 익일 계획 병합 헬퍼 ---
function buildTomorrowPlan(autoSchedules: string[], manualText: string): string | null {
  const autoPart = autoSchedules.length > 0 ? `[자동] ${autoSchedules.join(', ')}` : ''
  const manualPart = manualText.trim() ? `[수동] ${manualText.trim()}` : ''
  if (!autoPart && !manualPart) return null
  return [autoPart, manualPart].filter(Boolean).join('\n')
}

// --- 사용자 수동 입력만 추출 (기존 값에서 [자동] 행 제거) ---
function extractManualPlan(savedValue: string | null): string {
  if (!savedValue) return ''
  return savedValue
    .split('\n')
    .filter(line => !line.trim().startsWith('[자동]'))
    .map(line => line.replace(/^\[수동\]\s*/, ''))
    .join('\n')
    .trim()
}

// --- 현장일지 작성 폼 ---
function SiteLogForm({ siteId, log, onClose, onSave }: {
  siteId: string; log: SiteLog | null; onClose: () => void; onSave: () => void
}) {
  const isEdit = !!log
  const initialWeather = splitWeather(log?.weather || null)
  const [logDate, setLogDate] = useState(log?.log_date || new Date().toISOString().slice(0, 10))
  const [weatherCond, setWeatherCond] = useState(initialWeather.cond)
  const [weatherTemp, setWeatherTemp] = useState(initialWeather.temp)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [workersDetail, setWorkersDetail] = useState(log?.workers_detail || '')
  const [materials, setMaterials] = useState(log?.materials || '')
  const [todayWork, setTodayWork] = useState(log?.today_work || '')
  const [remarks, setRemarks] = useState(log?.remarks || '')
  const [tomorrowPlan, setTomorrowPlan] = useState(extractManualPlan(log?.tomorrow_plan || null))
  const [saving, setSaving] = useState(false)
  const [tomorrowSchedules, setTomorrowSchedules] = useState<{ title: string; contractor: string | null }[]>([])

  // 날씨 자동 조회 (기상청 API)
  const fetchWeather = useCallback(async () => {
    setWeatherLoading(true)
    try {
      const res = await fetch(`/api/weather?siteId=${siteId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.cond) setWeatherCond(data.cond)
        if (data.temp) setWeatherTemp(data.temp)
      }
    } catch { /* 수동 입력 fallback */ }
    setWeatherLoading(false)
  }, [siteId])

  // 신규 작성 시 자동 조회 (수정 시엔 기존 값 유지)
  useEffect(() => {
    if (!isEdit && !weatherCond && !weatherTemp) {
      fetchWeather()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 날짜 변경 시 다음날 공정 가져오기
  useEffect(() => {
    const fetchTomorrowSchedules = async () => {
      const tomorrow = new Date(logDate)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = tomorrow.toISOString().slice(0, 10)
      try {
        const { data } = await supabase
          .from('schedules')
          .select('title, contractor')
          .eq('site_id', siteId)
          .lte('start_date', tomorrowStr)
          .gte('end_date', tomorrowStr)
        setTomorrowSchedules(data || [])
      } catch { setTomorrowSchedules([]) }
    }
    fetchTomorrowSchedules()
  }, [logDate, siteId])

  const handleSubmit = async () => {
    if (!logDate) return
    setSaving(true)
    const autoSchedules = tomorrowSchedules.map(s =>
      s.contractor ? `${s.title}(${s.contractor})` : s.title
    )
    const payload = {
      site_id: siteId,
      log_date: logDate,
      weather: joinWeather(weatherCond, weatherTemp),
      today_work: todayWork || null,
      workers_detail: workersDetail || null,
      materials: materials || null,
      remarks: remarks || null,
      tomorrow_plan: buildTomorrowPlan(autoSchedules, tomorrowPlan),
    }
    if (isEdit) await supabase.from('site_logs').update(payload).eq('id', log!.id)
    else await supabase.from('site_logs').insert(payload)
    setSaving(false)
    onSave()
  }

  const tomorrow = new Date(logDate)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowLabel = `${tomorrow.getMonth() + 1}/${tomorrow.getDate()}`

  return (
    <div className="mb-4 rounded-[10px] border border-[#e5e7eb] bg-[#ffffff] shadow-[0_20px_60px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-[#5e6ad2] text-white">
        <h4 className="text-[14px] font-semibold">{isEdit ? '일지 수정' : '일지 작성'}</h4>
        <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">&times;</button>
      </div>

      <div className="p-5 space-y-3">
        {/* 1행: 날짜 + 날씨 + 온도 */}
        <div className="flex gap-3 items-start">
          <div className="w-36 shrink-0">
            <label className="block text-[11px] font-medium text-[#9ca3af] mb-1">날짜 *</label>
            <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
              className="w-full h-[36px] border border-[#e5e7eb] rounded-lg px-2.5 text-[13px] text-[#111827] focus:border-[#5e6ad2] focus:ring-2 focus:ring-[#5e6ad2]/20 focus:outline-none bg-[#ffffff]" />
          </div>
          <div className="w-32 shrink-0">
            <label className="flex items-center justify-between text-[11px] font-medium text-[#9ca3af] mb-1">
              <span>날씨</span>
              <button type="button" onClick={fetchWeather} disabled={weatherLoading}
                className="text-[10px] text-[#5e6ad2] hover:text-[#4f56b3] disabled:text-[#d1d5db]">
                {weatherLoading ? '조회중...' : '🔄 자동'}
              </button>
            </label>
            <select value={weatherCond} onChange={e => setWeatherCond(e.target.value)}
              className="w-full h-[36px] border border-[#e5e7eb] rounded-lg px-2 text-[13px] text-[#111827] focus:border-[#5e6ad2] focus:ring-2 focus:ring-[#5e6ad2]/20 focus:outline-none bg-[#ffffff]">
              <option value="">선택</option>
              {WEATHER_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="w-28 shrink-0">
            <label className="block text-[11px] font-medium text-[#9ca3af] mb-1">온도</label>
            <input type="text" value={weatherTemp} onChange={e => setWeatherTemp(e.target.value)}
              placeholder="18°C"
              className="w-full h-[36px] border border-[#e5e7eb] rounded-lg px-2.5 text-[13px] text-[#111827] focus:border-[#5e6ad2] focus:ring-2 focus:ring-[#5e6ad2]/20 focus:outline-none bg-[#ffffff]" />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-[#9ca3af] mb-1">금일작업</label>
            <input type="text" value={todayWork} onChange={e => setTodayWork(e.target.value)}
              placeholder="예) 2층 천장 목공 마감, 1층 화장실 방수 시공"
              className="w-full h-[36px] border border-[#e5e7eb] rounded-lg px-2.5 text-[13px] text-[#111827] focus:border-[#5e6ad2] focus:ring-2 focus:ring-[#5e6ad2]/20 focus:outline-none bg-[#ffffff]" />
          </div>
        </div>

        {/* 2행: 투입 인력 + 자재 */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-[#9ca3af] mb-1">투입 인력</label>
            <input type="text" value={workersDetail} onChange={e => setWorkersDetail(e.target.value)}
              placeholder="예) 목공 3명, 철근 2명, 미장 4명"
              className="w-full h-[36px] border border-[#e5e7eb] rounded-lg px-2.5 text-[13px] text-[#111827] focus:border-[#5e6ad2] focus:ring-2 focus:ring-[#5e6ad2]/20 focus:outline-none bg-[#ffffff]" />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-[#9ca3af] mb-1">자재 투입</label>
            <input type="text" value={materials} onChange={e => setMaterials(e.target.value)}
              placeholder="예) 시멘트 10포, 방수제 5통, 타일 20박스"
              className="w-full h-[36px] border border-[#e5e7eb] rounded-lg px-2.5 text-[13px] text-[#111827] focus:border-[#5e6ad2] focus:ring-2 focus:ring-[#5e6ad2]/20 focus:outline-none bg-[#ffffff]" />
          </div>
        </div>

        {/* 3행: 특이사항 + 익일계획 */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-[#9ca3af] mb-1">특이사항</label>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2}
              className="w-full border border-[#e5e7eb] rounded-lg px-2.5 py-2 text-[13px] text-[#111827] focus:border-[#5e6ad2] focus:ring-2 focus:ring-[#5e6ad2]/20 focus:outline-none resize-none bg-[#ffffff]" />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-[#9ca3af] mb-1">
              익일계획 <span className="text-[#5e6ad2]">({tomorrowLabel})</span>
              <span className="text-[10px] text-[#9ca3af] font-normal ml-1">· 다음날 캘린더 자동 포함</span>
            </label>
            {tomorrowSchedules.length > 0 ? (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {tomorrowSchedules.map((ts, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#e0e7ff] text-[#3730a3] rounded-md text-[11px] font-medium">
                    {ts.title}{ts.contractor ? ` (${ts.contractor})` : ''}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mb-1.5 text-[11px] text-[#d1d5db] italic">예정 공정 없음</div>
            )}
            <textarea value={tomorrowPlan} onChange={e => setTomorrowPlan(e.target.value)} rows={1}
              placeholder="추가 메모 (선택)"
              className="w-full border border-[#e5e7eb] rounded-lg px-2.5 py-2 text-[13px] text-[#111827] focus:border-[#5e6ad2] focus:ring-2 focus:ring-[#5e6ad2]/20 focus:outline-none resize-none bg-[#ffffff]" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-[13px] border border-[#e5e7eb] text-[#4b5563] rounded-lg hover:bg-[#e9ecef] transition-colors">취소</button>
          <button onClick={handleSubmit} disabled={saving || !logDate}
            className="px-5 py-2 text-[13px] bg-[#5e6ad2] text-white rounded-lg hover:bg-[#4f56b3] disabled:opacity-50 font-medium transition-colors">
            {saving ? '저장 중...' : isEdit ? '수정' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===========================
//   탭 3: 지출
// ===========================
function TabExpenses({ siteId }: { siteId: string }) {
  return (
    <div className="text-center py-8 text-[#d1d5db] text-[13px]">
      지출결의서 연동 예정<br />
      <span className="text-[11px]">(지출결의서 페이지에서 등록한 내역이 여기에 자동 표시됩니다)</span>
    </div>
  )
}

// ===========================
//   탭 4: 서류
// ===========================
function TabDocuments({ siteId }: { siteId: string }) {
  const [docs, setDocs] = useState<SiteDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState<string | null>(null)
  const [newDocName, setNewDocName] = useState('')

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('site_documents')
        .select('*')
        .eq('site_id', siteId)
        .order('sort_order')
      if (!error) setDocs((data as SiteDocument[]) || [])
    } catch { /* 무시 */ }
    setLoading(false)
  }, [siteId])

  useEffect(() => { loadDocs() }, [loadDocs])

  const handleAddDoc = async (stage: string) => {
    if (!newDocName.trim()) return
    await supabase.from('site_documents').insert({ site_id: siteId, stage, doc_name: newDocName.trim(), status: 'pending' })
    setNewDocName('')
    setShowAdd(null)
    loadDocs()
  }

  const handleToggleStatus = async (doc: SiteDocument) => {
    const next = doc.status === 'done' ? 'pending' : 'done'
    await supabase.from('site_documents').update({ status: next }).eq('id', doc.id)
    loadDocs()
  }

  const handleDeleteDoc = async (id: string) => {
    await supabase.from('site_documents').delete().eq('id', id)
    loadDocs()
  }

  const grouped = useMemo(() => {
    const map: Record<string, SiteDocument[]> = {}
    for (const stage of DOC_STAGES) map[stage] = []
    for (const d of docs) { if (map[d.stage]) map[d.stage].push(d) }
    return map
  }, [docs])

  return (
    <div className="space-y-5">
      <h3 className="text-[14px] font-semibold text-[#111827]">현장 서류</h3>
      {DOC_STAGES.map(stage => (
        <div key={stage}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[13px] font-medium text-[#4b5563]">{stage}</h4>
            <button onClick={() => setShowAdd(showAdd === stage ? null : stage)} className="text-[11px] text-[#5e6ad2] hover:text-[#4f56b3]">+ 추가</button>
          </div>
          {showAdd === stage && (
            <div className="flex gap-2 mb-2">
              <input value={newDocName} onChange={e => setNewDocName(e.target.value)} placeholder="서류명"
                className="flex-1 h-[36px] border border-[#e5e7eb] rounded-lg px-3 text-[13px] text-[#111827] focus:border-[#5e6ad2] focus:ring-2 focus:ring-[#5e6ad2]/20 focus:outline-none"
                onKeyDown={e => e.key === 'Enter' && handleAddDoc(stage)} />
              <button onClick={() => handleAddDoc(stage)} className="px-3 py-1.5 text-[11px] bg-[#5e6ad2] text-white rounded-lg hover:bg-[#4f56b3] transition-colors">추가</button>
              <button onClick={() => { setShowAdd(null); setNewDocName('') }} className="px-3 py-1.5 text-[11px] border border-[#e5e7eb] text-[#4b5563] rounded-lg hover:bg-[#e9ecef] transition-colors">취소</button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {grouped[stage].length === 0 ? (
              <div className="col-span-3 text-[11px] text-[#d1d5db] py-2">등록된 서류 없음</div>
            ) : grouped[stage].map(doc => (
              <div key={doc.id} className={`border rounded-[10px] p-3 flex items-center justify-between ${
                doc.status === 'done' ? 'border-[#a7f3d0] bg-[#d1fae5]/30'
                  : doc.status === 'auto' ? 'border-[#c7d2fe] bg-[#e0e7ff]/30'
                    : 'border-dashed border-[#e5e7eb]'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={() => handleToggleStatus(doc)}
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[11px] ${
                      doc.status === 'done' ? 'bg-[#065f46] border-[#065f46] text-white' : 'border-[#e5e7eb]'
                    }`}>
                    {doc.status === 'done' && '\u2713'}
                  </button>
                  <span className="text-[13px] text-[#4b5563] truncate">{doc.doc_name}</span>
                  {doc.source_tag && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      doc.source_tag === 'AI생성' ? 'bg-[#e0e7ff] text-[#3730a3]' : 'bg-[#ffedd5] text-[#9a3412]'
                    }`}>{doc.source_tag}</span>
                  )}
                </div>
                <button onClick={() => handleDeleteDoc(doc.id)} className="text-[11px] text-[#dc2626] hover:text-[#dc2626]/80 shrink-0 ml-1">삭제</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
