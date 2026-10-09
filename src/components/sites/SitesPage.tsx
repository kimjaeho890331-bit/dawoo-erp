'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
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
import {
  LABOR_CATEGORY,
  MATERIAL_CATEGORY,
  isLaborCategory,
  laborTextOf,
  looksLikeLabor,
} from '@/lib/expenseCategory'
import { activityActionLabel, processorLabel } from '@/lib/activityLog'
import { fetchSiteActivityLogs, logActivity } from '@/lib/activityLog/client'
import type { ActivityLogWithStaff } from '@/lib/activityLog'
import { SITE_INFLOW_PATHS, SITE_INFLOW_UNCONFIRMED } from '@/lib/siteInflow'
import { SITE_WORK_KINDS, SITE_WORK_KIND_UNCONFIRMED } from '@/lib/siteWorkKind'
import { createSite } from '@/lib/sites/client'
import { toast } from '@/lib/toast'

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

// --- 상수 ---
const SITE_STATUSES = ['계약', '착공', '공사중', '준공서류', '정산완료'] as const
const SCHEDULE_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']

// 현장일지·서류 탭은 지웠다 — 현장관리는 진행 상태와 지출만 본다 (2026-10-08 대표)
type SiteTabKey = '기본정보' | '지출'
const SITE_TABS: SiteTabKey[] = ['기본정보', '지출']

const STATUS_COLOR: Record<string, string> = {
  '계약': 'bg-status-docs-bg text-status-docs-text',
  '착공': 'bg-status-construction-bg text-status-construction-text',
  '공사중': 'bg-status-construction-bg text-status-construction-text',
  '준공서류': 'bg-status-reserve-bg text-status-reserve-text',
  '정산완료': 'bg-status-done-bg text-status-done-text',
}

const CONTRACT_BADGE_CLASS: Record<'bid' | 'private' | 'empty' | 'other', string> = {
  // 계약 종류는 상태가 아니므로 회색 — 진행 상태 배지와 헷갈리지 않게 (예전에는 남색·주황)
  bid: 'bg-surface-secondary text-txt-secondary',
  private: 'bg-surface-secondary text-txt-secondary',
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
    // 지운 다음에 기록한다 — 예전에는 기록부터 남기고 지우기 실패는 확인하지 않아,
    // 실패해도 "삭제" 기록만 남고 아무 일도 없는 것처럼 보였다.
    const { error } = await supabase.from('sites').delete().eq('id', site.id)
    if (error) { toast.error(`현장을 삭제하지 못했습니다: ${error.message}`); return }
    await logActivity({
      action: 'site_delete',
      target_type: 'site',
      target_id: site.id,
      detail: site.name,
    })
    loadSites()
  }

  return (
    <div className="md:p-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="whitespace-nowrap text-[22px] font-semibold text-txt-primary">현장관리</h1>
          <span className="text-[13px] text-txt-tertiary">{visibleSites.length}개 현장</span>
          <div className="flex bg-surface-secondary rounded-lg p-0.5 *:whitespace-nowrap">
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
        // 폰에서는 목록을 옆으로 밀어서 본다 — 고정 폭 칸이 많아 현장명 칸이 사라졌다
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0"><div className="min-w-[760px]">
          {/* 헤더 라인 */}
          <div className="flex items-center gap-4 px-5 py-2.5 bg-surface-secondary rounded-t-[10px] border border-border-primary text-[11px] font-medium text-txt-tertiary uppercase tracking-wider">
            <span className="w-4" />
            <span className="flex-1 min-w-0">현장명 / 주소</span>
            <span className="w-16 text-center">계약</span>
            <span className="w-20 text-center">상태</span>
            <span className="w-20 text-center">현장대리인</span>
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
        </div></div>
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
    // 고치기가 실패하면 창을 닫지 않고 이유를 보여준다 (예전에는 실패해도 그냥 닫혔다)
    if (error) {
      setSaveError(`저장하지 못했습니다: ${error.message}`)
      setSaving(false)
      return
    }
    const siteId = (data as { id?: string } | null)?.id || site?.id
    if (siteId) {
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
            <Field label="현장대리인" value={siteManager} onChange={setSiteManager} />
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
//   현장 상세 (공정캘린더 + 2탭)
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
            className={`px-4 py-2 text-[13px] font-medium border-b-[1.5px] transition-colors ${
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
        {activeTab === '지출' && <TabExpenses site={site} />}
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
  const [staffList, setStaffList] = useState<{ id: string; name: string; resign_date?: string | null }[]>([])
  const [expenseTotal, setExpenseTotal] = useState(0)
  const [savedAt, setSavedAt] = useState<string>('')
  const [autoSaveError, setAutoSaveError] = useState<string>('')
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
    supabase.from('staff').select('id, name, resign_date').order('name').then(({ data }) => {
      if (data) setStaffList(data as { id: string; name: string; resign_date?: string | null }[])
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
    let { error } = await supabase.from('sites').update(payload).eq('id', site.id)
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
      ;({ error } = await supabase.from('sites').update(payload).eq('id', site.id))
    }
    // 실패했는데 "저장됨"을 띄우면 안 된다. lastSavedRef도 그대로 두어 다음 입력 때 다시 저장을 시도한다.
    if (error) {
      setSavedAt('')
      setAutoSaveError(`저장 실패 — 다시 입력하면 다시 저장합니다 (${error.message})`)
      return
    }
    setAutoSaveError('')
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
        {autoSaveError
          ? <span className="text-[11px] text-danger">{autoSaveError}</span>
          : savedAt && <span className="text-[10px] text-money-positive">저장됨 ({savedAt})</span>}
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

      {/* 3행: 현장대리인 | 현장보조 — 직원 드롭다운 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 퇴사자는 새로 못 고르되, 이미 이 현장의 담당이면 남겨 둔다 —
            빼버리면 칸이 빈칸이 되어 담당자가 지워진 줄 안다. */}
        <Box label="현장대리인">
          <select className={inputCls} value={form.site_manager} onChange={e => u('site_manager', e.target.value)}>
            <option value="">선택</option>
            {staffList.filter(s => !s.resign_date || s.name === form.site_manager)
              .map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </Box>
        <Box label="현장보조">
          <select className={inputCls} value={form.site_assistant} onChange={e => u('site_assistant', e.target.value)}>
            <option value="">선택</option>
            {staffList.filter(s => !s.resign_date || s.name === form.site_assistant)
              .map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
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
//   탭 2: 지출 — 자재 / 노무 / 그 외로 나눠 본다 (2026-10-08 대표)
//   진행 중 현장의 지출은 여기서 보고, 준공서류로 넘어가면 지출관리 「정산」에서 검토한다.
// ===========================
type SiteExpenseRow = {
  id: string
  expense_date: string | null
  title: string | null
  amount: number | null
  category: string | null
  memo: string | null
}

type SpendGroupKey = 'material' | 'labor' | 'other'

const SPEND_GROUPS: { key: SpendGroupKey; label: string; hint: string }[] = [
  { key: 'material', label: '자재', hint: `계정과목 「${MATERIAL_CATEGORY}」` },
  { key: 'labor', label: '노무', hint: `계정과목 「${LABOR_CATEGORY}」` },
  { key: 'other', label: '그 외 경비', hint: '현장경비·식대·교통비 등' },
]

function spendGroupOf(category: string | null): SpendGroupKey {
  if (isLaborCategory(category)) return 'labor'
  if ((category ?? '').trim() === MATERIAL_CATEGORY) return 'material'
  return 'other'
}

function TabExpenses({ site }: { site: Site }) {
  const [rows, setRows] = useState<SiteExpenseRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('expenses').select('id, expense_date, title, amount, category, memo').eq('site_id', site.id).order('expense_date', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setRows((data as SiteExpenseRow[]) || [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [site.id])

  const groups = useMemo(() => {
    const by: Record<SpendGroupKey, SiteExpenseRow[]> = { material: [], labor: [], other: [] }
    for (const r of rows) by[spendGroupOf(r.category)].push(r)
    return by
  }, [rows])
  const sumOf = (list: SiteExpenseRow[]) => list.reduce((s, r) => s + (r.amount || 0), 0)
  const total = sumOf(rows)
  const budget = site.budget || 0
  const left = budget - total
  const usedPct = budget > 0 ? Math.round((total / budget) * 100) : null

  if (loading) return <div className="py-8 text-center text-[13px] text-txt-quaternary">불러오는 중...</div>

  return (
    <div className="space-y-5">
      {/* 한 줄 요약: 계약금액 · 자재 · 노무 · 그 외 · 남은 금액 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SpendStat label="계약금액" value={budget} />
        <SpendStat label="자재" value={sumOf(groups.material)} />
        <SpendStat label="노무" value={sumOf(groups.labor)} />
        <SpendStat label="그 외 경비" value={sumOf(groups.other)} />
        <SpendStat
          label={usedPct === null ? '남은 금액' : `남은 금액 · ${usedPct}% 사용`}
          value={left}
          warn={budget > 0 && usedPct !== null && usedPct >= 80}
        />
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-txt-quaternary">이 현장에 붙은 지출이 없습니다</div>
      ) : (
        SPEND_GROUPS.map(g => {
          const list = groups[g.key]
          return (
            <section key={g.key}>
              <div className="flex items-baseline justify-between border-b border-border-primary pb-1.5">
                <h4 className="text-[13px] font-semibold text-txt-primary">
                  {g.label} <span className="ml-1 text-[11px] font-normal text-txt-tertiary">{g.hint} · {list.length}건</span>
                </h4>
                <span className="text-[13px] font-semibold text-txt-primary tabular-nums">{formatMoney(sumOf(list)) || '0'}원</span>
              </div>
              {list.length === 0 ? (
                <div className="py-3 text-[12px] text-txt-quaternary">없음</div>
              ) : (
                <table className="w-full text-[13px]">
                  <tbody>
                    {list.map(r => {
                      // 계정과목은 노무비가 아닌데 제목이 노무로 보이면 분류를 다시 보라고 표시만 한다 (자동으로 옮기지 않음)
                      const mislabeled = g.key !== 'labor' && looksLikeLabor(laborTextOf(r.title, r.memo))
                      return (
                        <tr key={r.id} className="border-b border-border-tertiary last:border-b-0">
                          <td className="w-[104px] py-2 text-txt-secondary whitespace-nowrap">{r.expense_date || '-'}</td>
                          <td className="py-2 text-txt-primary">
                            {r.title || '-'}
                            {g.key === 'other' && r.category && <span className="ml-2 text-[11px] text-txt-tertiary">{r.category}</span>}
                            {mislabeled && <span className="ml-2 text-[11px] font-medium text-[#b53333]">노무로 보임 · 분류 확인</span>}
                          </td>
                          <td className="w-[140px] py-2 text-right tabular-nums whitespace-nowrap">{formatMoney(r.amount || 0) || '0'}원</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}

function SpendStat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-secondary px-3 py-2.5">
      <div className="text-[11px] text-txt-tertiary">{label}</div>
      <div className={`mt-0.5 text-[14px] font-semibold tabular-nums ${warn ? 'text-[#b53333]' : 'text-txt-primary'}`}>
        {formatMoney(value) || '0'}원
      </div>
    </div>
  )
}
