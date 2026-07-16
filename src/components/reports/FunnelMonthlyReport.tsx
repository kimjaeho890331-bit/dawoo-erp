'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  type FunnelProjectRow, type FunnelStat, type FunnelCategory,
  emptyFunnel, monthlyFunnel, funnelPct as pct,
} from '@/lib/funnel'

// 대시보드 인라인 hex 컨벤션과 동일
const C_SMALL = '#d97706'
const C_WATER = '#2563eb'
const C_ALL = '#e2661f'

type CatFilter = '전체' | FunnelCategory

const CAT_TABS: { key: CatFilter; label: string; color: string }[] = [
  { key: '전체', label: '전체', color: C_ALL },
  { key: '소규모', label: '소규모', color: C_SMALL },
  { key: '수도', label: '수도', color: C_WATER },
]

const addStat = (a: FunnelStat, b: FunnelStat): FunnelStat => ({
  calls: a.calls + b.calls,
  meets: a.meets + b.meets,
  intakes: a.intakes + b.intakes,
  approved: a.approved + b.approved,
})

export default function FunnelMonthlyReport() {
  const [rows, setRows] = useState<FunnelProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<CatFilter>('전체')

  const year = new Date().getFullYear()
  const curMonth = new Date().getMonth() // 0-based

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Supabase 1회 최대 1000행 — 올해 전체를 위해 페이지 순회
      const PAGE = 1000
      const all: FunnelProjectRow[] = []
      for (let i = 0; i < 5; i++) {
        const { data, error } = await supabase
          .from('projects')
          .select(`
            id, created_at, status, cancel_reason,
            work_types:work_type_id ( work_categories:category_id ( name ) )
          `)
          .gte('created_at', `${new Date().getFullYear()}-01-01`)
          .order('created_at', { ascending: true })
          .range(i * PAGE, i * PAGE + PAGE - 1)
        if (cancelled) return
        if (error || !data) break
        all.push(...(data as unknown as FunnelProjectRow[]))
        if (data.length < PAGE) break
      }
      setRows(all)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const byMonth = useMemo(() => monthlyFunnel(rows), [rows])

  const { monthStats, total } = useMemo(() => {
    const list: { ym: string; label: string; stat: FunnelStat }[] = []
    const sum = emptyFunnel()
    for (let m = 0; m <= curMonth; m++) {
      const ym = `${year}-${String(m + 1).padStart(2, '0')}`
      const rec = byMonth.get(ym)
      const stat = !rec ? emptyFunnel()
        : cat === '전체' ? addStat(rec['소규모'], rec['수도'])
        : rec[cat]
      list.push({ ym, label: `${m + 1}월`, stat })
      const s2 = addStat(sum, stat)
      sum.calls = s2.calls; sum.meets = s2.meets; sum.intakes = s2.intakes; sum.approved = s2.approved
    }
    return { monthStats: list, total: sum }
  }, [byMonth, cat, year, curMonth])

  const maxCalls = Math.max(1, ...monthStats.map(m => m.stat.calls))
  const color = CAT_TABS.find(t => t.key === cat)!.color
  const showApprove = cat !== '수도'
  const gridCols = showApprove ? 'grid-cols-[44px_1.6fr_1fr_1fr_1fr]' : 'grid-cols-[44px_1.6fr_1fr_1fr]'

  // 셀: 도달 수 + 문의 대비 %
  const cell = (v: number, base: number) => (
    <span className="tabular-nums text-[13px] text-txt-primary">
      {v}
      <span className="text-[10.5px] text-txt-tertiary ml-1">{base > 0 ? `${pct(v, base)}%` : '—'}</span>
    </span>
  )

  return (
    <div className="space-y-4">
      {/* 헤더 + 분류 필터 */}
      <div className="bg-surface rounded-[10px] border border-border-primary px-5 py-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-semibold text-txt-primary">접수 퍼널 — {year}년 월별 정산</span>
          <span className="text-[11px] text-txt-tertiary">등록월 기준 · 그 달에 들어온 문의가 지금까지 어디까지 갔나</span>
          <div className="ml-auto flex gap-1">
            {CAT_TABS.map(t => (
              <button key={t.key} onClick={() => setCat(t.key)}
                className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${cat === t.key ? 'bg-accent text-white' : 'text-txt-secondary border border-border-primary hover:bg-surface-tertiary'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 올해 누적 요약 */}
        <div className={`grid ${gridCols} gap-3 mt-4 pb-1`}>
          <span className="text-[11px] text-txt-tertiary self-end">누적</span>
          {(['문의 (콜)', '실측 (미팅)', '신청 (접수)', ...(showApprove ? [cat === '전체' ? '승인 (소규모)' : '승인'] : [])]).map(h => (
            <span key={h} className="text-[11px] text-txt-tertiary">{h}</span>
          ))}
        </div>
        <div className={`grid ${gridCols} gap-3 items-center`}>
          <span className="text-[11px] font-medium text-txt-secondary">{year}년</span>
          {[total.calls, total.meets, total.intakes, ...(showApprove ? [total.approved] : [])].map((v, i) => (
            <div key={i} className="min-w-0">
              <div className="text-[17px] font-semibold leading-tight text-txt-primary tabular-nums">
                {loading ? '–' : v}
                {i > 0 && !loading && <span className="text-[11px] font-normal text-txt-tertiary ml-1">{pct(v, total.calls)}%</span>}
              </div>
              <div className="h-[5px] rounded-full bg-surface-tertiary mt-1 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${total.calls > 0 ? Math.max(pct(v, total.calls), 2) : 0}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
        {cat === '수도' && (
          <p className="text-[11px] text-txt-quaternary mt-2">수도는 별도 승인 절차가 없어 신청 접수가 곧 승인입니다.</p>
        )}
      </div>

      {/* 월별 표 */}
      <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
        <div className={`grid ${gridCols} gap-3 px-5 py-2.5 text-[11px] text-txt-tertiary bg-surface-secondary`}>
          <span>월</span>
          <span>문의 (콜)</span>
          <span>실측 (미팅)</span>
          <span>신청 (접수)</span>
          {showApprove && <span>{cat === '전체' ? '승인 (소규모)' : '승인'}</span>}
        </div>

        {loading ? (
          <div className="text-center py-10 text-txt-quaternary text-[13px]">불러오는 중...</div>
        ) : monthStats.map(({ ym, label, stat }) => (
          <div key={ym} className={`grid ${gridCols} gap-3 items-center px-5 py-2.5 border-t border-border-tertiary`}>
            <span className="text-[12px] font-medium text-txt-secondary tabular-nums">{label}</span>
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-[13px] font-semibold text-txt-primary tabular-nums w-8 shrink-0">{stat.calls}</span>
              <div className="flex-1 h-[6px] rounded-full bg-surface-tertiary overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round((stat.calls / maxCalls) * 100)}%`, background: color, opacity: 0.75 }} />
              </div>
            </div>
            {cell(stat.meets, stat.calls)}
            {cell(stat.intakes, stat.calls)}
            {showApprove && cell(stat.approved, stat.calls)}
          </div>
        ))}

        {/* 합계 행 */}
        {!loading && (
          <div className={`grid ${gridCols} gap-3 items-center px-5 py-2.5 border-t border-border-tertiary bg-surface-secondary`}>
            <span className="text-[12px] font-semibold text-txt-primary">합계</span>
            <span className="text-[13px] font-semibold text-txt-primary tabular-nums">{total.calls}</span>
            {cell(total.meets, total.calls)}
            {cell(total.intakes, total.calls)}
            {showApprove && cell(total.approved, total.calls)}
          </div>
        )}
      </div>

      {/* 카운팅 규칙 안내 */}
      <div className="bg-surface-secondary rounded-[10px] border border-dashed border-border-primary px-5 py-3">
        <p className="text-[11.5px] text-txt-tertiary leading-relaxed">
          <b className="font-semibold text-txt-secondary">집계 규칙 (접수대장 10단계 연동)</b> —
          문의(콜) = 등록 전부 (문의(예약)·취소 포함) · 실측 = 현재 단계가 실측 이상 · 신청 = 신청서제출 이상 · 승인 = 승인 이상.
          취소 건은 콜에만 집계되고 단계 도달에서 빠집니다. 월 귀속은 등록월 코호트라
          지난달 문의가 이번 달 승인되면 지난달 줄의 승인으로 잡힙니다 — 전환율이 매달 소급 갱신되는 것이 정상입니다.
          작년 데이터가 쌓이면 전년 동월 비교가 이 표에 추가됩니다.
        </p>
      </div>
    </div>
  )
}
