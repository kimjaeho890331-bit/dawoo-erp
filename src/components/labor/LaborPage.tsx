'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, Trash2, Download, FileCheck, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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

// --- 공제 요율 (% 단위, 화면에서 직접 수정 → 월별 저장) ---
export interface LaborRates {
  income: number     // 소득세: (일급-15만) × 요율
  resident: number   // 주민세: 소득세 × 요율
  employment: number // 고용보험: 총지급액 × 요율
  pension: number    // 국민연금: 총지급액 × 요율
  health: number     // 건강보험: 총지급액 × 요율
  longterm: number   // 장기요양: 건강보험 × 요율
}

export const DEFAULT_RATES: LaborRates = { income: 2.7, resident: 10, employment: 0.9, pension: 4.5, health: 3.43, longterm: 11.52 }

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

// --- 요율 헤더 input (직접 수정 → 월별 저장) ---
function RateInput({ value, onSave }: { value: number; onSave: (v: string) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => { setV(String(value)) }, [value])
  return (
    <span className="inline-flex items-center justify-center gap-px">
      <input
        type="text" value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => { if (v !== String(value)) onSave(v) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-[34px] bg-transparent outline-none text-[9px] text-center text-accent-text font-semibold border-b border-dashed border-border-secondary focus:border-accent"
      />
      <span className="text-[9px]">%</span>
    </span>
  )
}

// --- 공용 셀 input ---
function CellInput({ value, onSave, className = '', align = 'left', placeholder = '' }: {
  value: string
  onSave: (v: string) => void
  className?: string
  align?: 'left' | 'center' | 'right'
  placeholder?: string
}) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <input
      type="text" value={v} placeholder={placeholder}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={`w-full bg-transparent outline-none text-[12px] px-1 py-0.5 focus:bg-accent-light rounded text-${align} ${className}`}
    />
  )
}

// --- 메인 ---
export default function LaborPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [records, setRecords] = useState<LaborRecord[]>([])
  const [workers, setWorkers] = useState<WorkerInfo[]>([])
  const [rates, setRates] = useState<LaborRates>(DEFAULT_RATES)
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [nameDropdown, setNameDropdown] = useState<string | null>(null) // 열려있는 근무자 드롭다운의 record id
  const [exporting, setExporting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const daysInMonth = new Date(year, month, 0).getDate()

  // --- 데이터 로드 ---
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('labor_records').select('*')
      .eq('year', year).eq('month', month)
      .order('sort_order').order('created_at')
    if (!error && data) setRecords(data as LaborRecord[])
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

  // 요율 로드: 해당 월 → 없으면 가장 최근 월 요율 → 기본값
  const fetchRates = useCallback(async () => {
    const { data } = await supabase.from('labor_rates').select('rates')
      .eq('year', year).eq('month', month).maybeSingle()
    if (data?.rates) { setRates({ ...DEFAULT_RATES, ...data.rates }); return }
    const { data: latest } = await supabase.from('labor_rates').select('rates')
      .order('year', { ascending: false }).order('month', { ascending: false }).limit(1).maybeSingle()
    setRates(latest?.rates ? { ...DEFAULT_RATES, ...latest.rates } : DEFAULT_RATES)
  }, [year, month])

  // 요율 수정 → 해당 월에 저장
  const saveRate = async (field: keyof LaborRates, raw: string) => {
    const v = parseFloat(raw)
    if (isNaN(v) || v < 0) return
    const next = { ...rates, [field]: v }
    setRates(next)
    const { error } = await supabase.from('labor_rates')
      .upsert({ year, month, rates: next, updated_at: new Date().toISOString() })
    if (error) alert(`요율 저장 실패: ${error.message}`)
  }

  useEffect(() => { fetchRecords() }, [fetchRecords])
  useEffect(() => { fetchWorkers() }, [fetchWorkers])
  useEffect(() => { fetchRates() }, [fetchRates])

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setNameDropdown(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // --- 저장 (낙관적 갱신 + DB update) ---
  const patchRecord = async (id: string, patch: Partial<LaborRecord>) => {
    setRecords(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
    const { error } = await supabase.from('labor_records').update(patch).eq('id', id)
    if (error) alert(`저장 실패: ${error.message}`)
  }

  const addRow = async () => {
    const { data, error } = await supabase.from('labor_records')
      .insert({ year, month, worker_name: '', day_values: {}, sort_order: records.length })
      .select().single()
    if (error) { alert(`행 추가 실패: ${error.message}`); return }
    setRecords(prev => [...prev, data as LaborRecord])
  }

  const deleteRow = async (id: string) => {
    if (!confirm('이 근무자 행을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('labor_records').delete().eq('id', id)
    if (error) { alert(`삭제 실패: ${error.message}`); return }
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  // 기존 근무자 선택 → 인적사항 자동 입력
  const pickWorker = (id: string, w: WorkerInfo) => {
    patchRecord(id, {
      worker_name: w.worker_name, resident_id: w.resident_id, phone: w.phone,
      bank_name: w.bank_name, account_number: w.account_number,
    })
    setNameDropdown(null)
  }

  // 날짜 셀 값 변경
  const setDayValue = (r: LaborRecord, day: number, raw: string) => {
    const v = parseFloat(raw)
    const next = { ...(r.day_values || {}) }
    if (!raw.trim() || isNaN(v) || v === 0) delete next[String(day)]
    else next[String(day)] = v
    patchRecord(r.id, { day_values: next })
  }

  // 공제 수동값 (빈 값으로 지우면 자동계산 복귀)
  const setDeduction = (r: LaborRecord, field: keyof LaborRecord, raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw.replace(/[^\d]/g, ''))
    patchRecord(r.id, { [field]: v } as Partial<LaborRecord>)
  }

  const toggleCheck = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    setChecked(prev => (prev.size === records.length ? new Set() : new Set(records.map(r => r.id))))
  }

  const checkedRecords = records.filter(r => checked.has(r.id))

  // --- 엑셀 저장 (체크된 근무자) ---
  const handleExport = async () => {
    if (checkedRecords.length === 0) { alert('엑셀로 저장할 근무자를 체크해주세요.'); return }
    setExporting(true)
    try {
      const res = await fetch('/api/labor/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, rates, records: checkedRecords }),
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
      alert(`엑셀 저장 실패: ${err instanceof Error ? err.message : err}`)
    } finally { setExporting(false) }
  }

  // --- 노무비 결재 (체크된 근무자 → 지출결의서 생성) ---
  const handleSubmitApproval = async () => {
    if (checkedRecords.length === 0) { alert('결재 올릴 근무자를 체크해주세요.'); return }
    const totalNet = checkedRecords.reduce((s, r) => s + calcRow(r, rates).netPay, 0)
    const names = checkedRecords.map(r => r.worker_name || '(이름없음)')
    const title = `${month}월 일용직 노무비 (${names[0]}${names.length > 1 ? ` 외 ${names.length - 1}명` : ''})`
    if (!confirm(`지출결의서를 생성합니다.\n\n${title}\n금액: ${totalNet.toLocaleString()}원\n\n진행할까요?`)) return
    setSubmitting(true)
    const memo = checkedRecords.map(r => {
      const c = calcRow(r, rates)
      return `${r.worker_name}: ${c.workDays}일 × ${fmt(r.daily_wage || 0)}원 = ${fmt(c.total)}원, 공제 ${fmt(c.dedSum)}원, 실지급 ${fmt(c.netPay)}원`
    }).join('\n')
    const { error } = await supabase.from('expenses').insert({
      category: '노무비', title, amount: totalNet,
      expense_date: new Date().toISOString().slice(0, 10),
      memo, site_id: null, staff_id: null, receipt_url: null,
    })
    setSubmitting(false)
    if (error) { alert(`결재 생성 실패: ${error.message}`); return }
    alert('지출결의서가 생성되었습니다. [업무 > 지출결의서]에서 확인하세요.')
  }

  // --- 합계 ---
  const totals = useMemo(() => {
    return records.reduce((acc, r) => {
      const c = calcRow(r, rates)
      acc.total += c.total; acc.dedSum += c.dedSum; acc.netPay += c.netPay
      return acc
    }, { total: 0, dedSum: 0, netPay: 0 })
  }, [records, rates])

  const days1 = Array.from({ length: 15 }, (_, i) => i + 1)
  const days2 = Array.from({ length: 16 }, (_, i) => i + 16)

  const thCls = 'border border-border-primary px-1 py-1.5 text-[11px] font-medium text-txt-tertiary bg-surface-secondary text-center whitespace-nowrap'
  const tdCls = 'border border-border-tertiary px-0.5 py-0.5 text-[12px]'

  return (
    <div className="p-6 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">일용직 근무관리</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-surface border border-border-primary rounded-lg hover:bg-surface-tertiary transition disabled:opacity-50">
            <Download size={15} className="text-txt-tertiary" />
            {exporting ? '생성 중...' : '엑셀 저장'}
          </button>
          <button onClick={handleSubmitApproval} disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition disabled:opacity-50">
            <FileCheck size={15} />
            {submitting ? '생성 중...' : '노무비 결재'}
          </button>
        </div>
      </div>

      {/* 연도/월 선택 + 요약 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-txt-tertiary">연도 / 월</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-border-primary rounded-lg px-3 h-[34px] text-sm outline-none focus:border-accent">
            {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border border-border-primary rounded-lg px-3 h-[34px] text-sm outline-none focus:border-accent">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
          <span className="text-sm text-txt-tertiary ml-2">
            {year}-{String(month).padStart(2, '0')}-01 ~ {year}-{String(month).padStart(2, '0')}-{String(daysInMonth).padStart(2, '0')}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-txt-tertiary">총지급액 <b className="text-txt-primary tabular-nums">{fmt(totals.total)}</b>원</span>
          <span className="text-txt-tertiary">공제 <b className="text-txt-primary tabular-nums">{fmt(totals.dedSum)}</b>원</span>
          <span className="text-txt-tertiary">실지급 <b className="text-accent-text tabular-nums">{fmt(totals.netPay)}</b>원</span>
        </div>
      </div>

      {/* 명세서 그리드 */}
      <div className="bg-surface border border-border-primary rounded-[10px] overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-txt-tertiary">로딩 중...</div>
        ) : (
          <table className="border-collapse w-max min-w-full">
            <thead>
              <tr>
                <th className={thCls} rowSpan={2}>
                  <input type="checkbox" checked={records.length > 0 && checked.size === records.length} onChange={toggleAll} />
                </th>
                <th className={`${thCls} min-w-[80px]`} rowSpan={2}>근무자</th>
                <th className={`${thCls} min-w-[110px]`} rowSpan={2}>주민등록번호</th>
                <th className={`${thCls} min-w-[100px]`} rowSpan={2}>연락처</th>
                <th className={`${thCls} min-w-[110px]`}>은행명</th>
                {days1.map(d => <th key={d} className={`${thCls} w-7`}>{d}</th>)}
                <th className={thCls}>일수</th>
                <th className={`${thCls} min-w-[80px]`} rowSpan={2}>총지급액</th>
                <th className={thCls}>소득세<br /><RateInput value={rates.income} onSave={v => saveRate('income', v)} /></th>
                <th className={thCls}>국민연금<br /><RateInput value={rates.pension} onSave={v => saveRate('pension', v)} /></th>
                <th className={thCls}>건강보험<br /><RateInput value={rates.health} onSave={v => saveRate('health', v)} /></th>
                <th className={`${thCls} min-w-[70px]`} rowSpan={2}>공제합계</th>
                <th className={`${thCls} min-w-[80px]`} rowSpan={2}>실 지급액</th>
                <th className={`${thCls} min-w-[90px]`} rowSpan={2}>지급일</th>
                <th className={`${thCls} min-w-[90px]`} rowSpan={2}>현장명</th>
                <th className={`${thCls} min-w-[80px]`} rowSpan={2}>공종</th>
                <th className={`${thCls} min-w-[80px]`} rowSpan={2}>비고</th>
                <th className={thCls} rowSpan={2}></th>
              </tr>
              <tr>
                <th className={thCls}>계좌번호</th>
                {days2.map(d => <th key={d} className={`${thCls} w-7 ${d > daysInMonth ? 'opacity-30' : ''}`}>{d}</th>)}
                <th className={thCls}>일급</th>
                <th className={thCls}>주민세<br /><RateInput value={rates.resident} onSave={v => saveRate('resident', v)} /></th>
                <th className={thCls}>고용보험<br /><RateInput value={rates.employment} onSave={v => saveRate('employment', v)} /></th>
                <th className={thCls}>장기요양<br /><RateInput value={rates.longterm} onSave={v => saveRate('longterm', v)} /></th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={30} className="text-center py-12 text-txt-quaternary text-sm">등록된 근무자가 없습니다. 아래 [근무자 추가]를 눌러주세요.</td></tr>
              ) : records.map(r => {
                const c = calcRow(r, rates)
                return (
                  <FragmentRow key={r.id} r={r} c={c} daysInMonth={daysInMonth} days1={days1} days2={days2}
                    tdCls={tdCls} checked={checked.has(r.id)} toggleCheck={toggleCheck}
                    nameDropdown={nameDropdown} setNameDropdown={setNameDropdown} dropdownRef={dropdownRef}
                    workers={workers} pickWorker={pickWorker} patchRecord={patchRecord}
                    setDayValue={setDayValue} setDeduction={setDeduction} deleteRow={deleteRow} />
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <button onClick={addRow}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-dashed border-border-secondary text-txt-tertiary rounded-lg hover:border-accent hover:text-accent-text transition">
        <Plus size={15} /> 근무자 추가
      </button>

      <p className="text-xs text-txt-quaternary leading-relaxed">
        · 공제 6종은 표 머리글의 <b>요율을 직접 수정</b>할 수 있고(해당 월에 저장됨), 입력한 요율대로 자동 산출되어 -금액으로 표시됩니다.<br />
        · 소득세는 일급 15만원 초과분 × 요율(일 세액 1,000원 미만 소액부징수), 주민세는 소득세 × 요율, 장기요양은 건강보험 × 요율, 나머지는 총지급액 × 요율 기준입니다.<br />
        · 공제 대상이 아닌 근무자는 해당 칸에 0을 입력하세요. 셀 값을 지우면 다시 자동계산으로 돌아갑니다.<br />
        · 근무자 이름을 클릭하면 이전에 등록한 작업자를 선택할 수 있고, 주민등록번호/연락처/은행/계좌가 자동 입력됩니다.
      </p>
    </div>
  )
}

// --- 근무자 2줄 행 ---
function FragmentRow({ r, c, daysInMonth, days1, days2, tdCls, checked, toggleCheck, nameDropdown, setNameDropdown, dropdownRef, workers, pickWorker, patchRecord, setDayValue, setDeduction, deleteRow }: {
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
  patchRecord: (id: string, patch: Partial<LaborRecord>) => void
  setDayValue: (r: LaborRecord, day: number, raw: string) => void
  setDeduction: (r: LaborRecord, field: keyof LaborRecord, raw: string) => void
  deleteRow: (id: string) => void
}) {
  const dayCell = (d: number) => (
    <td key={d} className={`${tdCls} w-7 ${d > daysInMonth ? 'bg-surface-secondary' : ''}`}>
      {d <= daysInMonth && (
        <CellInput value={r.day_values?.[String(d)]?.toString() || ''} align="center"
          onSave={v => setDayValue(r, d, v)} />
      )}
    </td>
  )
  // 공제 칸: 자동산출/수동값을 -금액으로 표기, 직접 수정 가능(지우면 자동 복귀)
  const dedCell = (field: keyof LaborRecord, effectiveVal: number) => {
    const isManual = (r[field] as number | null) != null
    return (
      <td className={`${tdCls} min-w-[60px]`}>
        <CellInput value={effectiveVal ? `-${effectiveVal.toLocaleString()}` : (isManual ? '0' : '')}
          align="right" className={isManual ? 'font-medium text-txt-primary' : 'text-txt-tertiary'}
          onSave={v => setDeduction(r, field, v)} />
      </td>
    )
  }
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
              onSave={v => patchRecord(r.id, { worker_name: v })} />
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
        <td className={`${tdCls}`} rowSpan={2}>
          <CellInput value={r.resident_id || ''} placeholder="000000-0000000" align="center"
            onSave={v => patchRecord(r.id, { resident_id: v || null })} />
        </td>
        <td className={`${tdCls}`} rowSpan={2}>
          <CellInput value={r.phone || ''} placeholder="010-" align="center"
            onSave={v => patchRecord(r.id, { phone: v || null })} />
        </td>
        <td className={tdCls}>
          <CellInput value={r.bank_name || ''} placeholder="은행명(예금주)"
            onSave={v => patchRecord(r.id, { bank_name: v || null })} />
        </td>
        {days1.map(dayCell)}
        <td className={`${tdCls} text-center text-txt-secondary tabular-nums`}>{c.workDays || ''}</td>
        <td className={`${tdCls} text-right font-semibold tabular-nums pr-1.5`} rowSpan={2}>{fmt(c.total)}</td>
        {dedCell('ded_income_tax', c.income)}
        {dedCell('ded_pension', c.pension)}
        {dedCell('ded_health', c.health)}
        <td className={`${tdCls} text-right tabular-nums pr-1.5`} rowSpan={2}>{fmt(c.dedSum)}</td>
        <td className={`${tdCls} text-right font-semibold text-accent-text tabular-nums pr-1.5`} rowSpan={2}>{fmt(c.netPay)}</td>
        <td className={tdCls} rowSpan={2}>
          <CellInput value={r.payment_date || ''} placeholder="지급일"
            onSave={v => patchRecord(r.id, { payment_date: v || null })} />
        </td>
        <td className={tdCls} rowSpan={2}>
          <CellInput value={r.site_name || ''} placeholder="현장명"
            onSave={v => patchRecord(r.id, { site_name: v || null })} />
        </td>
        <td className={tdCls} rowSpan={2}>
          <CellInput value={r.work_type || ''} placeholder="공종"
            onSave={v => patchRecord(r.id, { work_type: v || null })} />
        </td>
        <td className={tdCls} rowSpan={2}>
          <CellInput value={r.note || ''} placeholder="비고"
            onSave={v => patchRecord(r.id, { note: v || null })} />
        </td>
        <td className={`${tdCls} text-center`} rowSpan={2}>
          <button onClick={() => deleteRow(r.id)} className="text-txt-quaternary hover:text-red-500 transition">
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
      <tr>
        <td className={tdCls}>
          <CellInput value={r.account_number || ''} placeholder="계좌번호"
            onSave={v => patchRecord(r.id, { account_number: v || null })} />
        </td>
        {days2.map(dayCell)}
        <td className={`${tdCls} min-w-[70px]`}>
          <CellInput value={r.daily_wage != null ? String(r.daily_wage) : ''} placeholder="일급" align="right"
            onSave={v => {
              const n = Number(v.replace(/[^\d]/g, ''))
              patchRecord(r.id, { daily_wage: v.trim() === '' ? null : n })
            }} />
        </td>
        {dedCell('ded_resident_tax', c.resident)}
        {dedCell('ded_employment', c.employment)}
        {dedCell('ded_longterm', c.longterm)}
      </tr>
    </>
  )
}
