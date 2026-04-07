'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle, Clock, FileText, Building2, CreditCard, Landmark, Receipt, CircleDot } from 'lucide-react'

// ========================================
// 법정 세무 일정 데이터 (매년 반복)
// 코스카(대한전문건설협회) 세무달력 기준
// ========================================

type TaxCategory = 'tax' | 'insurance' | 'labor' | 'construction' | 'property' | 'vat'

interface TaxEvent {
  day: number           // 일자 (0 = 말일)
  title: string
  description?: string
  category: TaxCategory
  months: number[]      // 적용 월 (빈 배열 = 매월)
  weekdayAdjust?: boolean // 주말→다음 영업일 보정 (기본 true)
}

const CAT_STYLE: Record<TaxCategory, { bg: string; text: string; label: string; icon: typeof Calendar }> = {
  tax:          { bg: 'bg-[#fee2e2]', text: 'text-[#991b1b]', label: '세금', icon: Receipt },
  insurance:    { bg: 'bg-[#e0e7ff]', text: 'text-[#3730a3]', label: '보험', icon: FileText },
  labor:        { bg: 'bg-[#ffedd5]', text: 'text-[#9a3412]', label: '노무', icon: Building2 },
  construction: { bg: 'bg-[#fef3c7]', text: 'text-[#92400e]', label: '건설', icon: Landmark },
  property:     { bg: 'bg-[#ede9fe]', text: 'text-[#5b21b6]', label: '재산', icon: CreditCard },
  vat:          { bg: 'bg-[#d1fae5]', text: 'text-[#065f46]', label: '부가세', icon: CircleDot },
}

// 매월 반복 일정
const MONTHLY_EVENTS: TaxEvent[] = [
  {
    day: 5, title: '자격변동 신고',
    description: '일용근로자 국민연금·건강보험 자격변동 신고',
    category: 'insurance', months: [],
  },
  {
    day: 9, title: '경정고지 재산정',
    description: '(건설현장 사업장) 국민연금·건강보험료 수시 경정고지 재산정',
    category: 'insurance', months: [],
  },
  {
    day: 10, title: '원천세·보험료 납부',
    description: '원천세·주민세(종업원분) 신고 납부 / 국민연금·건강보험료 납부',
    category: 'tax', months: [],
  },
  {
    day: 15, title: '근로내용 확인신고',
    description: '고용·산재 근로내용 확인신고',
    category: 'labor', months: [],
  },
  {
    day: 0, title: '지급명세서 제출',
    description: '일용근로소득 지급명세서 제출(전월분) / 간이지급명세서(근로소득, 거주자의 사업소득) 제출',
    category: 'labor', months: [],
  },
]

// 분기별 부가세
const QUARTERLY_EVENTS: TaxEvent[] = [
  { day: 25, title: '부가세 2기 확정신고', description: '부가가치세 2기 확정신고 납부', category: 'vat', months: [1] },
  { day: 25, title: '부가세 1기 예정신고', description: '부가가치세 1기 예정신고 납부', category: 'vat', months: [4] },
  { day: 25, title: '부가세 1기 확정신고', description: '부가가치세 1기 확정신고 납부', category: 'vat', months: [7] },
  { day: 25, title: '부가세 2기 예정신고', description: '부가가치세 2기 예정신고 납부', category: 'vat', months: [10] },
]

// 반기/연간 특수 일정
const SPECIAL_EVENTS: TaxEvent[] = [
  // 1월
  { day: 10, title: '원천세 반기납부', description: '원천세 반기납부(전년 하반기분, 반기납 포함)', category: 'tax', months: [1] },
  { day: 31, title: '면허세 납부', description: '등록면허세(면허분) 납부', category: 'property', months: [1] },
  // 3월
  { day: 31, title: '법인세 신고', description: '12월말 결산법인 법인세 신고 납부', category: 'tax', months: [3] },
  // 5월
  { day: 31, title: '종합소득세 신고', description: '종합소득세 확정신고 납부', category: 'tax', months: [5] },
  // 6월
  { day: 1, title: '실적확인서 제출', description: '전년도 실적확인서 제출 / 중앙회 원자료 제출', category: 'construction', months: [6] },
  { day: 30, title: '재산세 납부', description: '재산세(주택분 1/2, 토지분) 납부 / 자동차세 1기분 납부', category: 'property', months: [6] },
  { day: 30, title: '원천세 반기 신청', description: '원천세 반기납부 법인 하반기분 신청기한', category: 'tax', months: [6] },
  // 7월
  { day: 10, title: '원천세 반기납부', description: '원천세 반기납부(상반기분, 반기납 포함)', category: 'tax', months: [7] },
  { day: 31, title: '재산세 납부', description: '재산세(주택분 1/2, 주택 이외 건축물) 납부 / 자동차세 납부', category: 'property', months: [7] },
  { day: 31, title: '시공능력평가 공시', description: '시공능력평가 공시', category: 'construction', months: [7] },
  // 8월
  { day: 3, title: '시공능력평가 재측정', description: '시공능력평가 재측정기한 / 소액기자재 수급 마감', category: 'construction', months: [8] },
  { day: 31, title: '가산자산 거래명세서', description: '가산자산 거래명세서(특가법) 제출(4~6월분)', category: 'tax', months: [8] },
  // 9월
  { day: 15, title: '근로장려금 신청', description: '근로장려금 반기분 신청기한', category: 'labor', months: [9] },
  { day: 30, title: '종부세 과세특례', description: '종합부동산세 정기분 과세특례 신고', category: 'property', months: [9] },
  { day: 30, title: '원천세 반기 신청', description: '원천세 반기납부 법인 하반기분 신청기한', category: 'tax', months: [9] },
  // 12월
  { day: 31, title: '종합부동산세 납부', description: '종합부동산세 납부', category: 'property', months: [12] },
  { day: 31, title: '자동차세 2기분', description: '자동차세 2기분 납부', category: 'property', months: [12] },
]

const ALL_RECURRING = [...MONTHLY_EVENTS, ...QUARTERLY_EVENTS, ...SPECIAL_EVENTS]

// ========================================
// 유틸
// ========================================

function getLastDay(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function getDayOfWeek(year: number, month: number, day: number) {
  return new Date(year, month - 1, day).getDay()
}

// 주말→다음 영업일 보정
function adjustForWeekend(year: number, month: number, day: number): number {
  const dow = getDayOfWeek(year, month, day)
  if (dow === 6) return day + 2 // 토→월
  if (dow === 0) return day + 1 // 일→월
  return day
}

// 공휴일 (2026년 한국)
function getHolidays(year: number): Map<string, string> {
  const h = new Map<string, string>()
  // 고정 공휴일
  h.set(`${year}-01-01`, '신정')
  h.set(`${year}-03-01`, '삼일절')
  h.set(`${year}-05-05`, '어린이날')
  h.set(`${year}-06-06`, '현충일')
  h.set(`${year}-08-15`, '광복절')
  h.set(`${year}-10-03`, '개천절')
  h.set(`${year}-10-09`, '한글날')
  h.set(`${year}-12-25`, '크리스마스')
  // 2026 음력 공휴일 (고정)
  if (year === 2026) {
    h.set('2026-02-16', '설날 전날')
    h.set('2026-02-17', '설날')
    h.set('2026-02-18', '설날 다음날')
    h.set('2026-05-24', '부처님오신날')
    h.set('2026-10-04', '추석 전날')
    h.set('2026-10-05', '추석')
    h.set('2026-10-06', '추석 다음날')
    h.set('2026-10-05', '대체공휴일')
  }
  if (year === 2027) {
    h.set('2027-02-06', '설날 전날')
    h.set('2027-02-07', '설날')
    h.set('2027-02-08', '설날 다음날')
    h.set('2027-05-13', '부처님오신날')
    h.set('2027-09-24', '추석 전날')
    h.set('2027-09-25', '추석')
    h.set('2027-09-26', '추석 다음날')
  }
  return h
}

interface CalEvent {
  day: number
  adjustedDay: number
  title: string
  description: string
  category: TaxCategory
  isAdjusted: boolean
}

function generateEventsForMonth(year: number, month: number): CalEvent[] {
  const lastDay = getLastDay(year, month)
  const events: CalEvent[] = []

  ALL_RECURRING.forEach(ev => {
    // 해당 월에 적용?
    if (ev.months.length > 0 && !ev.months.includes(month)) return

    const rawDay = ev.day === 0 ? lastDay : Math.min(ev.day, lastDay)
    const adjDay = (ev.weekdayAdjust !== false) ? adjustForWeekend(year, month, rawDay) : rawDay
    const finalDay = Math.min(adjDay, getLastDay(year, month) + 2) // 다음달로 넘어갈 수 있음

    events.push({
      day: rawDay,
      adjustedDay: finalDay > lastDay ? rawDay : finalDay, // 넘어가면 원래 날짜 유지
      title: ev.title,
      description: ev.description || '',
      category: ev.category,
      isAdjusted: finalDay !== rawDay && finalDay <= lastDay,
    })
  })

  // 날짜순 정렬
  events.sort((a, b) => a.adjustedDay - b.adjustedDay)
  return events
}

// ========================================
// 컴포넌트
// ========================================

export default function AccountingCalendarPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')

  const holidays = useMemo(() => getHolidays(year), [year])
  const events = useMemo(() => generateEventsForMonth(year, month), [year, month])

  // 캘린더 그리드
  const calendarGrid = useMemo(() => {
    const firstDow = getDayOfWeek(year, month, 1)
    const lastDay = getLastDay(year, month)
    const grid: (number | null)[] = []
    for (let i = 0; i < firstDow; i++) grid.push(null)
    for (let d = 1; d <= lastDay; d++) grid.push(d)
    while (grid.length % 7 !== 0) grid.push(null)
    return grid
  }, [year, month])

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }
  const goToday = () => {
    setYear(today.getFullYear())
    setMonth(today.getMonth() + 1)
    setSelectedDay(today.getDate())
  }

  const isToday = (d: number) => year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate()
  const isWeekend = (d: number) => { const dow = getDayOfWeek(year, month, d); return dow === 0 || dow === 6 }
  const getHoliday = (d: number) => holidays.get(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  const getEventsForDay = (d: number) => events.filter(e => e.adjustedDay === d)

  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : []

  // D-day 계산
  const getDday = (eventDay: number) => {
    const target = new Date(year, month - 1, eventDay)
    target.setHours(0, 0, 0, 0)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const diff = Math.round((target.getTime() - now.getTime()) / 86400000)
    if (diff === 0) return 'D-DAY'
    if (diff > 0) return `D-${diff}`
    return `D+${Math.abs(diff)}`
  }

  // 이번 달 다가오는 일정 (오늘 이후)
  const upcoming = events.filter(e => {
    if (year !== today.getFullYear() || month !== today.getMonth() + 1) return true
    return e.adjustedDay >= today.getDate()
  }).slice(0, 5)

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">회계달력</h1>
          <div className="flex bg-surface-secondary rounded-lg p-0.5">
            <button onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-[13px] rounded-md transition ${viewMode === 'calendar' ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-tertiary'}`}>
              달력
            </button>
            <button onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-[13px] rounded-md transition ${viewMode === 'list' ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-tertiary'}`}>
              목록
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => { setYear(Number(e.target.value)); setSelectedDay(null) }}
            className="h-[36px] border border-border-primary rounded-lg px-3 text-[13px] text-txt-primary bg-surface focus:border-accent focus:ring-2 focus:ring-accent-light outline-none">
            {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <button onClick={goToday} className="h-[36px] px-4 border border-border-primary rounded-lg text-[13px] text-txt-secondary hover:bg-surface-tertiary transition">
            오늘
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <div className="flex gap-5">
          {/* 캘린더 */}
          <div className="flex-1 bg-surface rounded-[10px] border border-border-primary overflow-hidden">
            {/* 월 네비 */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-tertiary">
              <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-tertiary transition">
                <ChevronLeft size={18} className="text-txt-secondary" />
              </button>
              <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">{year}년 {month}월</h2>
              <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-tertiary transition">
                <ChevronRight size={18} className="text-txt-secondary" />
              </button>
            </div>

            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 border-b border-border-tertiary">
              {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                <div key={d} className={`text-center py-2 text-[11px] font-medium tracking-[0.3px] ${i === 0 ? 'text-[#dc2626]' : i === 6 ? 'text-[#3730a3]' : 'text-txt-tertiary'}`}>
                  {d}
                </div>
              ))}
            </div>

            {/* 날짜 그리드 */}
            <div className="grid grid-cols-7">
              {calendarGrid.map((day, idx) => {
                if (day === null) return <div key={idx} className="h-[90px] border-b border-r border-border-tertiary bg-surface-secondary/30" />
                const dayEvents = getEventsForDay(day)
                const holiday = getHoliday(day)
                const weekend = isWeekend(day)
                const isSelected = selectedDay === day
                const isTodayCell = isToday(day)
                const dow = getDayOfWeek(year, month, day)

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                    className={`h-[90px] border-b border-r border-border-tertiary px-1.5 py-1 cursor-pointer transition group ${
                      isSelected ? 'bg-accent-light' : isTodayCell ? 'bg-[#fffbeb]' : 'hover:bg-surface-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-[13px] font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                        isTodayCell ? 'bg-accent text-white' :
                        holiday ? 'text-[#dc2626]' :
                        dow === 0 ? 'text-[#dc2626]' :
                        dow === 6 ? 'text-[#3730a3]' :
                        'text-txt-primary'
                      }`}>
                        {day}
                      </span>
                      {holiday && <span className="text-[9px] text-[#dc2626] truncate max-w-[50px]">{holiday}</span>}
                    </div>
                    <div className="space-y-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map((ev, i) => {
                        const style = CAT_STYLE[ev.category]
                        return (
                          <div key={i} className={`text-[9px] leading-tight px-1 py-0.5 rounded truncate ${style.bg} ${style.text}`}>
                            {ev.title}
                          </div>
                        )
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-[9px] text-txt-tertiary text-center">+{dayEvents.length - 3}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 사이드 패널 */}
          <div className="w-[320px] space-y-4">
            {/* 선택된 날짜 상세 */}
            {selectedDay !== null ? (
              <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border-tertiary">
                  <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">
                    {month}월 {selectedDay}일 {['일', '월', '화', '수', '목', '금', '토'][getDayOfWeek(year, month, selectedDay)]}요일
                  </h3>
                  {getHoliday(selectedDay) && (
                    <span className="text-[11px] text-[#dc2626] font-medium">{getHoliday(selectedDay)}</span>
                  )}
                </div>
                <div className="px-5 py-3">
                  {selectedEvents.length === 0 ? (
                    <p className="text-[13px] text-txt-quaternary py-4 text-center">세무 일정 없음</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedEvents.map((ev, i) => {
                        const style = CAT_STYLE[ev.category]
                        const Icon = style.icon
                        const dday = getDday(ev.adjustedDay)
                        return (
                          <div key={i} className={`rounded-lg px-4 py-3 ${style.bg}`}>
                            <div className="flex items-start gap-2.5">
                              <Icon size={16} className={`${style.text} mt-0.5 shrink-0`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className={`text-[13px] font-semibold ${style.text}`}>{ev.title}</span>
                                  <span className={`text-[11px] font-medium shrink-0 ${
                                    dday === 'D-DAY' ? 'text-[#dc2626]' :
                                    dday.startsWith('D-') && parseInt(dday.slice(2)) <= 3 ? 'text-[#d97706]' :
                                    'text-txt-tertiary'
                                  }`}>{dday}</span>
                                </div>
                                <p className="text-[11px] text-txt-secondary mt-1 leading-relaxed">{ev.description}</p>
                                {ev.isAdjusted && (
                                  <p className="text-[10px] text-txt-tertiary mt-1 flex items-center gap-1">
                                    <Clock size={10} /> 주말 보정: {ev.day}일 → {ev.adjustedDay}일
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-surface rounded-[10px] border border-border-primary px-5 py-6 text-center">
                <Calendar size={24} className="text-txt-quaternary mx-auto mb-2" />
                <p className="text-[13px] text-txt-tertiary">날짜를 클릭하면 상세 일정을 볼 수 있습니다</p>
              </div>
            )}

            {/* 다가오는 일정 */}
            <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border-tertiary">
                <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary flex items-center gap-2">
                  <AlertTriangle size={14} className="text-txt-tertiary" />
                  다가오는 일정
                </h3>
              </div>
              <div className="px-4 py-2">
                {upcoming.length === 0 ? (
                  <p className="text-[13px] text-txt-quaternary py-3 text-center">이번 달 남은 일정 없음</p>
                ) : (
                  upcoming.map((ev, i) => {
                    const style = CAT_STYLE[ev.category]
                    const dday = getDday(ev.adjustedDay)
                    return (
                      <div key={i} className="flex items-center gap-3 py-2.5 border-b border-border-tertiary last:border-0"
                        onClick={() => setSelectedDay(ev.adjustedDay)}>
                        <span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium ${style.bg} ${style.text}`}>{style.label}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-[13px] text-txt-primary truncate block">{ev.title}</span>
                          <span className="text-[11px] text-txt-tertiary">{month}/{ev.adjustedDay}</span>
                        </div>
                        <span className={`text-[11px] font-medium shrink-0 ${
                          dday === 'D-DAY' ? 'text-[#dc2626]' :
                          dday.startsWith('D-') && parseInt(dday.slice(2)) <= 3 ? 'text-[#d97706]' :
                          dday.startsWith('D+') ? 'text-txt-quaternary' :
                          'text-txt-tertiary'
                        }`}>{dday}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* 카테고리 범례 */}
            <div className="bg-surface rounded-[10px] border border-border-primary px-5 py-3.5">
              <h3 className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-2">카테고리</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(CAT_STYLE).map(([key, style]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-sm ${style.bg}`} />
                    <span className="text-[11px] text-txt-secondary">{style.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 목록 뷰 */
        <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-tertiary">
            <div className="flex items-center gap-3">
              <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-tertiary transition">
                <ChevronLeft size={18} className="text-txt-secondary" />
              </button>
              <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">{year}년 {month}월</h2>
              <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-tertiary transition">
                <ChevronRight size={18} className="text-txt-secondary" />
              </button>
            </div>
            <span className="text-[11px] text-txt-tertiary">{events.length}건</span>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-16 text-txt-quaternary text-[13px]">이번 달 세무 일정 없음</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-surface-secondary border-b border-border-primary">
                  <th className="px-5 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary w-[70px]">일자</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary w-[70px]">구분</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">일정</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">상세</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-medium tracking-[0.3px] text-txt-tertiary w-[60px]">D-day</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, i) => {
                  const style = CAT_STYLE[ev.category]
                  const dday = getDday(ev.adjustedDay)
                  const isPast = dday.startsWith('D+')
                  return (
                    <tr key={i} className={`border-b border-border-tertiary h-[44px] hover:bg-surface-tertiary transition ${isPast ? 'opacity-40' : ''}`}>
                      <td className="px-5 py-2.5 tabular-nums text-txt-primary font-medium">
                        {month}/{ev.adjustedDay}
                        {ev.isAdjusted && <span className="text-[9px] text-txt-tertiary ml-0.5">*</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium ${style.bg} ${style.text}`}>{style.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-txt-primary font-medium">{ev.title}</td>
                      <td className="px-4 py-2.5 text-txt-secondary text-[12px] max-w-[400px]">
                        <span className="line-clamp-1">{ev.description}</span>
                      </td>
                      <td className={`px-5 py-2.5 text-right text-[12px] font-medium tabular-nums ${
                        dday === 'D-DAY' ? 'text-[#dc2626]' :
                        dday.startsWith('D-') && parseInt(dday.slice(2)) <= 3 ? 'text-[#d97706]' :
                        isPast ? 'text-txt-quaternary' :
                        'text-txt-tertiary'
                      }`}>{dday}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {events.some(e => e.isAdjusted) && (
            <div className="px-5 py-2 border-t border-border-tertiary">
              <p className="text-[10px] text-txt-tertiary flex items-center gap-1">
                <Clock size={10} /> * 주말/공휴일이 포함되어 다음 영업일로 보정된 일자입니다
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
