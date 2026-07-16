'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  type FunnelProjectRow, type FunnelStat,
  emptyFunnel, funnelCategoryOf, accumulateFunnel, funnelPct as pct,
} from '@/lib/funnel'

type Period = 'week' | 'month' | 'year'

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: 'year', label: '올해' },
]

// 대시보드 인라인 hex 컨벤션: 소규모 = 주황, 수도 = 파랑 (WeeklyIntakeCard와 동일)
const C_SMALL = '#d97706'
const C_SMALL_BG = '#fbedd5'
const C_SMALL_TX = '#b45309'
const C_WATER = '#2563eb'
const C_WATER_BG = '#dde9fb'
const C_WATER_TX = '#1d4ed8'
const C_UP = '#1a7f4b'
const C_SPARK = '#e2661f'

// 카운팅 규칙(10단계 연동)은 src/lib/funnel.ts 단일 소스 참조

// 월요일 00:00 (로컬) 기준 주 시작 — WeeklyIntakeCard와 동일 규칙
function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

const DAY = 24 * 3600 * 1000

export default function FunnelCard() {
  const [rows, setRows] = useState<FunnelProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('month')

  // 조회 범위: 올해 1/1 + 전월 1일 + 지난주 시작을 모두 덮는 시점부터
  const rangeStart = useMemo(() => {
    const now = new Date()
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevWeekStart = new Date(startOfWeek(now).getTime() - 7 * DAY)
    return new Date(Math.min(+yearStart, +prevMonthStart, +prevWeekStart))
  }, [])

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
          .gte('created_at', rangeStart.toISOString())
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
  }, [rangeStart])

  const stat = useMemo(() => {
    const now = new Date()
    const weekStart = startOfWeek(now)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const periodStart = period === 'week' ? weekStart : period === 'month' ? monthStart : yearStart

    // 비교 구간 — 직전 기간의 "같은 경과 시점"까지 (공정 비교)
    let prevStart: Date | null = null
    let prevEnd: Date | null = null
    if (period === 'week') {
      prevStart = new Date(+weekStart - 7 * DAY)
      prevEnd = new Date(+now - 7 * DAY)
    } else if (period === 'month') {
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 23, 59, 59)
    }
    // 올해: 작년 데이터가 아직 없어 비교 생략 (내년부터 자동 표시 가능)

    // 스파크 버킷: 주=요일별 7 / 월=주차별 5 / 올해=월별 12
    const bucketCount = period === 'week' ? 7 : period === 'month' ? 5 : 12
    const buckets = new Array<number>(bucketCount).fill(0)
    const bucketOf = (d: Date) =>
      period === 'week' ? Math.floor((+d - +weekStart) / DAY)
      : period === 'month' ? Math.min(4, Math.floor((d.getDate() - 1) / 7))
      : d.getMonth()
    const curBucket = Math.min(bucketCount - 1, Math.max(0, bucketOf(now)))

    let calls = 0
    let prev = 0
    const funnel: Record<'소규모' | '수도', FunnelStat> = {
      소규모: emptyFunnel(),
      수도: emptyFunnel(),
    }

    for (const r of rows) {
      const t = new Date(r.created_at)
      if (prevStart && prevEnd && t >= prevStart && t <= prevEnd) prev++
      if (t < periodStart) continue

      calls++ // 콜 = 등록 전부 (취소 포함)
      const b = bucketOf(t)
      if (b >= 0 && b < bucketCount) buckets[b]++

      const cat = funnelCategoryOf(r)
      if (!cat) continue
      accumulateFunnel(funnel[cat], r) // 10단계 연동 규칙: src/lib/funnel.ts
    }

    const deltaPct = prevStart && prev > 0 ? Math.round(((calls - prev) / prev) * 100) : null
    return { calls, buckets, curBucket, deltaPct, funnel }
  }, [rows, period])

  const wMax = Math.max(1, ...stat.buckets)
  const DOW = ['월', '화', '수', '목', '금', '토', '일']
  const bucketTitle = (i: number, v: number) =>
    period === 'week' ? `${DOW[i]} ${v}건` : period === 'month' ? `${i + 1}주차 ${v}건` : `${i + 1}월 ${v}건`
  const callsLabel = period === 'week' ? '이번 주 걸려온 문의' : period === 'month' ? '이번 달 걸려온 문의' : '올해 걸려온 문의'
  const sparkLabel = period === 'week' ? '요일별' : period === 'month' ? '주차별' : '월별'
  const compareLabel = period === 'week' ? '지난주 이맘때보다' : '지난달 이맘때보다'

  // 단계 셀: 숫자 + (문의 대비 %) + 채움 바 — 줄어드는 흐름이 한눈에 보이게
  const stageCell = (v: number, base: number, color: string, isFirst: boolean) => (
    <div className="min-w-0">
      <div className="text-[15px] font-semibold leading-tight text-txt-primary tabular-nums">
        {loading ? '–' : v}
        {!isFirst && !loading && (
          <span className="text-[10.5px] font-normal text-txt-tertiary ml-1">{pct(v, base)}%</span>
        )}
      </div>
      <div className="h-[5px] rounded-full bg-surface-tertiary mt-1 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${base > 0 ? Math.max(pct(v, base), 2) : 0}%`, background: color }} />
      </div>
    </div>
  )

  const funnelRow = (label: string, color: string, bg: string, tx: string, f: FunnelStat, withApprove: boolean) => (
    <div className="grid grid-cols-[52px_repeat(4,1fr)] gap-3 items-center py-2 border-b border-border-tertiary last:border-0">
      <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded text-center" style={{ color: tx, background: bg }}>{label}</span>
      {stageCell(f.calls, f.calls, color, true)}
      {stageCell(f.meets, f.calls, color, false)}
      {stageCell(f.intakes, f.calls, color, false)}
      {withApprove ? stageCell(f.approved, f.calls, color, false) : (
        <div className="text-[11px] text-txt-quaternary leading-snug" title="수도는 별도 승인 절차가 없어 신청 접수가 곧 승인입니다">
          신청 = 승인
        </div>
      )}
    </div>
  )

  return (
    <div className="bg-surface rounded-[10px] border border-border-primary px-5 py-4">
      {/* 헤더 + 기간 토글 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-semibold text-txt-primary">접수 퍼널</span>
        <span className="text-[11px] text-txt-tertiary">문의가 승인까지 얼마나 이어지는지 · 취소 제외</span>
        <div className="ml-auto flex gap-1">
          {PERIOD_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setPeriod(t.key)}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${period === t.key ? 'bg-accent text-white' : 'text-txt-secondary border border-border-primary hover:bg-surface-tertiary'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 기간 내 문의 (콜 신호) */}
      <div className="flex items-center gap-3 py-2.5 border-b border-border-tertiary flex-wrap">
        <span className="text-[12px] text-txt-secondary shrink-0">{callsLabel}</span>
        <span className="text-[22px] font-semibold leading-none text-txt-primary tabular-nums">
          {loading ? '–' : stat.calls}<span className="text-[12px] font-normal text-txt-secondary">건</span>
        </span>
        <span className="inline-flex items-end gap-[3px] h-[20px]" aria-hidden="true">
          {stat.buckets.map((v, i) => (
            <span
              key={i}
              title={bucketTitle(i, v)}
              className="inline-block rounded-t-[2px]"
              style={{
                width: period === 'year' ? 6 : 8,
                height: i > stat.curBucket ? 3 : Math.max(Math.round((v / wMax) * 20), 3),
                background: i > stat.curBucket ? 'var(--color-surface-tertiary)' : C_SPARK,
                opacity: i === stat.curBucket ? 1 : 0.75,
              }}
            />
          ))}
        </span>
        <span className="text-[10px] text-txt-quaternary -ml-1">{sparkLabel}</span>
        {!loading && stat.deltaPct !== null && (
          <span className="text-[11px] font-medium tabular-nums" style={{ color: stat.deltaPct >= 0 ? C_UP : 'var(--color-txt-tertiary)' }}>
            {compareLabel} {stat.deltaPct >= 0 ? '+' : ''}{stat.deltaPct}%
          </span>
        )}
        {!loading && period === 'year' && (
          <span className="text-[11px] text-txt-quaternary">작년 대비는 데이터가 쌓이면 표시</span>
        )}
      </div>

      {/* 단계 헤더 */}
      <div className="grid grid-cols-[52px_repeat(4,1fr)] gap-3 pt-2.5 pb-0.5">
        <span />
        <span className="text-[11px] text-txt-tertiary">문의 (콜)</span>
        <span className="text-[11px] text-txt-tertiary">실측 (미팅)</span>
        <span className="text-[11px] text-txt-tertiary">신청 (접수)</span>
        <span className="text-[11px] text-txt-tertiary">승인</span>
      </div>

      {/* 퍼널 2줄 */}
      {funnelRow('소규모', C_SMALL, C_SMALL_BG, C_SMALL_TX, stat.funnel['소규모'], true)}
      {funnelRow('수도', C_WATER, C_WATER_BG, C_WATER_TX, stat.funnel['수도'], false)}

      <div className="text-[11px] text-txt-quaternary mt-2">
        실측에서 크게 줄면 → 홍보 위치 점검 · 신청에서 크게 줄면 → 상담 방식 점검
        {period === 'week' && ' · 이번 주 등록 건은 아직 진행 중일 수 있음'}
      </div>
    </div>
  )
}
