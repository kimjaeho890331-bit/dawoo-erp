'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react'

// --- 타입 ---
interface Site {
  id: string
  name: string
  status: string
}

interface Schedule {
  id: string
  site_id: string
  title: string
  start_date: string
  end_date: string
  color: string
  confirmed: boolean
}

interface BarData {
  schedule: Schedule
  site: Site | null
  left: number
  width: number
  startIdx: number
  endIdx: number
  duration: number
  isStart: boolean
  isEnd: boolean
}

// --- 헬퍼 (ProcessCalendar L42-54 복사) ---
function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1
}

// --- 메인 ---
export default function SitesTimeline() {
  const router = useRouter()
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [sites, setSites] = useState<Site[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate()
  const firstDayOfWeek = new Date(month.year, month.month, 1).getDay()
  const monthLabel = `${month.year}년 ${month.month + 1}월`
  const today = new Date().toISOString().slice(0, 10)

  const prevMonth = () => {
    setMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })
  }
  const nextMonth = () => {
    setMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })
  }
  const thisMonth = () => {
    const now = new Date()
    setMonth({ year: now.getFullYear(), month: now.getMonth() })
  }

  // 월 범위 데이터 로드
  const loadData = useCallback(async () => {
    setLoading(true)
    const firstISO = dateStr(month.year, month.month, 1)
    const lastISO = dateStr(month.year, month.month, daysInMonth)

    const [sitesRes, schedRes] = await Promise.all([
      supabase.from('sites')
        .select('id, name, status')
        .in('status', ['착공', '공사중', '계약']),
      supabase.from('schedules')
        .select('id, site_id, title, start_date, end_date, color, confirmed')
        .not('site_id', 'is', null)
        .gte('end_date', firstISO)
        .lte('start_date', lastISO),
    ])
    if (!sitesRes.error) setSites((sitesRes.data as Site[]) || [])
    if (!schedRes.error) setSchedules((schedRes.data as Schedule[]) || [])
    setLoading(false)
  }, [month, daysInMonth])

  useEffect(() => { loadData() }, [loadData])

  // 현장 id → site 매핑
  const siteMap = useMemo(() => new Map(sites.map(s => [s.id, s])), [sites])

  // 주 단위 그룹핑 (ProcessCalendar L117-130 복사)
  const weeks = useMemo(() => {
    const result: (number | null)[][] = []
    let week: (number | null)[] = []
    for (let i = 0; i < firstDayOfWeek; i++) week.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      week.push(d)
      if (week.length === 7) { result.push(week); week = [] }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null)
      result.push(week)
    }
    return result
  }, [daysInMonth, firstDayOfWeek])

  // 주별 바 클리핑 (ProcessCalendar L132-154 복사, site 정보 포함)
  const getWeekBars = useCallback((week: (number | null)[]): BarData[] => {
    const weekDates = week.map(d => d ? dateStr(month.year, month.month, d) : null)
    const weekStart = weekDates.find(d => d) || ''
    const weekEnd = [...weekDates].reverse().find(d => d) || ''

    return schedules
      .filter(s => s.start_date <= weekEnd && s.end_date >= weekStart)
      .map(s => {
        const barStart = s.start_date < weekStart ? weekStart : s.start_date
        const barEnd = s.end_date > weekEnd ? weekEnd : s.end_date
        const startIdx = weekDates.indexOf(barStart)
        const endIdx = weekDates.indexOf(barEnd)
        if (startIdx < 0 || endIdx < 0) return null
        const left = (startIdx / 7) * 100
        const width = ((endIdx - startIdx + 1) / 7) * 100
        const duration = daysBetween(s.start_date, s.end_date)
        const isStart = s.start_date >= weekStart
        const isEnd = s.end_date <= weekEnd
        return {
          schedule: s,
          site: siteMap.get(s.site_id) || null,
          left, width, startIdx, endIdx, duration, isStart, isEnd,
        } as BarData
      })
      .filter(Boolean) as BarData[]
  }, [schedules, siteMap, month])

  const openSite = (siteId: string) => {
    router.push(`/sites?open=${siteId}`)
  }

  return (
    <div className="bg-surface rounded-[10px] border border-border-primary p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Building2 size={16} className="text-[#0891b2]" />
          <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">통합 현장 스케줄</h2>
          <span className="text-[11px] text-txt-tertiary">
            진행 현장 {sites.length}곳 · 바 더블클릭 → 현장 상세
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-tertiary text-txt-tertiary hover:text-txt-primary transition-colors">
            <ChevronLeft size={16} />
          </button>
          <h3 className="text-[13px] font-semibold text-txt-primary min-w-[100px] text-center">{monthLabel}</h3>
          <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-tertiary text-txt-tertiary hover:text-txt-primary transition-colors">
            <ChevronRight size={16} />
          </button>
          <button onClick={thisMonth} className="px-2 py-0.5 text-[11px] font-medium text-txt-secondary hover:bg-surface-tertiary rounded ml-1">
            오늘
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-txt-quaternary text-[13px]">불러오는 중...</div>
      ) : sites.length === 0 ? (
        <div className="text-center py-12 text-txt-quaternary text-[13px]">진행 중인 현장 없음</div>
      ) : (
        <div>
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold mb-0.5 border-b border-border-tertiary pb-1">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} className={`py-0.5 ${i === 0 ? 'text-[#dc2626]/60' : i === 6 ? 'text-[#2563eb]/60' : 'text-txt-tertiary'}`}>{d}</div>
            ))}
          </div>

          {/* 주별 렌더링 (ProcessCalendar L353-472 복제, 편집 제거) */}
          {weeks.map((week, wi) => {
            const bars = getWeekBars(week)
            // 레인 패킹: 겹치지 않는 바를 같은 row에 몰아넣음
            const rows: BarData[][] = []
            for (const bar of bars) {
              let placed = false
              for (const row of rows) {
                const overlaps = row.some(b => !(bar.endIdx < b.startIdx || bar.startIdx > b.endIdx))
                if (!overlaps) { row.push(bar); placed = true; break }
              }
              if (!placed) rows.push([bar])
            }
            const barHeight = 20
            const barGap = 2
            const barsAreaHeight = Math.max(rows.length * (barHeight + barGap), 0)

            return (
              <div key={wi} className="border-b border-border-tertiary/50">
                {/* 날짜 숫자 */}
                <div className="grid grid-cols-7">
                  {week.map((day, di) => (
                    <div
                      key={di}
                      className={`px-1 py-0.5 text-[11px] border-r border-border-tertiary/30 last:border-r-0 ${!day ? 'bg-surface-tertiary/30' : ''}`}
                    >
                      {day && (
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px]
                          ${dateStr(month.year, month.month, day) === today ? 'bg-[#2563eb] text-white font-bold' : ''}
                          ${di === 0 ? 'text-[#dc2626]/70' : di === 6 ? 'text-[#2563eb]/70' : 'text-txt-secondary'}
                        `}>
                          {day}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* 바 영역 */}
                <div
                  className="relative grid grid-cols-7"
                  style={{ minHeight: Math.max(barsAreaHeight + 4, 56) }}
                >
                  {week.map((_, di) => (
                    <div key={di} className="border-r border-border-tertiary/30 last:border-r-0" />
                  ))}

                  {rows.map((row, ri) => (
                    row.map(bar => {
                      const s = bar.schedule
                      const site = bar.site
                      const top = ri * (barHeight + barGap) + 2
                      const barText = site ? `${s.title} · ${site.name}` : s.title
                      return (
                        <div
                          key={s.id + '-' + wi}
                          onDoubleClick={() => site && openSite(site.id)}
                          className={`absolute flex items-center rounded-md cursor-pointer group overflow-hidden transition-opacity hover:opacity-90 ${
                            s.confirmed ? 'text-white shadow-sm' : 'bg-surface shadow-sm'
                          }`}
                          style={{
                            left: `${bar.left}%`,
                            width: `calc(${bar.width}% - 2px)`,
                            top,
                            height: barHeight,
                            ...(s.confirmed
                              ? { backgroundColor: s.color }
                              : { border: `1.5px dashed ${s.color}`, color: s.color }),
                          }}
                          title={`${barText} (${s.start_date} ~ ${s.end_date}, ${bar.duration}일)${s.confirmed ? '' : ' · 미확정'}`}
                        >
                          <span className="text-[10px] font-medium px-2 truncate w-full text-center leading-tight">
                            {barText}
                          </span>
                        </div>
                      )
                    })
                  ))}
                </div>
              </div>
            )
          })}

          {/* 범례 */}
          <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-border-tertiary text-[11px] text-txt-tertiary">
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-2.5 rounded bg-[#3B82F6] inline-block" /> 확정
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-2.5 rounded border-[1.5px] border-dashed border-[#dc2626] inline-block" /> 미확정
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
