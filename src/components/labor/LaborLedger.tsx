'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { projectLabel, type WorkProjectOption, type WorkSiteOption } from '@/lib/workTarget'
import { groupLaborRows } from '@/lib/labor/laborGroups'
import { maskResidentId } from '@/lib/labor/mask'
import { calcRow, loadLaborRates, DEFAULT_RATES, type LaborRates, type LaborRecord } from './LaborPage'

/** 결의서가 함께 실려 온다 (030 연결 + PostgREST 임베드) */
type LedgerRow = LaborRecord & {
  expense_reports: { doc_no: string | null; status: string; updated_at: string } | null
}

const fmt = (n: number) => (n ? n.toLocaleString() : '0')

/**
 * 일용직 근무지출관리 — 승인된 노무비 대장.
 *
 * 몇 월에 어느 공사에 누가 며칠 일했고 얼마가 나갔는지 한눈에 본다.
 * 근무표 행을 그대로 집계한다(복사본을 만들지 않는다) — 결의서 지급줄에는 일수·일급이
 * 없어서 「누가 며칠」은 근무표에만 있다.
 */
export default function LaborLedger() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [rates, setRates] = useState<LaborRates>(DEFAULT_RATES)
  const [sites, setSites] = useState<WorkSiteOption[]>([])
  const [projects, setProjects] = useState<WorkProjectOption[]>([])
  const [loading, setLoading] = useState(true)

  // 달을 빨리 바꾸면 늦게 온 옛 응답이 새 것을 덮을 수 있다 — alive 로 막는다.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data }, monthRates] = await Promise.all([
        supabase
          .from('labor_records')
          .select('*, expense_reports!inner(doc_no, status, updated_at)')
          .eq('year', year).eq('month', month)
          .eq('expense_reports.status', 'approved')
          .order('sort_order').order('created_at'),
        loadLaborRates(year, month),
      ])
      if (!alive) return
      setRows((data ?? []) as LedgerRow[])
      setRates(monthRates)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [year, month])

  useEffect(() => {
    supabase.from('sites').select('id, name, contract_type, status').order('name')
      .then(({ data }) => setSites((data ?? []) as WorkSiteOption[]))
    supabase.from('projects').select('id, building_name, ho, dong').order('created_at', { ascending: false })
      .then(({ data }) => setProjects((data ?? []) as WorkProjectOption[]))
  }, [])

  const targetName = useCallback((siteId: string | null, projectId: string | null): string => {
    if (siteId) return sites.find(x => x.id === siteId)?.name?.trim() || '현장'
    if (projectId) {
      const p = projects.find(x => x.id === projectId)
      return p ? projectLabel(p) : '지원사업'
    }
    return '공사건 미지정'
  }, [sites, projects])

  const groups = useMemo(() => groupLaborRows(rows), [rows])
  const totals = useMemo(() => rows.reduce((acc, r) => {
    const c = calcRow(r, rates)
    acc.days += c.workDays; acc.total += c.total; acc.ded += c.dedSum; acc.net += c.netPay
    return acc
  }, { days: 0, total: 0, ded: 0, net: 0 }), [rows, rates])

  const th = 'border-b border-border-primary px-3 py-2 text-[12px] font-medium text-txt-tertiary bg-surface-secondary whitespace-nowrap'
  const td = 'border-b border-border-tertiary px-3 py-2 text-[13px] whitespace-nowrap'

  return (
    <div className="space-y-4">
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
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
        </div>
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <span className="text-txt-tertiary">인원 <b className="text-txt-primary tabular-nums">{rows.length}</b>명</span>
          <span className="text-txt-tertiary">일수 <b className="text-txt-primary tabular-nums">{totals.days}</b>일</span>
          <span className="text-txt-tertiary">총지급액 <b className="text-txt-primary tabular-nums">{fmt(totals.total)}</b>원</span>
          <span className="text-txt-tertiary">공제 <b className="text-txt-primary tabular-nums">{fmt(totals.ded)}</b>원</span>
          <span className="text-txt-tertiary">실지급 <b className="text-accent-text tabular-nums">{fmt(totals.net)}</b>원</span>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[10px] border border-border-primary bg-surface p-12 text-center text-txt-tertiary">불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-[10px] border border-border-primary bg-surface p-12 text-center text-sm text-txt-quaternary">
          {year}년 {month}월에 결재가 끝난 노무비가 없습니다.<br />
          <span className="text-txt-tertiary">「결의서 만들기」 탭에서 올린 결의서가 승인되면 여기에 쌓입니다.</span>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => {
            const first = g.rows[0]
            const doc = (first as LedgerRow).expense_reports
            const sum = g.rows.reduce((acc, r) => {
              const c = calcRow(r, rates)
              acc.days += c.workDays; acc.net += c.netPay
              return acc
            }, { days: 0, net: 0 })
            return (
              <div key={g.key} className="overflow-hidden rounded-[10px] border border-border-primary bg-surface">
                <div className="flex items-center gap-2 flex-wrap border-b border-border-primary bg-surface-secondary px-4 py-2.5">
                  <b className="text-[14px] text-txt-primary">{targetName(first.site_id, first.project_id)}</b>
                  <span className="text-[12px] text-txt-tertiary">
                    {g.rows.length}명 · {sum.days}일 · 실지급 <b className="text-txt-primary tabular-nums">{fmt(sum.net)}</b>원
                  </span>
                  <span className="flex-1" />
                  {doc && (
                    <Link href={`/approval/${first.expense_report_id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border-primary bg-surface px-2 py-1 text-[12px] text-txt-secondary hover:bg-surface-tertiary transition">
                      <FileText size={13} /> {doc.doc_no ?? '결의서'}
                    </Link>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={`${th} text-left`}>근무자</th>
                        <th className={`${th} text-left`}>주민등록번호</th>
                        <th className={`${th} text-right`}>일급</th>
                        <th className={`${th} text-right`}>일수</th>
                        <th className={`${th} text-right`}>총지급액</th>
                        <th className={`${th} text-right`}>공제</th>
                        <th className={`${th} text-right`}>실지급액</th>
                        <th className={`${th} text-left`}>지급일</th>
                        <th className={`${th} text-left`}>공종</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(r => {
                        const c = calcRow(r, rates)
                        return (
                          <tr key={r.id}>
                            <td className={`${td} font-medium text-txt-primary`}>{r.worker_name}</td>
                            <td className={`${td} text-txt-tertiary`}>{maskResidentId(r.resident_id ?? '')}</td>
                            <td className={`${td} text-right tabular-nums`}>{fmt(r.daily_wage ?? 0)}</td>
                            <td className={`${td} text-right tabular-nums`}>{c.workDays}</td>
                            <td className={`${td} text-right tabular-nums`}>{fmt(c.total)}</td>
                            <td className={`${td} text-right tabular-nums text-txt-tertiary`}>{fmt(c.dedSum)}</td>
                            <td className={`${td} text-right tabular-nums font-semibold text-accent-text`}>{fmt(c.netPay)}</td>
                            <td className={`${td} text-txt-tertiary`}>{r.payment_date ?? ''}</td>
                            <td className={`${td} text-txt-tertiary`}>{r.work_type ?? ''}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
