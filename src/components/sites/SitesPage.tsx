'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import ImageViewer from '@/components/common/ImageViewer'
import ProcessCalendar from '@/components/sites/ProcessCalendar'
import {
  CONTRACT_TYPE_BID,
  CONTRACT_TYPE_PRIVATE,
  contractTypeKind,
  contractTypeLabel,
  isContractTypeChosen,
} from '@/lib/siteContract'
import { sumExpensesBySite } from '@/lib/siteSpend'
import { formatMoney } from '@/lib/utils/format'
import { activityActionLabel, processorLabel, STAFF_STORAGE_KEY } from '@/lib/activityLog'
import { fetchSiteActivityLogs, logActivity } from '@/lib/activityLog/client'
import type { ActivityLogWithStaff } from '@/lib/activityLog'
import { SITE_INFLOW_PATHS, SITE_INFLOW_UNCONFIRMED } from '@/lib/siteInflow'
import { SITE_WORK_KINDS, SITE_WORK_KIND_UNCONFIRMED } from '@/lib/siteWorkKind'
import { createSite } from '@/lib/sites/client'

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
  quote_date: string | null
  construction_start_date: string | null
  inflow_path: string | null
  work_kind: string | null
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
  '계약': 'bg-status-docs-bg text-status-docs-text',
  '착공': 'bg-status-construction-bg text-status-construction-text',
  '공사중': 'bg-status-construction-bg text-status-construction-text',
  '준공서류': 'bg-status-reserve-bg text-status-reserve-text',
  '정산완료': 'bg-status-done-bg text-status-done-text',
}

const CONTRACT_BADGE_CLASS: Record<'bid' | 'private' | 'empty' | 'other', string> = {
  bid: 'bg-[#e0e7ff] text-[#3730a3]',
  private: 'bg-[#ffedd5] text-[#9a3412]',
  empty: 'bg-surface-secondary text-txt-tertiary',
  other: 'bg-surface-secondary text-txt-secondary',
}

function ContractTypeBadge({ value }: { value: string | null | undefined }) {
  const kind = contractTypeKind(value)
  const label = contractTypeLabel(value) || '미지정'
  return (
    <span className={`inline-flex items-center justify-center min-w-[44px] px-2 py-0.5 text-[11px] font-medium rounded-full ${CONTRACT_BADGE_CLASS[kind]}`}>
      {label}
    </span>
  )
}

function ContractTypePicker({
  value,
  onChange,
  required,
}: {
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  const kind = contractTypeKind(value)
    const btn = (active: boolean) =>
    `h-9 px-3 rounded-lg text-[13px] font-medium border transition-colors cursor-pointer ${
      active
        ? 'bg-accent-light text-accent border-accent'
        : 'bg-surface text-txt-secondary border-border-primary hover:bg-surface-tertiary'
    }`
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btn(kind === 'bid')} onClick={() => onChange(CONTRACT_TYPE_BID)}>입찰</button>
        <button type="button" className={btn(kind === 'private')} onClick={() => onChange(CONTRACT_TYPE_PRIVATE)}>수의</button>
      </div>
      {required && !isContractTypeChosen(value) && (
        <p className="mt-1 text-[11px] text-txt-tertiary">입찰 또는 수의를 고르세요</p>
      )}
    </div>
  )
}

// --- 메인 ---
export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [spentBySite, setSpentBySite] = useState<Record<string, number>>({})
  const [statusFilter, setStatusFilter] = useState<'진행중' | '정산완료' | '전체'>('진행중')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRegister, setShowRegister] = useState(false)
  const [editSite, setEditSite] = useState<Site | null>(null)

  const initialLoadedRef = useRef(false)
  const loadSites = useCallback(async () => {
    // 최초 1회만 전체 스피너 표시. 이후(자동저장 onRefresh·실시간 동기화) 새로고침은 조용히 갱신.
    // 매번 스피너를 켜면 목록 전체(펼친 현장의 캘린더·입력칸 포함)가 언마운트→리마운트되어
    // 스크롤이 위(캘린더)로 튀고 입력 포커스가 사라지는 버그가 발생함.
    if (!initialLoadedRef.current) setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .order('created_at', { ascending: false })
      if (!error) setSites((data as Site[]) || [])
      const exp = await supabase.from('expenses').select('site_id, amount')
      if (!exp.error) setSpentBySite(sumExpensesBySite(exp.data || []))
    } catch { /* 테이블 미생성 시 무시 */ }
    initialLoadedRef.current = true
    setLoading(false)
  }, [])

  useEffect(() => { loadSites() }, [loadSites])

  const visibleSites = useMemo(() => {
    if (statusFilter === '전체') return sites
    if (statusFilter === '정산완료') return sites.filter(s => s.status === '정산완료')
    return sites.filter(s => s.status !== '정산완료')
  }, [sites, statusFilter])

  const handleDelete = async (site: Site) => {
    if (!confirm(`"${site.name}" 현장을 삭제하시겠습니까?`)) return
    await logActivity({
      action: 'site_delete',
      target_type: 'site',
      target_id: site.id,
      detail: site.name,
    })
    await supabase.from('sites').delete().eq('id', site.id)
    loadSites()
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold text-txt-primary">현장관리</h1>
          <span className="text-[13px] text-txt-tertiary">{visibleSites.length}개 현장</span>
          <div className="flex bg-surface-secondary rounded-lg p-0.5">
            {(['진행중', '정산완료', '전체'] as const).map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 text-[12px] rounded-md transition ${
                  statusFilter === key ? 'bg-surface shadow-sm font-medium text-txt-primary' : 'text-txt-secondary'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => { setEditSite(null); setShowRegister(true) }}
          className="btn-primary"
        >
          + 현장 등록
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-txt-quaternary">불러오는 중...</div>
      ) : visibleSites.length === 0 ? (
        <div className="text-center py-20 text-txt-quaternary">
          {sites.length === 0 ? (
            <>등록된 현장이 없습니다.<br />
            <span className="text-[11px]">{`'+ 현장 등록' 버튼으로 새 현장을 추가하세요.`}</span></>
          ) : statusFilter === '진행중' ? (
            <>진행 중인 현장이 없습니다. 정산완료 필터에서 확인할 수 있습니다.</>
          ) : (
            <>이 필터에 해당하는 현장이 없습니다.</>
          )}
        </div>
      ) : (
        <div>
          {/* 헤더 라인 */}
          <div className="flex items-center gap-4 px-5 py-2.5 bg-surface-secondary rounded-t-[10px] border border-border-primary text-[11px] font-medium text-txt-tertiary uppercase tracking-wider">
            <span className="w-4" />
            <span className="flex-1 min-w-0">현장명 / 주소</span>
            <span className="w-16 text-center">계약</span>
            <span className="w-20 text-center">상태</span>
            <span className="w-20 text-center">소장</span>
            <span className="w-24 text-center">공정률</span>
            <span className="w-28 text-right">계약금액</span>
            <span className="w-28 text-right">지출</span>
          </div>
          <div className="space-y-0">
          {visibleSites.map(s => (
            <SiteAccordion
              key={s.id}
              site={s}
              spent={spentBySite[s.id] ?? 0}
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
  const [quoteDate, setQuoteDate] = useState(site?.quote_date || '')
  const [constructionStartDate, setConstructionStartDate] = useState(site?.construction_start_date || '')
  const [inflowPath, setInflowPath] = useState(site?.inflow_path || (site ? '' : SITE_INFLOW_UNCONFIRMED))
  const [workKind, setWorkKind] = useState(site?.work_kind || (site ? '' : SITE_WORK_KIND_UNCONFIRMED))
  const [status, setStatus] = useState(site?.status || '계약')
  const [contractType, setContractType] = useState(site?.contract_type || '')
  const [budget, setBudget] = useState(site?.budget?.toString() || '0')
  const [memo, setMemo] = useState(site?.memo || '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const canSave = name.trim().length > 0 && isContractTypeChosen(contractType)

  const handleSubmit = async () => {
    if (!canSave) return
    setSaving(true)
    setSaveError('')
    const payload = {
      name: name.trim(),
      address: address || null,
      site_manager: siteManager || null,
      site_assistant: siteAssistant || null,
      client_manager: clientManager || null,
      client_phone: clientPhone || null,
      start_date: startDate || null,
      end_date: endDate || null,
      quote_date: quoteDate || null,
      construction_start_date: constructionStartDate || null,
      inflow_path: inflowPath || null,
      work_kind: workKind || null,
      status,
      contract_type: contractType,
      budget: parseInt(budget) || 0,
      memo: memo || null,
    }

    if (!isEdit) {
      const created = await createSite(payload)
      if (!created.ok) {
        setSaveError(created.error)
        setSaving(false)
        return
      }
      await logActivity({
        action: 'site_create',
        target_type: 'site',
        target_id: created.id,
        detail: payload.name,
      })
      setSaving(false)
      onSaved()
      return
    }

    let { data, error } = await supabase.from('sites').update(payload).eq('id', site!.id).select('id').maybeSingle()
    if (error && /contract_type|quote_date|construction_start_date|inflow_path|work_kind/.test(error.message)) {
      const fallback = { ...payload } as Record<string, unknown>
      if (/contract_type/.test(error.message)) delete fallback.contract_type
      if (/quote_date|construction_start_date/.test(error.message)) {
        delete fallback.quote_date
        delete fallback.construction_start_date
      }
      if (/inflow_path|work_kind/.test(error.message)) {
        delete fallback.inflow_path
        delete fallback.work_kind
      }
      const retry = await supabase.from('sites').update(fallback).eq('id', site!.id).select('id').maybeSingle()
      data = retry.data
      error = retry.error
    }
    const siteId = (data as { id?: string } | null)?.id || site?.id
    if (!error && siteId) {
      await logActivity({
        action: 'site_update',
        target_type: 'site',
        target_id: siteId,
        detail: payload.name,
      })
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container w-[560px]" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title text-[16px]">{isEdit ? '현장 수정' : '현장 등록'}</h3>
          <button onClick={onClose} className="text-txt-quaternary hover:text-txt-secondary text-xl">&times;</button>
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
            <Field label="견적일" value={quoteDate} onChange={setQuoteDate} type="date" />
            <Field label="착공일" value={constructionStartDate} onChange={setConstructionStartDate} type="date" />
            <Field label="착공예정일" value={startDate} onChange={setStartDate} type="date" />
            <Field label="준공예정일" value={endDate} onChange={setEndDate} type="date" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-txt-tertiary mb-1">계약 종류 *</label>
            <ContractTypePicker value={contractType} onChange={setContractType} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-txt-tertiary mb-1">유입경로</label>
              <select value={inflowPath} onChange={e => setInflowPath(e.target.value)} className="input-field w-full">
                {isEdit && <option value="">미지정</option>}
                {SITE_INFLOW_PATHS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-txt-tertiary mb-1">공종</label>
              <select value={workKind} onChange={e => setWorkKind(e.target.value)} className="input-field w-full">
                {isEdit && <option value="">미지정</option>}
                {SITE_WORK_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-txt-tertiary mb-1">상태</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="input-field w-full">
                {SITE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <Field label="예산 (원)" value={budget} onChange={setBudget} type="number" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-txt-tertiary mb-1">메모</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} className="textarea-field w-full" />
          </div>
        </div>
        <div className="modal-footer">
          {saveError && <p className="mr-auto text-[12px] text-money-negative">{saveError}</p>}
          <button onClick={onClose} className="btn-secondary">취소</button>
          <button onClick={handleSubmit} disabled={saving || !canSave} className="btn-primary disabled:opacity-50">
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
      <label className="block text-[11px] font-medium text-txt-tertiary mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="input-field w-full" />
    </div>
  )
}

// ===========================
//   아코디언 항목
// ===========================
function SiteAccordion({
  site, spent, expanded, onToggle, onEdit, onDelete, onRefresh,
}: {
  site: Site; spent: number; expanded: boolean; onToggle: () => void
  onEdit: () => void; onDelete: () => void; onRefresh: () => void
}) {
  return (
    <div className={`border border-border-primary border-t-0 first:border-t first:rounded-t-[10px] last:rounded-b-[10px] overflow-hidden ${expanded ? '' : ''}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-4 px-5 py-3.5 bg-surface hover:bg-surface-tertiary transition-colors text-left">
        <span className={`transform transition-transform text-txt-tertiary w-4 text-[11px] ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-txt-primary truncate">{site.name}</div>
          <div className="text-[12px] text-txt-secondary truncate">{site.address || '-'}</div>
          {(site.work_kind || site.inflow_path) && (
            <div className="text-[11px] text-txt-tertiary truncate">
              {[site.work_kind, site.inflow_path].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <span className="w-16 shrink-0 flex justify-center">
          <ContractTypeBadge value={site.contract_type} />
        </span>
        <span className={`w-20 text-center px-2 py-0.5 text-[11px] rounded-full font-medium ${STATUS_COLOR[site.status] || 'bg-surface-secondary text-txt-secondary'}`}>
          {site.status}
        </span>
        <span className="w-20 text-center text-[12px] text-txt-secondary truncate">{site.site_manager || '-'}</span>
        <div className="w-24 shrink-0">
          <div className="flex items-center justify-between text-[11px] text-txt-tertiary mb-0.5">
            <span>{site.progress}%</span>
          </div>
          <div className="w-full h-[3px] bg-border-tertiary rounded overflow-hidden">
            <div className="h-full bg-accent rounded transition-all" style={{ width: `${site.progress}%` }} />
          </div>
        </div>
        <div className="w-28 text-right shrink-0">
          <div className="text-[13px] font-semibold text-txt-primary tabular-nums">{formatMoney(site.budget)}원</div>
        </div>
        <div className="w-28 text-right shrink-0">
          <div className="text-[13px] font-semibold text-txt-primary tabular-nums">{formatMoney(spent)}원</div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border-tertiary">
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
  const [activityTick, setActivityTick] = useState(0)
  const bumpActivity = useCallback(() => setActivityTick(n => n + 1), [])

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
    <div className="bg-surface-secondary p-5">
      {/* 수정/삭제 버튼 */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <ContractTypeBadge value={site.contract_type} />
        <div className="flex gap-2">
          <button onClick={onEdit} className="btn-inline">수정</button>
          <button onClick={onDelete} className="btn-inline-danger">삭제</button>
        </div>
      </div>

      {/* 공정 캘린더 */}
      <ProcessCalendar siteId={site.id} schedules={schedules} onReload={loadSchedules} onActivity={bumpActivity} />

      {/* 탭 */}
      <div className="flex border-b border-border-primary mt-5 mb-4">
        {SITE_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-accent text-accent'
                : 'border-transparent text-txt-tertiary hover:text-txt-secondary'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-[10px] border border-border-primary p-4">
        {activeTab === '기본정보' && <TabBasicInfo site={site} onRefresh={onRefresh} />}
        {activeTab === '현장일지' && <TabSiteLogs siteId={site.id} onActivity={bumpActivity} />}
        {activeTab === '지출' && <TabExpenses siteId={site.id} />}
        {activeTab === '서류' && <TabDocuments siteId={site.id} />}
      </div>

      <SiteActivityLogs siteId={site.id} reloadToken={activityTick} />
    </div>
  )
}

function SiteActivityLogs({ siteId, reloadToken }: { siteId: string; reloadToken: number }) {
  const [rows, setRows] = useState<ActivityLogWithStaff[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchSiteActivityLogs(siteId).then(data => {
      if (!cancelled) {
        setRows(data)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [siteId, reloadToken])

  return (
    <div className="mt-4 bg-surface rounded-[10px] border border-border-primary p-4">
      <h3 className="text-[14px] font-semibold text-txt-primary mb-3">작업 이력</h3>
      {loading ? (
        <div className="text-center py-6 text-txt-quaternary text-[13px]">불러오는 중...</div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] text-txt-tertiary">
              <th className="py-1.5 text-left font-medium w-36">시각</th>
              <th className="py-1.5 text-left font-medium">작업</th>
              <th className="py-1.5 text-left font-medium w-24">처리자</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-txt-quaternary">이력이 없습니다</td>
              </tr>
            ) : rows.map(row => (
              <tr key={row.id} className="border-t border-border-tertiary">
                <td className="py-2 text-txt-secondary whitespace-nowrap">
                  {row.created_at ? row.created_at.slice(0, 16).replace('T', ' ') : '—'}
                </td>
                <td className="py-2 text-txt-primary">
                  {activityActionLabel(row.action)}
                  {row.detail ? <span className="text-txt-tertiary"> · {row.detail}</span> : null}
                </td>
                <td className="py-2 text-txt-secondary">
                  {processorLabel(row.staff_id, row.staff?.name)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// 이전 ProcessCalendar → ProcessCalendar.tsx로 분리됨
// (아래부터 탭 컴포넌트)
// ===========================
//   탭 1: 기본정보 (인라인 수정 - 레이아웃 유지)
// ===========================
// 박스 형태 인라인 필드 — 클릭 즉시 편집 가능, 1초 debounce 자동저장
// ⚠️ Box는 반드시 모듈 최상위에 정의 — TabBasicInfo 내부에 두면 리렌더마다 새 함수가 되어
//    input이 언마운트/재마운트 → 입력 포커스 상실 + 스크롤 튐 버그 발생 (실시간 동기화로 리렌더 잦아 특히 심함)
function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-border-primary rounded-[10px] px-3 py-2 bg-surface hover:border-accent/40 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10 transition-colors">
      <div className="text-[10px] font-medium text-txt-tertiary mb-0.5">{label}</div>
      <div className="text-[13px] text-txt-primary">{children}</div>
    </div>
  )
}

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
    quote_date: site.quote_date || '',
    construction_start_date: site.construction_start_date || '',
    inflow_path: site.inflow_path || '',
    work_kind: site.work_kind || '',
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
      quote_date: site.quote_date || '', construction_start_date: site.construction_start_date || '',
      inflow_path: site.inflow_path || '', work_kind: site.work_kind || '',
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
      quote_date: next.quote_date || null,
      construction_start_date: next.construction_start_date || null,
      inflow_path: next.inflow_path || null,
      work_kind: next.work_kind || null,
      status: next.status,
      contract_type: next.contract_type || null,
      budget: parseInt(next.budget) || 0,
      memo: next.memo || null,
    }
    const { error } = await supabase.from('sites').update(payload).eq('id', site.id)
    if (error && /contract_type|quote_date|construction_start_date|inflow_path|work_kind/.test(error.message)) {
      if (/contract_type/.test(error.message)) delete payload.contract_type
      if (/quote_date|construction_start_date/.test(error.message)) {
        delete payload.quote_date
        delete payload.construction_start_date
      }
      if (/inflow_path|work_kind/.test(error.message)) {
        delete payload.inflow_path
        delete payload.work_kind
      }
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

  const inputCls = "w-full bg-transparent border-0 outline-none text-[13px] text-txt-primary placeholder:text-txt-quaternary p-0"

  return (
    <div className="space-y-3">
      {/* 자동저장 상태 표시 */}
      <div className="flex justify-end h-4">
        {savedAt && <span className="text-[10px] text-money-positive">✓ 저장됨 ({savedAt})</span>}
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
        <Box label="계약 종류 *">
          <ContractTypePicker value={form.contract_type} onChange={v => u('contract_type', v)} />
        </Box>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Box label="유입경로">
          <select className={inputCls} value={form.inflow_path} onChange={e => u('inflow_path', e.target.value)}>
            <option value="">미지정</option>
            {SITE_INFLOW_PATHS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Box>
        <Box label="공종">
          <select className={inputCls} value={form.work_kind} onChange={e => u('work_kind', e.target.value)}>
            <option value="">미지정</option>
            {SITE_WORK_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
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

      {/* 5행: 견적일 | 착공일 | 착공예정일 | 준공예정일 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Box label="견적일">
          <input type="date" className={inputCls} value={form.quote_date} onChange={e => u('quote_date', e.target.value)} />
        </Box>
        <Box label="착공일">
          <input type="date" className={inputCls} value={form.construction_start_date} onChange={e => u('construction_start_date', e.target.value)} />
        </Box>
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
        <div className="border border-border-primary rounded-[10px] px-3 py-2 bg-page">
          <div className="text-[10px] font-medium text-txt-tertiary mb-0.5">지출 (지출내역서 합계)</div>
          <div className="text-[13px] text-txt-primary tabular-nums">{expenseTotal.toLocaleString()}원</div>
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
          <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: filled ? color : 'var(--color-border-primary)' }} />
        ))}
      </div>
      <span className="font-medium" style={{ color }}>{score}/{max}</span>
    </div>
  )
}

function TabSiteLogs({ siteId, onActivity }: { siteId: string; onActivity?: () => void }) {
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
    await logActivity({
      action: 'site_log_delete',
      target_type: 'site',
      target_id: siteId,
      detail: id,
    })
    await supabase.from('site_logs').delete().eq('id', id)
    onActivity?.()
    loadLogs()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-txt-primary">현장일지</h3>
        <button onClick={() => { setEditLog(null); setShowForm(true) }} className="px-3 py-1.5 text-[11px] bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors">+ 일지 작성</button>
      </div>

      {showForm && (
        <SiteLogForm siteId={siteId} log={editLog}
          onClose={() => { setShowForm(false); setEditLog(null) }}
          onSave={() => { setShowForm(false); setEditLog(null); onActivity?.(); loadLogs() }} />
      )}

      {loading ? (
        <div className="text-center py-8 text-txt-quaternary text-[13px]">불러오는 중...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-txt-quaternary text-[13px]">작성된 일지가 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-surface-secondary border-b border-border-primary">
                <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-tertiary w-24">날짜</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-tertiary w-24">날씨</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-tertiary">금일작업 / 인력 / 자재</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-tertiary w-28">특이사항</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-tertiary w-28">익일계획</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-tertiary w-14">사진</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-txt-tertiary w-20">완성도</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-txt-tertiary w-20">관리</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const photos = log.site_photos || []
                const allImages = photos.map(p => ({ url: p.file_url, name: p.file_name || '' }))
                const completion = calcLogCompletion(log)
                return (
                  <tr key={log.id} className="border-b border-border-tertiary hover:bg-surface-tertiary/50">
                    <td className="px-3 py-2 text-txt-primary font-medium whitespace-nowrap">{log.log_date}</td>
                    <td className="px-3 py-2 text-txt-secondary text-[11px]">{log.weather || '-'}</td>
                    <td className="px-3 py-2 text-txt-secondary max-w-[300px]">
                      <div className="line-clamp-2 text-[13px]">{log.today_work || '-'}</div>
                      {(log.workers_detail || log.materials) && (
                        <div className="mt-0.5 text-[10px] text-txt-tertiary leading-tight">
                          {log.workers_detail && <span>👷 {log.workers_detail}</span>}
                          {log.workers_detail && log.materials && <span> · </span>}
                          {log.materials && <span>📦 {log.materials}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-txt-secondary">
                      <div className="line-clamp-2 text-[11px]">{log.remarks || '-'}</div>
                    </td>
                    <td className="px-3 py-2 text-txt-secondary">
                      <div className="line-clamp-2 text-[11px] whitespace-pre-wrap">{log.tomorrow_plan || '-'}</div>
                    </td>
                    <td className="px-3 py-2">
                      {allImages.length > 0 ? (
                        <button
                          onClick={() => { setViewerImages(allImages); setViewerIndex(0) }}
                          className="text-[11px] text-accent hover:text-accent-hover"
                        >
                          {allImages.length}장
                        </button>
                      ) : (
                        <span className="text-[11px] text-txt-quaternary">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <CompletionBadge score={completion.score} max={completion.max} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => { setEditLog(log); setShowForm(true) }} className="btn-inline">수정</button>
                        <button onClick={() => handleDelete(log.id)} className="btn-inline-danger">삭제</button>
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
    const actorStaffId = typeof window !== 'undefined'
      ? localStorage.getItem(STAFF_STORAGE_KEY)?.trim() || null
      : null
    const payload: Record<string, unknown> = {
      site_id: siteId,
      log_date: logDate,
      weather: joinWeather(weatherCond, weatherTemp),
      today_work: todayWork || null,
      workers_detail: workersDetail || null,
      materials: materials || null,
      remarks: remarks || null,
      tomorrow_plan: buildTomorrowPlan(autoSchedules, tomorrowPlan),
    }
    if (!isEdit && actorStaffId) payload.created_by = actorStaffId
    if (isEdit) await supabase.from('site_logs').update(payload).eq('id', log!.id)
    else await supabase.from('site_logs').insert(payload)
    await logActivity({
      action: isEdit ? 'site_log_update' : 'site_log_create',
      target_type: 'site',
      target_id: siteId,
      detail: logDate,
    })
    setSaving(false)
    onSave()
  }

  const tomorrow = new Date(logDate)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowLabel = `${tomorrow.getMonth() + 1}/${tomorrow.getDate()}`

  return (
    <div className="mb-4 rounded-[10px] border border-border-primary bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-accent text-white">
        <h4 className="text-[14px] font-semibold">{isEdit ? '일지 수정' : '일지 작성'}</h4>
        <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">&times;</button>
      </div>

      <div className="p-5 space-y-3">
        {/* 1행: 날짜 + 날씨 + 온도 */}
        <div className="flex gap-3 items-start">
          <div className="w-36 shrink-0">
            <label className="block text-[11px] font-medium text-txt-tertiary mb-1">날짜 *</label>
            <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
              className="input-field w-full" />
          </div>
          <div className="w-32 shrink-0">
            <label className="flex items-center justify-between text-[11px] font-medium text-txt-tertiary mb-1">
              <span>날씨</span>
              <button type="button" onClick={fetchWeather} disabled={weatherLoading}
                className="text-[10px] text-accent hover:text-accent-hover disabled:text-txt-quaternary">
                {weatherLoading ? '조회중...' : '🔄 자동'}
              </button>
            </label>
            <select value={weatherCond} onChange={e => setWeatherCond(e.target.value)}
              className="input-field w-full">
              <option value="">선택</option>
              {WEATHER_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="w-28 shrink-0">
            <label className="block text-[11px] font-medium text-txt-tertiary mb-1">온도</label>
            <input type="text" value={weatherTemp} onChange={e => setWeatherTemp(e.target.value)}
              placeholder="18°C"
              className="input-field w-full" />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-txt-tertiary mb-1">금일작업</label>
            <input type="text" value={todayWork} onChange={e => setTodayWork(e.target.value)}
              placeholder="예) 2층 천장 목공 마감, 1층 화장실 방수 시공"
              className="input-field w-full" />
          </div>
        </div>

        {/* 2행: 투입 인력 + 자재 */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-txt-tertiary mb-1">투입 인력</label>
            <input type="text" value={workersDetail} onChange={e => setWorkersDetail(e.target.value)}
              placeholder="예) 목공 3명, 철근 2명, 미장 4명"
              className="input-field w-full" />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-txt-tertiary mb-1">자재 투입</label>
            <input type="text" value={materials} onChange={e => setMaterials(e.target.value)}
              placeholder="예) 시멘트 10포, 방수제 5통, 타일 20박스"
              className="input-field w-full" />
          </div>
        </div>

        {/* 3행: 특이사항 + 익일계획 */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-txt-tertiary mb-1">특이사항</label>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2}
              className="textarea-field w-full" />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-txt-tertiary mb-1">
              익일계획 <span className="text-accent">({tomorrowLabel})</span>
              <span className="text-[10px] text-txt-tertiary font-normal ml-1">· 다음날 캘린더 자동 포함</span>
            </label>
            {tomorrowSchedules.length > 0 ? (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {tomorrowSchedules.map((ts, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-light text-accent-text rounded-md text-[11px] font-medium">
                    {ts.title}{ts.contractor ? ` (${ts.contractor})` : ''}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mb-1.5 text-[11px] text-txt-quaternary italic">예정 공정 없음</div>
            )}
            <textarea value={tomorrowPlan} onChange={e => setTomorrowPlan(e.target.value)} rows={1}
              placeholder="추가 메모 (선택)"
              className="textarea-field w-full" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">취소</button>
          <button onClick={handleSubmit} disabled={saving || !logDate}
            className="btn-primary disabled:opacity-50">
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
  const [rows, setRows] = useState<{ id: string; expense_date: string | null; title: string | null; amount: number | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('expenses').select('id, expense_date, title, amount').eq('site_id', siteId).order('expense_date', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setRows((data as typeof rows) || [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [siteId])

  const total = rows.reduce((s, r) => s + (r.amount || 0), 0)

  if (loading) return <div className="py-8 text-center text-[13px] text-txt-quaternary">불러오는 중...</div>
  if (rows.length === 0) {
    return <div className="py-8 text-center text-[13px] text-txt-quaternary">이 현장에 붙은 지출이 없습니다</div>
  }

  return (
    <div>
      <div className="flex justify-end mb-2 text-[12px] text-txt-secondary">합계 <span className="ml-2 font-semibold text-txt-primary tabular-nums">{formatMoney(total)}원</span></div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[11px] text-txt-tertiary">
            <th className="py-1.5 text-left font-medium">날짜</th>
            <th className="py-1.5 text-left font-medium">내용</th>
            <th className="py-1.5 text-right font-medium">금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t border-border-tertiary">
              <td className="py-2 text-txt-secondary">{r.expense_date || '-'}</td>
              <td className="py-2 text-txt-primary">{r.title || '-'}</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(r.amount || 0)}원</td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <h3 className="text-[14px] font-semibold text-txt-primary">현장 서류</h3>
      {DOC_STAGES.map(stage => (
        <div key={stage}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[13px] font-medium text-txt-secondary">{stage}</h4>
            <button onClick={() => setShowAdd(showAdd === stage ? null : stage)} className="text-[11px] text-accent hover:text-accent-hover">+ 추가</button>
          </div>
          {showAdd === stage && (
            <div className="flex gap-2 mb-2">
              <input value={newDocName} onChange={e => setNewDocName(e.target.value)} placeholder="서류명"
                className="input-field flex-1"
                onKeyDown={e => e.key === 'Enter' && handleAddDoc(stage)} />
              <button onClick={() => handleAddDoc(stage)} className="px-3 py-1.5 text-[11px] bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors">추가</button>
              <button onClick={() => { setShowAdd(null); setNewDocName('') }} className="px-3 py-1.5 text-[11px] border border-border-primary text-txt-secondary rounded-lg hover:bg-surface-tertiary transition-colors">취소</button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {grouped[stage].length === 0 ? (
              <div className="col-span-3 text-[11px] text-txt-quaternary py-2">등록된 서류 없음</div>
            ) : grouped[stage].map(doc => (
              <div key={doc.id} className={`border rounded-[10px] p-3 flex items-center justify-between ${
                doc.status === 'done' ? 'border-normal-bg bg-status-done-bg/30'
                  : doc.status === 'auto' ? 'border-accent-light bg-accent-light/30'
                    : 'border-dashed border-border-primary'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={() => handleToggleStatus(doc)}
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[11px] ${
                      doc.status === 'done' ? 'bg-status-done-text border-status-done-text text-white' : 'border-border-primary'
                    }`}>
                    {doc.status === 'done' && '\u2713'}
                  </button>
                  <span className="text-[13px] text-txt-secondary truncate">{doc.doc_name}</span>
                  {doc.source_tag && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      doc.source_tag === 'AI생성' ? 'bg-accent-light text-accent-text' : 'bg-status-construction-bg text-status-construction-text'
                    }`}>{doc.source_tag}</span>
                  )}
                </div>
                <button onClick={() => handleDeleteDoc(doc.id)} className="btn-inline-danger shrink-0 ml-1">삭제</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
