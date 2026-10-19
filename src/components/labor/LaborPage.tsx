'use client'

import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Download, Upload, FileCheck, ChevronDown, Percent, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import WorkTargetPicker from '@/components/common/WorkTargetPicker'
import { projectLabel, workKindFromIds, type WorkKind, type WorkProjectOption, type WorkSiteOption } from '@/lib/workTarget'
import { groupLaborRows, assertWorkTargetAssigned } from '@/lib/labor/laborGroups'
import LaborSectionHead from './LaborSectionHead'
import LaborLedger from './LaborLedger'
import { DEFAULT_RATES, pickRates, type LaborRates, type LaborRateRow } from '@/lib/labor/rates'
import LaborImportModal from './LaborImportModal'
import { maskResidentId } from '@/lib/labor/mask'
import { laborApprovalDraft } from '@/lib/labor/approvalDraft'
import { STAFF_STORAGE_KEY } from '@/lib/activityLog'
import { toast } from '@/lib/toast'

export { DEFAULT_RATES, type LaborRates }

// --- 타입 ---
export interface LaborRecord {
  id: string
  year: number
  month: number
  worker_name: string
  resident_id: string | null
  phone: string | null
  bank_name: string | null
  account_number: string | null
  day_values: Record<string, number>
  daily_wage: number | null
  vehicle_cost: number | null
  payment_date: string | null
  /** 이 행을 담아 올린 노무비 결의서. 비어 있으면 아직 안 올린 행 (030) */
  expense_report_id: string | null
  /** 공사건 — 입찰/수의 현장 */
  site_id: string | null
  /** 공사건 — 지원사업 접수건 */
  project_id: string | null
  /** 엑셀 양식의 현장명(자유기재). 공사건과 별개로 보존한다 */
  site_name: string | null
  work_type: string | null
  note: string | null
  ded_income_tax: number | null
  ded_resident_tax: number | null
  ded_employment: number | null
  ded_pension: number | null
  ded_health: number | null
  ded_longterm: number | null
  sort_order: number
  created_at: string
}

interface WorkerInfo {
  worker_name: string
  resident_id: string | null
  phone: string | null
  bank_name: string | null
  account_number: string | null
}

// 그 달에 적용되는 요율 (요율 설정 화면에서 정한 "적용 시작월" 기준)
export async function loadLaborRates(year: number, month: number): Promise<LaborRates> {
  const { data } = await supabase.from('labor_rates').select('year, month, rates')
  return pickRates((data ?? []) as LaborRateRow[], year, month)
}

// --- 공제 계산 (요율 기반 자동산출, 수동값 있으면 우선) ---
const roundDown10 = (n: number) => Math.floor(n / 10) * 10

export function calcRow(r: LaborRecord, rates: LaborRates) {
  const workDays = Object.values(r.day_values || {}).reduce((s, v) => s + (Number(v) || 0), 0)
  const wage = r.daily_wage || 0
  const total = Math.round(workDays * wage)
  // 소득세: (일급-150,000)×요율, 일 세액 1,000원 미만 소액부징수, 10원 절사
  const dailyTax = Math.max(0, wage - 150000) * (rates.income / 100)
  const autoIncome = dailyTax < 1000 ? 0 : roundDown10(dailyTax * workDays)
  const income = r.ded_income_tax ?? autoIncome
  const resident = r.ded_resident_tax ?? roundDown10(income * (rates.resident / 100))
  const employment = r.ded_employment ?? roundDown10(total * (rates.employment / 100))
  const pension = r.ded_pension ?? roundDown10(total * (rates.pension / 100))
  const health = r.ded_health ?? roundDown10(total * (rates.health / 100))
  const longterm = r.ded_longterm ?? roundDown10(health * (rates.longterm / 100))
  const dedSum = income + resident + employment + pension + health + longterm
  return { workDays, total, income, resident, employment, pension, health, longterm, dedSum, netPay: total - dedSum }
}

const fmt = (n: number) => (n ? n.toLocaleString() : '')

// 표 열 너비(비율). 가로 스크롤 없이 한 화면에 들어오도록 표 폭에 맞춰 나눈다.
// 체크 | 근무자 | 주민번호·연락처 | 은행·계좌 | 날짜 16칸 | 일수·일급 | 총지급액 | 공제 3칸 | 공제합계 | 실지급액 | 지급일·현장명 | 공종·비고 | 삭제
const COL_WIDTHS = [24, 68, 122, 112, ...Array<number>(16).fill(24), 58, 66, 58, 58, 58, 56, 66, 74, 62, 22]
const COL_TOTAL = COL_WIDTHS.reduce((a, b) => a + b, 0)

// 타이핑이 멎고 이만큼 지나면 DB에 쓴다 (키 입력마다 쏘지 않으려고)
const SAVE_DELAY = 600

// --- 요율 헤더 표시 (수정은 요율 설정 화면에서) ---
function RateLabel({ value }: { value: number }) {
  return <span className="text-[9px] text-accent-text font-semibold">{value}%</span>
}

// --- 공용 셀 input ---
// 타이핑하는 즉시 상위로 올려보낸다(=합계가 바로 따라온다). 예전에는 blur에서만
// 올려서, 숫자를 치고 합계만 쳐다보거나 다른 창으로 넘어가면 입력이 조용히 사라졌다.
// 편집 중에는 사용자가 친 원문(draft)을 그대로 두고, 칸을 벗어나면 정규화된
// 표시값("-5,000")으로 돌아간다. 타이핑 도중 표시값이 끼어들면 커서가 튀기 때문.
function CellInput({ value, onSave, onReset, className = '', align = 'left', placeholder = '', mask }: {
  value: string
  onSave: (v: string, flush?: boolean) => void
  onReset?: () => void   // Esc — 수기값을 버리고 요율 자동계산으로 되돌린다
  className?: string
  align?: 'left' | 'center' | 'right'
  placeholder?: string
  /** 칸을 누르지 않았을 때 보여줄 모양(주민번호 가리기 등). 저장 값은 바꾸지 않는다. */
  mask?: (v: string) => string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const shown = draft ?? (mask && !focused ? mask(value) : value)
  return (
    <input
      type="text" value={shown} placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onChange={e => { setDraft(e.target.value); onSave(e.target.value) }}
      onBlur={e => { setFocused(false); const typed = draft !== null; setDraft(null); if (typed) onSave(e.target.value, true) }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        // draft를 비워 두면 이후 blur가 저장을 건너뛰므로 되돌린 값이 그대로 남는다
        else if (e.key === 'Escape' && onReset) { setDraft(null); onReset() }
      }}
      className={`w-full min-w-0 bg-transparent outline-none text-[12px] px-0.5 py-0.5 focus:bg-accent-light rounded text-${align} ${className}`}
    />
  )
}

// --- 메인 ---
export default function LaborPage() {
  const router = useRouter()
  const now = new Date()
  // 년/월 고르는 칸은 없앴다(2026-10-15). 새로 만드는 줄의 기본 달로만 쓴다 —
  // 묶음에 이미 줄이 있으면 그 줄의 달을 따른다.
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const [records, setRecords] = useState<LaborRecord[]>([])
  const [workers, setWorkers] = useState<WorkerInfo[]>([])
  const [rates, setRates] = useState<LaborRates>(DEFAULT_RATES)
  const [loading, setLoading] = useState(true)
  /** draft = 결의서 만드는 작업대 · ledger = 승인된 노무비 대장 */
  const [tab, setTab] = useState<'draft' | 'ledger'>('draft')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [nameDropdown, setNameDropdown] = useState<string | null>(null) // 열려있는 근무자 드롭다운의 record id
  const [exporting, setExporting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // 공사건 고르기 — 섹션 추가 / 행 옮기기 / 엑셀 불러오기에 쓰는 임시 선택.
  // 예전에는 화면 전체에 공사건 하나였다. 이제 공사건은 행에 저장된다(028).
  // at — 피커를 띄울 자리. 'top'(체크한 행 옮기기·엑셀 불러오기) · 'bottom'(공사건 추가) · 섹션 key(공사건 바꾸기)
  const [picker, setPicker] = useState<null | { mode: 'add' | 'assign' | 'import'; rowIds?: string[]; at: 'top' | 'bottom' | string }>(null)
  const [pickKind, setPickKind] = useState<WorkKind>('')
  const [pickSiteId, setPickSiteId] = useState('')
  const [pickProjectId, setPickProjectId] = useState('')
  const [importTarget, setImportTarget] = useState<{ site_id: string | null; project_id: string | null } | null>(null)
  /** 어느 달 묶음으로 불러오는 중인지 — 엑셀의 달과 다르면 경고한다 */
  const [importPeriod, setImportPeriod] = useState<{ year: number; month: number } | null>(null)
  const [sites, setSites] = useState<WorkSiteOption[]>([])
  const [projects, setProjects] = useState<WorkProjectOption[]>([])
  const [importFile, setImportFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pendingPatch = useRef(new Map<string, Partial<LaborRecord>>())
  /** 빈 달에 기본 근무자 줄을 만든 달 (중복 생성 방지) */
  const autoRowFor = useRef<string | null>(null)
  /** 끌어다 놓은 엑셀 — 공사건을 고른 뒤 그대로 불러오기로 넘긴다 */
  const droppedFile = useRef<File | null>(null)
  const [dragOver, setDragOver] = useState(false)


  // --- 데이터 로드 ---
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    // 작업대는 「아직 결의서로 안 올린 행」만 본다. 달은 가리지 않는다 —
    // 년/월 고르는 칸을 없앴고(2026-10-15), 올린 행은 근무지출관리 탭으로 넘어간다.
    const { data, error } = await supabase.from('labor_records').select('*')
      .is('expense_report_id', null)
      .order('year').order('month').order('sort_order').order('created_at')
    if (!error && data) {
      // 빈 달이면 근무자 한 줄을 미리 만들어 둔다 — 들어오자마자 바로 칠 수 있게.
      // 지난 달을 둘러보기만 해도 빈 행이 생겨 쓰레기가 쌓였다(2026-10-15). 이번 달에만 만든다.
      // 같은 달에 두 번 만들지 않도록 ref로 막는다(개발 모드에서 이펙트가 두 번 도는 것 포함).
      const key = `${year}-${month}`
      if (data.length === 0 && autoRowFor.current !== key) {
        autoRowFor.current = key
        const { data: made } = await supabase.from('labor_records')
          .insert({ year, month, worker_name: '', day_values: {}, sort_order: 0 })
          .select().single()
        setRecords(made ? [made as LaborRecord] : [])
        // 들어오자마자 공사건부터 고르게 — 빈 달은 공사건 고르는 칸을 열어 둔다
        if (made) setPicker({ mode: 'assign', rowIds: [(made as LaborRecord).id], at: 'none' })
      } else {
        setRecords(data as LaborRecord[])
      }
    }
    setChecked(new Set())
    setLoading(false)
  }, [year, month])

  // 근무자 정보 자동 저장분: 전체 기록에서 이름별 최신 정보 추출
  const fetchWorkers = useCallback(async () => {
    const { data, error } = await supabase.from('labor_records')
      .select('worker_name, resident_id, phone, bank_name, account_number, created_at')
      .neq('worker_name', '').order('created_at', { ascending: false })
    if (!error && data) {
      const seen = new Map<string, WorkerInfo>()
      data.forEach(w => { if (!seen.has(w.worker_name)) seen.set(w.worker_name, w) })
      setWorkers([...seen.values()].sort((a, b) => a.worker_name.localeCompare(b.worker_name, 'ko')))
    }
  }, [])

  const fetchRates = useCallback(async () => {
    setRates(await loadLaborRates(year, month))
  }, [year, month])


  useEffect(() => { fetchRecords() }, [fetchRecords])
  useEffect(() => { fetchWorkers() }, [fetchWorkers])
  useEffect(() => { fetchRates() }, [fetchRates])
  useEffect(() => {
    supabase.from('sites').select('id, name, contract_type, status').order('name').then(({ data }) => {
      setSites((data ?? []) as WorkSiteOption[])
    })
    supabase.from('projects').select('id, building_name, ho, dong').order('created_at', { ascending: false }).then(({ data }) => {
      setProjects((data ?? []) as WorkProjectOption[])
    })
  }, [])

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setNameDropdown(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // --- 저장 (화면 즉시 갱신 + DB write는 묶어서) ---
  // 화면 값(=합계)은 타이핑 즉시 바뀌고, DB 쓰기만 SAVE_DELAY 만큼 모았다 보낸다.
  // 셀에서 포커스가 빠지면(flush) 기다리지 않고 바로 쓴다.
  const patchRecord = useCallback((id: string, patch: Partial<LaborRecord>, flush = false) => {
    setRecords(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
    pendingPatch.current.set(id, { ...(pendingPatch.current.get(id) || {}), ...patch })

    const write = async () => {
      saveTimers.current.delete(id)
      const body = pendingPatch.current.get(id)
      pendingPatch.current.delete(id)
      if (!body || Object.keys(body).length === 0) return
      const { error } = await supabase.from('labor_records').update(body).eq('id', id)
      if (error) toast.error(`저장 실패: ${error.message}`)
    }

    const timer = saveTimers.current.get(id)
    if (timer) clearTimeout(timer)
    if (flush) write()
    else saveTimers.current.set(id, setTimeout(write, SAVE_DELAY))
  }, [])

  // 남은 저장분을 즉시 밀어낸다 (탭 전환·페이지 이탈·언마운트).
  const flushPending = useCallback(() => {
    saveTimers.current.forEach(t => clearTimeout(t))
    saveTimers.current.clear()
    pendingPatch.current.forEach((body, id) => {
      if (body && Object.keys(body).length > 0) {
        supabase.from('labor_records').update(body).eq('id', id)
          .then(({ error }) => { if (error) console.error('노무비 저장 실패:', error) })
      }
    })
    pendingPatch.current.clear()
  }, [])

  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === 'hidden') flushPending() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', flushPending)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', flushPending)
      flushPending()
    }
  }, [flushPending])

  const addRow = async (target?: { site_id: string | null; project_id: string | null; year?: number; month?: number }) => {
    const { data, error } = await supabase.from('labor_records')
      .insert({
        // 달은 그 묶음의 달을 따른다. 묶음이 없으면(새로 만드는 중) 이번 달.
        year: target?.year ?? year, month: target?.month ?? month,
        worker_name: '', day_values: {}, sort_order: records.length,
        site_id: target?.site_id ?? null, project_id: target?.project_id ?? null,
      })
      .select().single()
    if (error) { toast.error(`행 추가 실패: ${error.message}`); return }
    setRecords(prev => [...prev, data as LaborRecord])
  }

  const deleteRow = async (id: string) => {
    if (!confirm('이 근무자 행을 삭제하시겠습니까?')) return
    // 삭제한 행에 밀린 저장분이 남아 뒤늦게 나가지 않도록 먼저 버린다
    const timer = saveTimers.current.get(id)
    if (timer) clearTimeout(timer)
    saveTimers.current.delete(id)
    pendingPatch.current.delete(id)
    const { error } = await supabase.from('labor_records').delete().eq('id', id)
    if (error) { toast.error(`삭제 실패: ${error.message}`); return }
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  // 기존 근무자 선택 → 인적사항 자동 입력
  const pickWorker = (id: string, w: WorkerInfo) => {
    patchRecord(id, {
      worker_name: w.worker_name, resident_id: w.resident_id, phone: w.phone,
      bank_name: w.bank_name, account_number: w.account_number,
    }, true)
    setNameDropdown(null)
  }

  // 날짜 셀 값 변경
  const setDayValue = (r: LaborRecord, day: number, raw: string, flush = false) => {
    const v = parseFloat(raw)
    const next = { ...(r.day_values || {}) }
    if (!raw.trim() || isNaN(v) || v === 0) delete next[String(day)]
    else next[String(day)] = v
    patchRecord(r.id, { day_values: next }, flush)
  }

  // 공제 수동값. 칸을 비우면 요율과 무관하게 0(공제 안 함)으로 확정한다.
  // 요율 자동계산으로 되돌리려면 그 칸에서 Esc (→ resetDeduction).
  const setDeduction = (r: LaborRecord, field: keyof LaborRecord, raw: string, flush = false) => {
    const v = Number(raw.replace(/[^\d]/g, ''))   // '' → 0
    patchRecord(r.id, { [field]: v } as Partial<LaborRecord>, flush)
  }

  // 수기값을 버리고 요율 자동계산으로 복귀 (null = 자동)
  const resetDeduction = (r: LaborRecord, field: keyof LaborRecord) => {
    patchRecord(r.id, { [field]: null } as Partial<LaborRecord>, true)
  }

  const toggleCheck = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  // 전체선택은 이름이 있는 줄만 잡는다. 공사건을 만들 때 생기는 빈 줄까지 잡히면
  // 「이름이 비어 있는 근무자가 있습니다」로 결의서 만들기가 막힌다(2026-10-19).
  // 빈 줄도 직접 체크하면 선택은 된다.
  const selectableIds = useMemo(
    () => records.filter(r => r.worker_name?.trim()).map(r => r.id),
    [records],
  )
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => checked.has(id))
  const toggleAll = () => {
    setChecked(allSelected ? new Set() : new Set(selectableIds))
  }

  const checkedRecords = records.filter(r => checked.has(r.id))

  // 공사건 섹션 (미지정은 맨 뒤)
  const groups = useMemo(() => groupLaborRows(records, { byPeriod: true }), [records])

  /** 공사건 이름 — 섹션 머리줄과 결의서 제목에 쓴다 */
  const targetName = useCallback((site_id: string | null, project_id: string | null): string => {
    if (site_id) return sites.find(x => x.id === site_id)?.name?.trim() || '현장'
    if (project_id) {
      const p = projects.find(x => x.id === project_id)
      return p ? projectLabel(p) : '지원사업'
    }
    return '공사건 미지정'
  }, [sites, projects])

  /** 고른 공사건으로 행들을 옮긴다. 잘못 넣은 행 복구와 기존 미지정 행 일괄 지정을 겸한다. */
  const assignRows = (rowIds: string[], site_id: string | null, project_id: string | null) => {
    for (const id of rowIds) patchRecord(id, { site_id, project_id }, true)
    setChecked(new Set())
    toast.success(`${rowIds.length}개 행을 「${targetName(site_id, project_id)}」(으)로 옮겼습니다.`)
  }

  const closePicker = () => {
    setPicker(null); setPickKind(''); setPickSiteId(''); setPickProjectId('')
    droppedFile.current = null
  }

  /** 엑셀을 끌어다 놓으면 — 어느 공사건으로 넣을지부터 고른다 */
  const handleDropExcel = (f: File | undefined) => {
    setDragOver(false)
    if (!f) return
    if (!/\.xlsx$/i.test(f.name)) { toast.error('.xlsx 파일만 불러올 수 있습니다. (.xls는 엑셀에서 .xlsx로 다시 저장해 주세요)'); return }
    droppedFile.current = f
    setPicker({ mode: 'import', at: 'top' })
  }

  /** 공사건을 고르면 용도에 따라 — 섹션 추가 / 행 옮기기 / 엑셀 불러오기로 이어진다 */
  const handlePick = (next: { kind: WorkKind; siteId: string; projectId: string }) => {
    const site_id = next.siteId || null
    const project_id = next.projectId || null
    if (!site_id && !project_id) return
    const mode = picker?.mode
    const rowIds = picker?.rowIds ?? []
    closePicker()
    if (mode === 'add') {
      const already = records.some(r => (r.site_id ?? null) === site_id && (r.project_id ?? null) === project_id)
      if (already) { toast.info(`「${targetName(site_id, project_id)}」 묶음이 이미 있습니다.`); return }
      addRow({ site_id, project_id })
    } else if (mode === 'assign') {
      assignRows(rowIds, site_id, project_id)
    } else if (mode === 'import') {
      // 불러온 행에 이 공사건을 넣는다. 파일은 끌어다 놓은 게 있으면 그것, 없으면 골라서.
      setImportTarget({ site_id, project_id })
      flushPending()
      const dropped = droppedFile.current
      droppedFile.current = null
      if (dropped) setImportFile(dropped)
      else fileInputRef.current?.click()
    }
  }

  // --- 엑셀 불러오기: 저장이 끝나면 그 파일의 달로 화면을 옮긴다 ---
  const handleImported = async (y: number, m: number, count: number) => {
    const target = importTarget
    setImportFile(null)

    // 공사건을 만들 때 자리만 잡아둔 빈 줄은 지운다 — 불러온 사람만 남게.
    // 더 넣을 사람이 있으면 「근무자 추가」로 줄을 만든다.
    if (count > 0 && target) {
      const { data: pending } = await supabase.from('labor_records')
        .select('id, worker_name, daily_wage, day_values, site_id, project_id')
        .eq('year', y).eq('month', m).is('expense_report_id', null)
      const blanks = (pending ?? []).filter(r =>
        (r.site_id ?? null) === target.site_id &&
        (r.project_id ?? null) === target.project_id &&
        !String(r.worker_name ?? '').trim() &&
        !r.daily_wage &&
        Object.keys((r.day_values ?? {}) as Record<string, number>).length === 0)
      if (blanks.length > 0) await supabase.from('labor_records').delete().in('id', blanks.map(r => r.id))
    }

    setImportTarget(null)
    fetchRecords()
    fetchRates()
    fetchWorkers()
    toast.success(`${y}년 ${m}월에 ${count}줄을 불러왔습니다.`)
  }

  // --- 엑셀 저장 (체크된 근무자) ---
  const handleExport = async () => {
    if (checkedRecords.length === 0) { toast.info('엑셀로 저장할 근무자를 체크해주세요.'); return }
    setExporting(true)
    try {
      const res = await fetch('/api/labor/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 체크한 전체가 한 시트로 나간다(통합 저장). 공사건은 현장명 열로 구분되게,
        // 공사건이 지정된 행은 그 이름을 현장명으로 써서 보낸다 — 엑셀 양식에 현장 칸이 하나뿐이다.
        body: JSON.stringify({
          year, month, rates,
          records: checkedRecords.map(r => ({
            ...r,
            site_name: r.site_id || r.project_id ? targetName(r.site_id, r.project_id) : r.site_name,
          })),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `노무비지급내역_${month}월.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(`엑셀 저장 실패: ${err instanceof Error ? err.message : err}`)
    } finally { setExporting(false) }
  }

  // --- 노무비 결의서 만들기 (한 장, 공사건별 지급표) ---
  // 대표 결정(2026-10-09): 노무비도 지출결의서 결재를 거친다. 여기서는 작성중 결의서만
  // 만들고, 상신은 결의서를 열어 사람이 한다 — 증빙 첨부와 내용 확인을 거치게.
  // 공사건이 여럿이어도 문서는 한 장이다(2026-10-15). 지급줄마다 공사건을 달아(029)
  // 작성 화면이 공사건별로 묶어 보여주고, 승인 시 지출은 줄의 공사건으로 등록된다.
  const handleCreateDraft = async (rows: LaborRecord[]) => {
    const actorId = typeof window !== 'undefined' ? localStorage.getItem(STAFF_STORAGE_KEY) : null
    if (!actorId) { toast.info('지금 쓰는 직원이 정해져 있지 않습니다. 지출결의서 화면 위쪽에서 직원을 먼저 골라 주세요.'); return }
    if (rows.length === 0) { toast.info('결의서를 만들 근무자를 체크해 주세요.'); return }

    const assigned = assertWorkTargetAssigned(rows)
    if (!assigned.ok) { toast.error(assigned.error); return }

    // 결의서는 달 단위다. 작업대에 여러 달이 섞여 있으므로 한 달씩만 올린다.
    const periods = [...new Set(rows.map(r => `${r.year}-${r.month}`))]
    if (periods.length > 1) {
      toast.error(`달이 다른 근무표가 섞여 있습니다(${periods.join(', ')}). 한 달씩 올려 주세요.`)
      return
    }
    const docYear = rows[0].year
    const docMonth = rows[0].month

    flushPending()
    const today = new Date().toISOString().slice(0, 10)
    const built = laborApprovalDraft({
      year: docYear, month: docMonth, today,
      lines: rows.map(r => {
        const c = calcRow(r, rates)
        return {
          worker_name: r.worker_name || '',
          netPay: c.netPay,
          bank_name: r.bank_name,
          account_number: r.account_number,
          payment_date: r.payment_date,
          detail: `${r.worker_name}: ${c.workDays}일 × ${fmt(r.daily_wage || 0)}원 = ${fmt(c.total)}원, 공제 ${fmt(c.dedSum)}원, 실지급 ${fmt(c.netPay)}원`,
          workTargetName: targetName(r.site_id ?? null, r.project_id ?? null),
          site_id: r.site_id ?? null,
          project_id: r.project_id ?? null,
        }
      }),
    })
    if (!built.ok) { toast.error(built.error); return }
    const draft = built.draft

    // 같은 묶음을 두 번 누르면 결의서가 두 장 생긴다. 이미 있으면 한 번 더 묻는다.
    const { data: dup } = await supabase.from('expense_reports').select('title').eq('title', draft.title).limit(1)
    if (dup && dup.length > 0
      && !confirm(`같은 제목의 지출결의서가 이미 있습니다.\n${draft.title}\n\n그래도 새로 만들까요?`)) return

    // 확인창에 공사건별 금액과 총 합계를 보여준다
    const byTarget = new Map<string, { sum: number; n: number }>()
    for (const pay of draft.payments) {
      const g = byTarget.get(pay.work_target_label) ?? { sum: 0, n: 0 }
      g.sum += pay.amount; g.n += 1
      byTarget.set(pay.work_target_label, g)
    }
    const total = draft.payments.reduce((sum, pay) => sum + pay.amount, 0)
    const summary = [...byTarget.entries()]
      .map(([name, g], i) => `  ${i + 1}. ${name}  ${g.sum.toLocaleString()}원 (${g.n}명)`)
      .join('\n')
    const totalLine = byTarget.size > 1 ? `\n  총 합계 ${total.toLocaleString()}원 (${draft.payments.length}명)` : ''
    if (!confirm(`노무비 지출결의서를 만듭니다.\n\n${summary}${totalLine}\n\n만든 뒤 결의서에서 내용을 확인하고 「결재 올리기」를 눌러 주세요.\n결재가 끝나면 지출관리에 자동으로 들어갑니다.`)) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/approval/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor_staff_id: actorId, title: draft.title, body_html: draft.body_html,
          site_id: draft.site_id, project_id: draft.project_id,
          payments: draft.payments, lines: [], files: [],
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(`결의서를 만들지 못했습니다: ${json.error || res.statusText}`); return }

      // 올린 근무표 행에 문서를 적어 둔다 — 작업대에서 빠지고 근무지출관리로 넘어간다
      const { error: linkErr } = await supabase.from('labor_records')
        .update({ expense_report_id: json.id }).in('id', rows.map(r => r.id))
      if (linkErr) toast.error(`근무표를 결의서에 잇지 못했습니다: ${linkErr.message} — 결의서는 만들어졌습니다.`)
      else setRecords(prev => prev.filter(r => !rows.some(x => x.id === r.id)))

      router.push(`/approval/${json.id}/edit`)
    } finally {
      setSubmitting(false)
    }
  }

  /** 상단 버튼 — 체크된 행 전부를 한 장으로 */
  const handleSubmitApproval = () => handleCreateDraft(checkedRecords)

  // --- 합계 ---
  const totals = useMemo(() => {
    return records.reduce((acc, r) => {
      const c = calcRow(r, rates)
      acc.total += c.total; acc.dedSum += c.dedSum; acc.netPay += c.netPay
      return acc
    }, { total: 0, dedSum: 0, netPay: 0 })
  }, [records, rates])

  // 공사건 고르기 패널. 섹션 머리줄·표 아래·상단 — picker.at 이 가리키는 자리에서 그려진다.
  // 예전에는 어디서 눌러도 화면 맨 위에 떠서, 누른 자리와 멀어 헷갈렸다.
  const pickerPanel = () => {
    if (!picker) return null
    const title = picker.mode === 'add' ? '어느 공사건을 추가할까요?'
      : picker.mode === 'import' ? '어느 공사건으로 불러올까요? (고르면 파일 선택이 열립니다)'
      : picker.at === 'top' ? `선택한 ${picker.rowIds?.length ?? 0}개 행을 어느 공사건으로 옮길까요?`
      : '이 묶음을 어느 공사건으로 바꿀까요?'
    return (
      <div className="rounded-[10px] border border-accent bg-surface p-3 space-y-2 text-left">
        <div className="flex items-center justify-between gap-2">
          <b className="text-[13px] text-txt-primary">{title}</b>
          <button type="button" onClick={closePicker} className="text-[12px] text-txt-tertiary hover:text-txt-secondary">취소</button>
        </div>
        <WorkTargetPicker
          compact
          oneLine
          kind={pickKind}
          siteId={pickSiteId}
          projectId={pickProjectId}
          sites={sites}
          projects={projects}
          onChange={next => {
            setPickKind(next.kind || workKindFromIds(next.siteId, next.projectId))
            setPickSiteId(next.siteId)
            setPickProjectId(next.projectId)
            handlePick(next)
          }}
        />
      </div>
    )
  }

  const days1 = Array.from({ length: 15 }, (_, i) => i + 1)
  const days2 = Array.from({ length: 16 }, (_, i) => i + 16)

  const thCls = 'border border-border-primary px-1 py-1.5 text-[11px] font-medium text-txt-tertiary bg-surface-secondary text-center whitespace-nowrap'
  const tdCls = 'border border-border-tertiary px-0.5 py-0.5 text-[12px]'

  return (
    <div className="md:p-6 space-y-5">
      {importFile && (
        <LaborImportModal
          file={importFile}
          workTarget={importTarget}
          workTargetName={importTarget ? targetName(importTarget.site_id, importTarget.project_id) : undefined}
          viewYear={importPeriod?.year ?? year}
          viewMonth={importPeriod?.month ?? month}
          onClose={() => { setImportFile(null); setImportTarget(null) }}
          onImported={handleImported}
        />
      )}
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">일용직 근무관리</h1>
        <div className={`items-center gap-2 flex-wrap ${tab === 'draft' ? 'flex' : 'hidden'}`}>
          <Link href="/labor/rates"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-surface border border-border-primary rounded-lg hover:bg-surface-tertiary transition">
            <Percent size={15} className="text-txt-tertiary" />
            요율 설정
          </Link>
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden"
            onChange={e => { setImportFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
          <button onClick={() => setPicker({ mode: 'import', at: 'top' })}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-surface border border-border-primary rounded-lg hover:bg-surface-tertiary transition">
            <Upload size={15} className="text-txt-tertiary" />
            엑셀 불러오기
          </button>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); handleDropExcel(e.dataTransfer.files?.[0]) }}
            className={`flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm transition ${
              dragOver ? 'border-accent bg-accent-light text-accent-text' : 'border-border-secondary text-txt-tertiary'
            }`}
          >
            <Upload size={14} />
            엑셀 끌어다 놓기
          </div>
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-surface border border-border-primary rounded-lg hover:bg-surface-tertiary transition disabled:opacity-50">
            <Download size={15} className="text-txt-tertiary" />
            {exporting ? '생성 중...' : '엑셀 저장'}
          </button>
          <button onClick={handleSubmitApproval} disabled={submitting}
            className="btn-primary flex items-center gap-1.5 whitespace-nowrap">
            <FileCheck size={15} />
            {submitting ? '만드는 중...' : '노무비 결의서 만들기'}
          </button>
        </div>
      </div>

      {/* 탭 — 왼쪽은 결의서를 만드는 작업대, 오른쪽은 승인된 것이 쌓이는 대장 */}
      <div className="inline-flex rounded-lg bg-surface-secondary p-1">
        {([['draft', '결의서 만들기'], ['ledger', '근무지출관리']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-sm rounded-md transition ${tab === key ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-secondary'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'ledger' ? <LaborLedger /> : (
      <>
      {/* 요약 — 달은 묶음 머리줄에 적힌다. 작업대에는 아직 안 올린 행만 있다 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-txt-tertiary">아직 결의서로 올리지 않은 근무표입니다. 결의서를 만들면 「근무지출관리」로 넘어갑니다.</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-txt-tertiary">총지급액 <b className="text-txt-primary tabular-nums">{fmt(totals.total)}</b>원</span>
          <span className="text-txt-tertiary">공제 <b className="text-txt-primary tabular-nums">{fmt(totals.dedSum)}</b>원</span>
          <span className="text-txt-tertiary">실지급 <b className="text-accent-text tabular-nums">{fmt(totals.netPay)}</b>원</span>
        </div>
      </div>

      {/* 공사건 고르기 — 부른 자리에서 뜬다. 상단은 체크한 행 옮기기·엑셀 불러오기용 */}
      {picker?.at === 'top' && pickerPanel()}

      {/* 체크한 행을 다른 공사건으로 옮긴다 — 잘못 넣은 행 복구와 기존 미지정 행 일괄 지정 */}
      {checked.size > 0 && !picker && (
        <div className="flex items-center gap-2 flex-wrap rounded-[10px] border border-border-primary bg-surface-secondary px-3 py-2">
          <span className="text-[13px] text-txt-secondary">
            선택한 <b className="text-txt-primary">{checked.size}</b>개 행
          </span>
          <button type="button" onClick={() => setPicker({ mode: 'assign', rowIds: [...checked], at: 'top' })}
            className="inline-flex items-center gap-1 rounded-md border border-border-primary bg-surface px-2 py-1 text-[12px] text-txt-secondary hover:bg-surface-tertiary transition">
            <ArrowRight size={13} /> 공사건으로 옮기기
          </button>
        </div>
      )}

      {/* 31칸짜리 표라 폰에서는 칸을 짚기도 어렵다. 안 되는 이유를 모른 채 애쓰지 않게 미리 알린다. */}
      <p className="md:hidden rounded-lg bg-surface-secondary px-3 py-2 text-[13px] text-txt-secondary">
        근무표 입력은 PC에서 해 주세요. 폰에서는 보기만 권장합니다.
      </p>

      {/* 명세서 그리드 */}
      <div className="bg-surface border border-border-primary rounded-[10px] overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-txt-tertiary">로딩 중...</div>
        ) : (
          <table className="border-collapse table-fixed w-full min-w-[1180px]">
            <colgroup>
              {COL_WIDTHS.map((w, i) => <col key={i} style={{ width: `${(w / COL_TOTAL) * 100}%` }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className={thCls} rowSpan={2}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th className={thCls} rowSpan={2}>근무자</th>
                <th className={thCls}>주민등록번호</th>
                <th className={thCls}>은행명</th>
                {days1.map(d => <th key={d} className={`${thCls} px-0!`}>{d}</th>)}
                <th className={thCls}></th>
                <th className={thCls}>일수</th>
                <th className={thCls} rowSpan={2}>총지급액</th>
                <th className={thCls}>소득세<br /><RateLabel value={rates.income} /></th>
                <th className={thCls}>국민연금<br /><RateLabel value={rates.pension} /></th>
                <th className={thCls}>건강보험<br /><RateLabel value={rates.health} /></th>
                <th className={thCls} rowSpan={2}>공제합계</th>
                <th className={thCls} rowSpan={2}>실 지급액</th>
                <th className={thCls}>지급일</th>
                <th className={thCls}>공종</th>
                <th className={thCls} rowSpan={2}></th>
              </tr>
              <tr>
                <th className={thCls}>연락처</th>
                <th className={thCls}>계좌번호</th>
                {days2.map(d => <th key={d} className={`${thCls} px-0!`}>{d}</th>)}
                <th className={thCls}>일급</th>
                <th className={thCls}>주민세<br /><RateLabel value={rates.resident} /></th>
                <th className={thCls}>고용보험<br /><RateLabel value={rates.employment} /></th>
                <th className={thCls}>장기요양<br /><RateLabel value={rates.longterm} /></th>
                <th className={thCls}>현장명</th>
                <th className={thCls}>비고</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={COL_WIDTHS.length} className="text-center py-12 text-txt-quaternary text-sm">등록된 근무자가 없습니다. 아래 [+ 공사건 추가]로 시작해 주세요.</td></tr>
              ) : groups.map(g => {
                const site_id = g.rows[0].site_id ?? null
                const project_id = g.rows[0].project_id ?? null
                const assigned = g.kind !== 'none'
                const groupNetPay = g.rows.reduce((sum, row) => sum + calcRow(row, rates).netPay, 0)
                // 달은 묶음마다 다르다 — 날짜 칸(1~31)도 그 달 기준으로 막는다
                const gYear = g.year ?? year
                const gMonth = g.month ?? month
                const gDays = new Date(gYear, gMonth, 0).getDate()
                return (
                  <Fragment key={g.key}>
                    <LaborSectionHead
                      colSpan={COL_WIDTHS.length}
                      period={`${gYear}년 ${gMonth}월`}
                      label={targetName(site_id, project_id)}
                      sourceLabel={!assigned ? null
                        : g.kind === 'project' ? '지원사업'
                        : (sites.find(x => x.id === site_id)?.contract_type || '현장')}
                      count={g.rows.length}
                      netPay={groupNetPay}
                      assigned={assigned}
                      busy={submitting}
                      onAddWorker={() => addRow({ site_id, project_id, year: gYear, month: gMonth })}
                      onImport={() => { setImportTarget({ site_id, project_id }); setImportPeriod({ year: gYear, month: gMonth }); flushPending(); fileInputRef.current?.click() }}
                      onMove={() => setPicker({ mode: 'assign', rowIds: g.rows.map(row => row.id), at: g.key })}
                      picker={picker?.at === g.key ? pickerPanel() : null}
                      onDraft={() => handleCreateDraft(g.rows)}
                    />
                    {g.rows.map(r => {
                      const c = calcRow(r, rates)
                      return (
                        <FragmentRow key={r.id} r={r} c={c} daysInMonth={gDays} days1={days1} days2={days2}
                          tdCls={tdCls} checked={checked.has(r.id)} toggleCheck={toggleCheck}
                          nameDropdown={nameDropdown} setNameDropdown={setNameDropdown} dropdownRef={dropdownRef}
                          workers={workers} pickWorker={pickWorker} patchRecord={patchRecord}
                          setDayValue={setDayValue} setDeduction={setDeduction} resetDeduction={resetDeduction} deleteRow={deleteRow} />
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {picker?.at === 'bottom' ? (
        <div className="max-w-xl">{pickerPanel()}</div>
      ) : (
        <button onClick={() => setPicker({ mode: 'add', at: 'bottom' })}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-dashed border-border-secondary text-txt-tertiary rounded-lg hover:border-accent hover:text-accent-text transition">
          <Plus size={15} /> 공사건 추가
        </button>
      )}

      <p className="text-xs text-txt-quaternary leading-relaxed">
        · 공제 6종은 표 머리글에 보이는 요율대로 자동 산출되어 -금액으로 표시됩니다. 요율은 위 <b>요율 설정</b>에서 고칩니다.<br />
        · 칸에 금액을 직접 치면 <b>타이핑하는 즉시</b> 공제합계·실지급액·상단 합계가 다시 계산되고 저장됩니다.<br />
        · 소득세는 일급 15만원 초과분 × 요율(일 세액 1,000원 미만 소액부징수), 주민세는 소득세 × 요율, 장기요양은 건강보험 × 요율, 나머지는 총지급액 × 요율 기준입니다.<br />
        · 공제 대상이 아닌 근무자는 <b>해당 칸을 비우고 Enter</b>(또는 0 입력) → 요율과 무관하게 0으로 확정됩니다.<br />
        · 그 칸에서 <b>Esc</b>를 누르면 수기값을 버리고 다시 요율 자동계산으로 돌아갑니다(회색 글씨 = 자동, 진한 글씨 = 수기).<br />
        · 근무자 이름을 클릭하면 이전에 등록한 작업자를 선택할 수 있고, 주민등록번호/연락처/은행/계좌가 자동 입력됩니다.<br />
        · <b>공사건 추가</b>로 묶음을 만들고, 그 묶음의 <b>엑셀 불러오기</b>로 근무자를 채웁니다. 불러온 행에는 그 공사건이 자동으로 들어갑니다.<br />
        · <b>노무비 결의서 만들기</b>는 체크한 행을 공사건별로 묶어 결의서를 한 장씩 만듭니다(결의서는 공사건 하나만 담을 수 있습니다). 상신은 결의서를 열어서 합니다.<br />
        · <b>엑셀 저장</b>은 체크한 전체를 통합 한 시트로 내립니다. 공사건은 현장명 칸으로 구분됩니다.
      </p>
      </>
      )}
    </div>
  )
}

// --- 근무자 2줄 행 ---
function FragmentRow({ r, c, daysInMonth, days1, days2, tdCls, checked, toggleCheck, nameDropdown, setNameDropdown, dropdownRef, workers, pickWorker, patchRecord, setDayValue, setDeduction, resetDeduction, deleteRow }: {
  r: LaborRecord
  c: ReturnType<typeof calcRow>
  daysInMonth: number
  days1: number[]
  days2: number[]
  tdCls: string
  checked: boolean
  toggleCheck: (id: string) => void
  nameDropdown: string | null
  setNameDropdown: (v: string | null) => void
  dropdownRef: React.RefObject<HTMLDivElement | null>
  workers: WorkerInfo[]
  pickWorker: (id: string, w: WorkerInfo) => void
  patchRecord: (id: string, patch: Partial<LaborRecord>, flush?: boolean) => void
  setDayValue: (r: LaborRecord, day: number, raw: string, flush?: boolean) => void
  setDeduction: (r: LaborRecord, field: keyof LaborRecord, raw: string, flush?: boolean) => void
  resetDeduction: (r: LaborRecord, field: keyof LaborRecord) => void
  deleteRow: (id: string) => void
}) {
  const dayCell = (d: number) => (
    <td key={d} className={`${tdCls} px-0! ${d > daysInMonth ? 'bg-surface-secondary' : ''}`}>
      {d <= daysInMonth && (
        <CellInput value={r.day_values?.[String(d)]?.toString() || ''} align="center"
          onSave={(v, f) => setDayValue(r, d, v, f)} />
      )}
    </td>
  )
  // 공제 칸: 자동산출/수동값을 -금액으로 표기, 직접 수정 가능(지우면 자동 복귀)
  const dedCell = (field: keyof LaborRecord, effectiveVal: number) => {
    const isManual = (r[field] as number | null) != null
    return (
      <td className={tdCls}>
        <CellInput value={effectiveVal ? `-${effectiveVal.toLocaleString()}` : (isManual ? '0' : '')}
          align="right" className={isManual ? 'font-medium text-txt-primary' : 'text-txt-tertiary'}
          onSave={(v, f) => setDeduction(r, field, v, f)}
          onReset={() => resetDeduction(r, field)} />
      </td>
    )
  }
  // 한 사람이 두 줄: 윗줄 주민번호·은행·1~15일·지급일·공종 / 아랫줄 연락처·계좌·16~31일·현장명·비고
  return (
    <>
      <tr className="border-t-2 border-border-primary">
        <td className={`${tdCls} text-center`} rowSpan={2}>
          <input type="checkbox" checked={checked} onChange={() => toggleCheck(r.id)} />
        </td>
        {/* 근무자 (드롭다운) */}
        <td className={`${tdCls} relative`} rowSpan={2}>
          <div className="flex items-center">
            <CellInput value={r.worker_name} placeholder="이름"
              onSave={(v, f) => patchRecord(r.id, { worker_name: v }, f)} />
            <button onClick={() => setNameDropdown(nameDropdown === r.id ? null : r.id)}
              className="shrink-0 text-txt-quaternary hover:text-txt-secondary">
              <ChevronDown size={13} />
            </button>
          </div>
          {nameDropdown === r.id && (
            <div ref={dropdownRef}
              className="absolute left-0 top-full z-20 mt-1 w-[180px] max-h-[180px] overflow-y-auto bg-surface border border-border-primary rounded-lg shadow-lg">
              {workers.length === 0 ? (
                <p className="px-3 py-2 text-xs text-txt-quaternary">등록된 작업자가 없습니다</p>
              ) : workers.map(w => (
                <button key={w.worker_name} onClick={() => pickWorker(r.id, w)}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-surface-tertiary">
                  {w.worker_name}
                  {w.phone && <span className="text-[11px] text-txt-quaternary ml-1.5">{w.phone}</span>}
                </button>
              ))}
            </div>
          )}
        </td>
        <td className={tdCls}>
          <CellInput value={r.resident_id || ''} placeholder="000000-0000000" align="center" mask={maskResidentId}
            onSave={(v, f) => patchRecord(r.id, { resident_id: v || null }, f)} />
        </td>
        <td className={tdCls}>
          <CellInput value={r.bank_name || ''} placeholder="은행명(예금주)"
            onSave={(v, f) => patchRecord(r.id, { bank_name: v || null }, f)} />
        </td>
        {days1.map(dayCell)}
        <td className={`${tdCls} bg-surface-secondary`}></td>
        <td className={`${tdCls} text-center text-txt-secondary tabular-nums`}>{c.workDays || ''}</td>
        <td className={`${tdCls} text-right font-semibold tabular-nums pr-1.5`} rowSpan={2}>{fmt(c.total)}</td>
        {dedCell('ded_income_tax', c.income)}
        {dedCell('ded_pension', c.pension)}
        {dedCell('ded_health', c.health)}
        <td className={`${tdCls} text-right tabular-nums pr-1.5`} rowSpan={2}>{fmt(c.dedSum)}</td>
        <td className={`${tdCls} text-right font-semibold text-accent-text tabular-nums pr-1.5`} rowSpan={2}>{fmt(c.netPay)}</td>
        <td className={tdCls}>
          <CellInput value={r.payment_date || ''} placeholder="지급일" align="center"
            onSave={(v, f) => patchRecord(r.id, { payment_date: v || null }, f)} />
        </td>
        <td className={tdCls}>
          <CellInput value={r.work_type || ''} placeholder="공종"
            onSave={(v, f) => patchRecord(r.id, { work_type: v || null }, f)} />
        </td>
        <td className={`${tdCls} text-center`} rowSpan={2}>
          <button onClick={() => deleteRow(r.id)} className="text-txt-quaternary hover:text-danger transition">
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
      <tr>
        <td className={tdCls}>
          <CellInput value={r.phone || ''} placeholder="010-" align="center"
            onSave={(v, f) => patchRecord(r.id, { phone: v || null }, f)} />
        </td>
        <td className={tdCls}>
          <CellInput value={r.account_number || ''} placeholder="계좌번호"
            onSave={(v, f) => patchRecord(r.id, { account_number: v || null }, f)} />
        </td>
        {days2.map(dayCell)}
        <td className={tdCls}>
          <CellInput value={r.daily_wage != null ? String(r.daily_wage) : ''} placeholder="일급" align="right"
            onSave={(v, f) => {
              const n = Number(v.replace(/[^\d]/g, ''))
              patchRecord(r.id, { daily_wage: v.trim() === '' ? null : n }, f)
            }} />
        </td>
        {dedCell('ded_resident_tax', c.resident)}
        {dedCell('ded_employment', c.employment)}
        {dedCell('ded_longterm', c.longterm)}
        <td className={tdCls}>
          <CellInput value={r.site_name || ''} placeholder="현장명"
            onSave={(v, f) => patchRecord(r.id, { site_name: v || null }, f)} />
        </td>
        <td className={tdCls}>
          <CellInput value={r.note || ''} placeholder="비고"
            onSave={(v, f) => patchRecord(r.id, { note: v || null }, f)} />
        </td>
      </tr>
    </>
  )
}
