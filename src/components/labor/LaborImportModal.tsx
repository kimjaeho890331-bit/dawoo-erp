'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Check, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  DEDUCTION_KEYS, reconcileDeductions, isSameLaborRow,
  type Deductions, type ImportedLaborRow, type LaborImportResult,
} from '@/lib/labor/importExcel'
import { calcRow, loadLaborRates, type LaborRates, type LaborRecord } from './LaborPage'

// 엑셀 불러오기 미리보기. 여기서 [불러오기]를 누르기 전에는 아무것도 저장하지 않는다.

interface PreviewRow {
  src: ImportedLaborRow
  insert: Omit<LaborRecord, 'id' | 'created_at' | 'sort_order'>
  workDays: number
  total: number
  dedSum: number
  netPay: number
  manualCount: number   // 요율 자동계산과 달라 엑셀 값을 그대로 넣는 공제 칸 수
  netMatches: boolean
  duplicate: boolean
}

const won = (n: number) => n.toLocaleString()
const maskRid = (rid: string | null) => (rid ? rid.replace(/^(\d{6})-?\d+$/, '$1-*******') : '')

function toPreview(
  src: ImportedLaborRow, year: number, month: number, rates: LaborRates, existing: LaborRecord[],
): PreviewRow {
  const base: PreviewRow['insert'] = {
    year, month,
    worker_name: src.worker_name, resident_id: src.resident_id, phone: src.phone,
    bank_name: src.bank_name, account_number: src.account_number,
    day_values: src.day_values, daily_wage: src.daily_wage, vehicle_cost: src.vehicle_cost,
    payment_date: src.payment_date, site_name: src.site_name, work_type: src.work_type, note: src.note,
    ded_income_tax: null, ded_resident_tax: null, ded_employment: null,
    ded_pension: null, ded_health: null, ded_longterm: null,
  }
  const auto = (r: PreviewRow['insert']): Deductions => {
    const c = calcRow(r as LaborRecord, rates)
    return {
      income: c.income, resident: c.resident, employment: c.employment,
      pension: c.pension, health: c.health, longterm: c.longterm,
    }
  }

  // 주민세·장기요양은 소득세·건강보험에서 파생되므로, 앞의 둘을 확정한 뒤에 다시 견준다
  const first = reconcileDeductions(src.deductions, auto(base))
  const withParents = { ...base, ded_income_tax: first.income, ded_health: first.health }
  const second = reconcileDeductions(src.deductions, auto(withParents))

  const insert: PreviewRow['insert'] = {
    ...withParents,
    ded_resident_tax: second.resident,
    ded_employment: first.employment,
    ded_pension: first.pension,
    ded_longterm: second.longterm,
  }
  const c = calcRow(insert as LaborRecord, rates)
  const manualCount = [
    insert.ded_income_tax, insert.ded_resident_tax, insert.ded_employment,
    insert.ded_pension, insert.ded_health, insert.ded_longterm,
  ].filter(v => v != null).length

  return {
    src, insert,
    workDays: c.workDays, total: c.total, dedSum: c.dedSum, netPay: c.netPay,
    manualCount,
    netMatches: src.excel_net == null || src.excel_net === c.netPay,
    duplicate: existing.some(e => isSameLaborRow(e, src)),
  }
}

export default function LaborImportModal({ file, onClose, onImported }: {
  file: File
  onClose: () => void
  onImported: (year: number, month: number, count: number) => void
}) {
  const [parsed, setParsed] = useState<LaborImportResult | null>(null)
  const [rates, setRates] = useState<LaborRates | null>(null)
  const [existing, setExisting] = useState<LaborRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const body = new FormData()
        body.append('file', file)
        const res = await fetch('/api/labor/import', { method: 'POST', body })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || '엑셀을 읽지 못했습니다.')
        const result = json as LaborImportResult

        const [monthRates, { data, error: dbErr }] = await Promise.all([
          loadLaborRates(result.year, result.month),
          supabase.from('labor_records').select('*').eq('year', result.year).eq('month', result.month),
        ])
        if (dbErr) throw new Error(`기존 기록을 확인하지 못했습니다: ${dbErr.message}`)
        if (!alive) return
        setParsed(result)
        setRates(monthRates)
        setExisting((data ?? []) as LaborRecord[])
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => { alive = false }
  }, [file])

  const rows = useMemo(() => {
    if (!parsed || !rates) return []
    return parsed.rows.map(r => toPreview(r, parsed.year, parsed.month, rates, existing))
  }, [parsed, rates, existing])

  // 이미 있는 줄은 기본으로 빼 둔다 (같은 파일을 두 번 넣어도 겹치지 않게)
  useEffect(() => {
    setPicked(new Set(rows.flatMap((r, i) => (r.duplicate ? [] : [i]))))
  }, [rows])

  const fileRates = parsed?.rates ?? null
  const rateDiffers = !!(fileRates && rates && DEDUCTION_KEYS.some(k => fileRates[k] !== rates[k]))
  const pickedRows = rows.filter((_, i) => picked.has(i))
  const pickedNet = pickedRows.reduce((s, r) => s + r.netPay, 0)

  const toggle = (i: number) => {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const handleImport = async () => {
    if (!parsed || !rates || pickedRows.length === 0) return
    setSaving(true)
    const payload = pickedRows.map((r, i) => ({ ...r.insert, sort_order: existing.length + i }))
    const { error: insErr } = await supabase.from('labor_records').insert(payload)
    setSaving(false)
    if (insErr) { alert(`불러오기 실패: ${insErr.message}`); return }
    onImported(parsed.year, parsed.month, payload.length)
  }

  const th = 'border-b border-border-primary px-2 py-2 text-[11px] font-medium text-txt-tertiary bg-surface-secondary whitespace-nowrap'
  const td = 'border-b border-border-tertiary px-2 py-2 text-[12px] whitespace-nowrap'

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <div className="bg-surface w-full max-w-5xl max-h-[88dvh] flex flex-col rounded-xl border border-border-primary">
        <div className="flex items-center justify-between border-b border-border-primary px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold text-txt-primary">엑셀 불러오기</h2>
            <p className="text-[12px] text-txt-tertiary mt-0.5 break-all">{file.name}</p>
          </div>
          <button onClick={onClose} aria-label="닫기"><X size={17} className="text-txt-tertiary" /></button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
          {error ? (
            <div className="rounded-lg border border-danger-border bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>
          ) : !parsed || !rates ? (
            <div className="py-12 text-center text-txt-tertiary text-sm">엑셀을 읽는 중...</div>
          ) : (
            <>
              <div className="flex items-center gap-4 flex-wrap text-sm">
                <span className="text-txt-tertiary">등록할 달 <b className="text-txt-primary">{parsed.year}년 {parsed.month}월</b></span>
                <span className="text-txt-tertiary">시트 <b className="text-txt-primary">{parsed.sheetName}</b></span>
                <span className="text-txt-tertiary">읽은 근무자 <b className="text-txt-primary">{rows.length}</b>줄</span>
              </div>

              {(parsed.warnings.length > 0 || rateDiffers) && (
                <ul className="rounded-lg bg-caution-bg text-caution-text text-[12px] px-4 py-2.5 space-y-0.5">
                  {parsed.warnings.map(w => <li key={w}>{w}</li>)}
                  {rateDiffers && (
                    <li>엑셀의 요율이 이 달 ERP 요율과 다릅니다. 공제액은 엑셀에 적힌 금액 그대로 넣습니다.</li>
                  )}
                </ul>
              )}

              {rows.length === 0 ? (
                <div className="py-10 text-center text-txt-tertiary text-sm">이 시트에서 근무자를 찾지 못했습니다.</div>
              ) : (
                <div className="border border-border-primary rounded-lg overflow-x-auto">
                  <table className="border-collapse w-max min-w-full">
                    <thead>
                      <tr>
                        <th className={th}></th>
                        <th className={`${th} text-left`}>근무자</th>
                        <th className={`${th} text-left`}>주민등록번호</th>
                        <th className={`${th} text-left`}>현장명</th>
                        <th className={`${th} text-left`}>출역일</th>
                        <th className={`${th} text-right`}>일수</th>
                        <th className={`${th} text-right`}>일급</th>
                        <th className={`${th} text-right`}>총지급액</th>
                        <th className={`${th} text-right`}>공제합계</th>
                        <th className={`${th} text-right`}>실지급액</th>
                        <th className={`${th} text-left`}>엑셀과 대조</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className={picked.has(i) ? '' : 'opacity-50'}>
                          <td className={`${td} text-center`}>
                            <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} />
                          </td>
                          <td className={`${td} text-txt-primary font-medium`}>{r.src.worker_name}</td>
                          <td className={`${td} text-txt-secondary tabular-nums`}>{maskRid(r.src.resident_id)}</td>
                          <td className={`${td} text-txt-secondary`}>{r.src.site_name ?? ''}</td>
                          <td className={`${td} text-txt-secondary tabular-nums`}>
                            {Object.entries(r.src.day_values).map(([d, v]) => (v === 1 ? `${d}일` : `${d}일(${v})`)).join(', ')}
                          </td>
                          <td className={`${td} text-right tabular-nums`}>{r.workDays}</td>
                          <td className={`${td} text-right tabular-nums`}>{won(r.src.daily_wage)}</td>
                          <td className={`${td} text-right tabular-nums`}>{won(r.total)}</td>
                          <td className={`${td} text-right tabular-nums`}>{won(r.dedSum)}</td>
                          <td className={`${td} text-right tabular-nums font-medium text-txt-primary`}>{won(r.netPay)}</td>
                          <td className={td}>
                            {r.duplicate ? (
                              <span className="text-txt-tertiary">이미 등록됨</span>
                            ) : r.netMatches ? (
                              <span className="inline-flex items-center gap-1 text-txt-secondary">
                                <Check size={13} className="text-txt-tertiary" />
                                일치{r.manualCount > 0 ? ` · 공제 ${r.manualCount}칸 엑셀 값` : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-danger">
                                <AlertTriangle size={13} />
                                엑셀 {won(r.src.excel_net ?? 0)}원과 다름
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-primary px-5 py-3">
          <span className="text-sm text-txt-tertiary">
            {pickedRows.length > 0 && <>선택 {pickedRows.length}줄 · 실지급 <b className="text-accent-text tabular-nums">{won(pickedNet)}</b>원</>}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-surface border border-border-primary rounded-lg hover:bg-surface-tertiary transition">
              취소
            </button>
            <button onClick={handleImport} disabled={saving || pickedRows.length === 0}
              className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition disabled:opacity-50">
              {saving ? '불러오는 중...' : `${pickedRows.length}줄 불러오기`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
