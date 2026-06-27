'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowRight } from 'lucide-react'

interface IntakeRow {
  id: string
  building_name: string | null
  road_address: string | null
  region: string | null
  created_at: string
  total_cost: number | null
  status: string | null
  staff: { id: string; name: string } | null
  cities: { name: string } | null
  work_types: { work_categories: { name: string } | null } | null
}

// 수도 = 파랑, 소규모 = 주황 (대시보드 인라인 hex 컨벤션)
const C_WATER = '#2563eb'
const C_WATER_BG = '#dde9fb'
const C_WATER_TX = '#1d4ed8'
const C_SMALL = '#d97706'
const C_SMALL_BG = '#fbedd5'
const C_SMALL_TX = '#b45309'
const C_UP = '#1a7f4b'

// 월요일 00:00 (로컬) 기준 주 시작
function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay() // 0=일 ~ 6=토
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function catOf(row: IntakeRow): '수도' | '소규모' | null {
  const name = row.work_types?.work_categories?.name
  if (name === '수도') return '수도'
  if (name === '소규모') return '소규모'
  return null
}

function regionLabel(row: IntakeRow): string {
  return row.cities?.name || row.region || ''
}
function buildingLabel(row: IntakeRow): string {
  return row.building_name || row.road_address || '(이름 없음)'
}
function dateLabel(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
function costLabel(n: number | null): string {
  if (!n || n <= 0) return '—'
  const man = Math.round(n / 10000)
  if (man >= 10000) {
    const eok = man / 10000
    return `${eok % 1 === 0 ? eok : eok.toFixed(1)}억`
  }
  return `${man.toLocaleString()}만`
}

type Filter = 'all' | '수도' | '소규모'

export default function WeeklyIntakeCard() {
  const [rows, setRows] = useState<IntakeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  // 6주치 조회 범위 (이번주 포함 최근 6주)
  const { thisWeekStart, weekStarts, rangeStart } = useMemo(() => {
    const tws = startOfWeek(new Date())
    const starts: Date[] = []
    for (let i = 5; i >= 0; i--) {
      const s = new Date(tws)
      s.setDate(s.getDate() - i * 7)
      starts.push(s)
    }
    return { thisWeekStart: tws, weekStarts: starts, rangeStart: starts[0] }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id, building_name, road_address, region, created_at, total_cost, status,
          staff:staff_id ( id, name ),
          cities:city_id ( name ),
          work_types:work_type_id ( work_categories:category_id ( name ) )
        `)
        .is('cancel_reason', null)
        .gte('created_at', rangeStart.toISOString())
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (!error && data) setRows(data as unknown as IntakeRow[])
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [rangeStart])

  // 주별 집계 (6주)
  const weekly = useMemo(() => {
    const buckets = weekStarts.map(() => ({ water: 0, small: 0, total: 0 }))
    const bounds = weekStarts.map(s => s.getTime())
    for (const r of rows) {
      const t = new Date(r.created_at).getTime()
      let idx = -1
      for (let i = bounds.length - 1; i >= 0; i--) {
        if (t >= bounds[i]) { idx = i; break }
      }
      if (idx < 0) continue
      const b = buckets[idx]
      b.total++
      const c = catOf(r)
      if (c === '수도') b.water++
      else if (c === '소규모') b.small++
    }
    return buckets
  }, [rows, weekStarts])

  const thisWeek = weekly[5]
  const lastWeek = weekly[4]
  const totalDelta = thisWeek.total - lastWeek.total
  const wowPct = lastWeek.total > 0 ? Math.round((totalDelta / lastWeek.total) * 100) : null
  const waterDelta = thisWeek.water - lastWeek.water
  const smallDelta = thisWeek.small - lastWeek.small

  // 이번주 접수 내역 (필터 적용)
  const thisWeekRows = useMemo(() => {
    const tws = thisWeekStart.getTime()
    return rows.filter(r => new Date(r.created_at).getTime() >= tws)
  }, [rows, thisWeekStart])
  const filteredRows = useMemo(
    () => filter === 'all' ? thisWeekRows : thisWeekRows.filter(r => catOf(r) === filter),
    [thisWeekRows, filter],
  )

  // 스파크라인 좌표
  const totals = weekly.map(w => w.total)
  const maxT = Math.max(1, ...totals)
  const minT = Math.min(...totals)
  const range = Math.max(1, maxT - minT)
  const SW = 116, SH = 36, pad = 3
  const points = totals
    .map((v, i) => {
      const x = (i / (totals.length - 1)) * SW
      const y = SH - ((v - minT) / range) * (SH - 2 * pad) - pad
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const lastY = (SH - ((totals[5] - minT) / range) * (SH - 2 * pad) - pad).toFixed(1)

  const smallTotal = thisWeek.small
  const waterTotal = thisWeek.water
  const splitSum = Math.max(1, smallTotal + waterTotal)

  const delta = (n: number) =>
    n > 0 ? <span className="text-[11px]" style={{ color: C_UP }}>▲{n}</span>
      : n < 0 ? <span className="text-[11px] text-txt-tertiary">▽{Math.abs(n)}</span>
      : <span className="text-[11px] text-txt-tertiary">—</span>

  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: '소규모', label: '소규모' },
    { key: '수도', label: '수도' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* ===== 상단 요약 2카드 ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 이번 주 총 접수 + 6주 추이 */}
        <div className="bg-surface rounded-[10px] border border-border-primary px-5 py-4">
          <div className="flex items-center gap-1.5 text-[12px] text-txt-secondary">
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: '#e2661f' }} />이번 주 총 접수
          </div>
          <div className="flex items-end justify-between mt-1.5">
            <div>
              <div className="text-[30px] font-semibold leading-none text-txt-primary">
                {loading ? '–' : thisWeek.total}<span className="text-[14px] font-normal text-txt-secondary">건</span>
              </div>
              <div className="text-[12px] mt-1.5">
                {totalDelta > 0
                  ? <span style={{ color: C_UP }}>▲{totalDelta}건{wowPct !== null && ` (+${wowPct}%)`} <span className="text-txt-tertiary">지난주 {lastWeek.total}건</span></span>
                  : totalDelta < 0
                  ? <span className="text-txt-tertiary">▽{Math.abs(totalDelta)}건 · 지난주 {lastWeek.total}건</span>
                  : <span className="text-txt-tertiary">지난주와 동일 ({lastWeek.total}건)</span>}
              </div>
            </div>
            <svg viewBox={`0 0 ${SW} ${SH}`} width="120" height="40" aria-hidden="true" style={{ overflow: 'visible' }}>
              <polyline points={points} fill="none" stroke="#e2661f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={SW} cy={lastY} r="3" fill="#e2661f" />
            </svg>
          </div>
          <div className="text-[11px] text-txt-quaternary mt-1">최근 6주 추이</div>
        </div>

        {/* 분류별 접수 */}
        <div className="bg-surface rounded-[10px] border border-border-primary px-5 py-4">
          <div className="text-[12px] text-txt-secondary mb-2.5">분류별 접수</div>
          <div className="flex h-3 rounded-md overflow-hidden mb-3 bg-surface-tertiary">
            {smallTotal > 0 && <div style={{ width: `${(smallTotal / splitSum) * 100}%`, background: C_SMALL }} />}
            {waterTotal > 0 && <div style={{ width: `${(waterTotal / splitSum) * 100}%`, background: C_WATER }} />}
          </div>
          <div className="flex gap-5">
            <div className="flex-1">
              <div className="text-[11px] text-txt-secondary flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: C_SMALL }} />소규모</div>
              <div className="text-[18px] font-semibold mt-0.5 text-txt-primary">{smallTotal}<span className="text-[12px] font-normal text-txt-secondary">건</span> {delta(smallDelta)}</div>
            </div>
            <div className="flex-1">
              <div className="text-[11px] text-txt-secondary flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: C_WATER }} />수도공사</div>
              <div className="text-[18px] font-semibold mt-0.5 text-txt-primary">{waterTotal}<span className="text-[12px] font-normal text-txt-secondary">건</span> {delta(waterDelta)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 이번 주 접수 내역 표 ===== */}
      <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border-tertiary flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-txt-primary">이번 주 접수 내역</span>
            <span className="text-[11px] text-txt-tertiary">{thisWeekRows.length}건</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setFilter(t.key)}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${filter === t.key ? 'bg-accent text-white' : 'text-txt-secondary border border-border-primary hover:bg-surface-tertiary'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <a href="/register/small" className="text-[12px] text-accent hover:underline flex items-center gap-0.5 shrink-0">접수대장 <ArrowRight size={13} /></a>
          </div>
        </div>

        {/* 헤더 행 */}
        <div className="grid grid-cols-[40px_44px_minmax(0,1fr)_44px_58px_60px_84px] gap-1.5 px-4 py-2 text-[11px] text-txt-tertiary border-b border-border-tertiary">
          <span>날짜</span><span>분류</span><span>현장/빌라</span><span>지역</span><span className="text-right">공사비</span><span>상태</span><span>담당</span>
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {loading ? (
            <div className="text-center py-10 text-txt-quaternary text-[13px]">불러오는 중...</div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-10 text-txt-quaternary text-[13px]">이번 주 접수 없음</div>
          ) : filteredRows.map(r => {
            const cat = catOf(r)
            const href = cat === '수도' ? `/register/water?project=${r.id}` : `/register/small?project=${r.id}`
            return (
              <a key={r.id} href={href} className="grid grid-cols-[40px_44px_minmax(0,1fr)_44px_58px_60px_84px] gap-1.5 items-center px-4 min-h-[34px] py-1 border-b border-border-tertiary last:border-0 hover:bg-surface-tertiary transition-colors">
                <span className="text-[11px] text-txt-tertiary">{dateLabel(r.created_at)}</span>
                <span className="text-[10.5px] font-medium px-0 py-0.5 rounded text-center"
                  style={cat === '수도' ? { color: C_WATER_TX, background: C_WATER_BG }
                    : cat === '소규모' ? { color: C_SMALL_TX, background: C_SMALL_BG }
                    : { color: 'var(--txt-tertiary)', background: 'transparent' }}>
                  {cat ?? '기타'}
                </span>
                <span className="text-[12.5px] text-txt-primary truncate">{buildingLabel(r)}</span>
                <span className="text-[11px] text-txt-secondary truncate">{regionLabel(r)}</span>
                <span className="text-[11px] text-txt-primary text-right tabular-nums">{costLabel(r.total_cost)}</span>
                <span className="text-[11px] text-txt-secondary truncate" title={r.status ?? ''}>{r.status ?? '—'}</span>
                <span className="flex items-center gap-1 min-w-0" title={r.staff?.name ?? '미지정'}>
                  <span className="w-[18px] h-[18px] rounded-full bg-surface-tertiary text-txt-secondary text-[9.5px] flex items-center justify-center shrink-0">{r.staff?.name?.charAt(0) ?? '–'}</span>
                  <span className="text-[11px] text-txt-secondary truncate">{r.staff?.name ?? '미지정'}</span>
                </span>
              </a>
            )
          })}
        </div>

        {/* 합계 행 */}
        <div className="flex items-center justify-end gap-3.5 px-4 py-2.5 bg-surface-secondary border-t border-border-tertiary text-[11px] text-txt-secondary">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: C_SMALL }} />소규모 {thisWeek.small}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: C_WATER }} />수도공사 {thisWeek.water}</span>
          <span className="font-semibold text-txt-primary">총 {thisWeekRows.length}건</span>
        </div>
      </div>
    </div>
  )
}
