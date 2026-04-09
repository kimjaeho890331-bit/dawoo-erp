'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Bot } from 'lucide-react'

// --- 타입 ---
interface Schedule {
  id: string
  site_id: string | null
  project_id: string | null
  staff_id: string | null
  schedule_type: string
  title: string
  start_date: string
  end_date: string
  contractor: string | null
  workers: string | null
  memo: string | null
  confirmed: boolean
  color: string
  all_day: boolean
}

interface Staff {
  id: string
  name: string
  role: string
}

interface PromoRecordRow {
  id: string
  city_id: string
  dong: string
  visit_date: string
  staff_id: string | null
  category: string // '소규모' | '수도'
  memo: string | null
  cities: { name: string } | null
}

interface CityPromoSummary {
  city: string
  cityId: string
  totalVisits: number
  uniqueDongs: number
  dongs: { dong: string; visitCount: number; lastVisit: string }[]
  daysSinceLastVisit: number
}

// 직원별 색상
const STAFF_COLORS = ['#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EF4444', '#F97316']

// 일정 색상
const TYPE_COLORS: Record<string, string> = {
  project: '#3B82F6', personal: '#8B5CF6', promo: '#F59E0B', ai: '#06B6D4',
}
const TYPE_LABELS: Record<string, string> = {
  project: '지원사업', personal: '개인', promo: '홍보', ai: 'AI제안',
}

// 유틸
function ds(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function addDays(s: string, n: number) {
  const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10)
}
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1
}

// 15개 시 + 동 목록 (홍보현황용 샘플)
const CITIES_SMALL = ['수원', '성남', '안양', '부천', '광명', '시흥', '안산', '군포', '의왕', '과천', '용인', '화성', '오산', '평택', '하남']
const CITIES_WATER = ['수원', '성남', '안양', '부천', '안산', '시흥', '군포']

// ============================================================
//  메인
// ============================================================
export default function WorkCalendarPage() {
  const [activeTab, setActiveTab] = useState<'calendar' | 'promo'>('calendar')
  const [month, setMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() } })
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStaff, setActiveStaff] = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState(false)
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate()
  const firstDow = new Date(month.year, month.month, 1).getDay()
  const monthLabel = `${month.year}년 ${month.month + 1}월`

  // 데이터 로드
  const loadData = useCallback(async () => {
    setLoading(true)
    const [sr, stf] = await Promise.all([
      supabase.from('schedules').select('*')
        .neq('schedule_type', 'site')
        .gte('end_date', ds(month.year, month.month, 1))
        .lte('start_date', ds(month.year, month.month, daysInMonth))
        .order('start_date'),
      supabase.from('staff').select('*').order('name'),
    ])
    if (!sr.error) setSchedules((sr.data as Schedule[]) || [])
    if (!stf.error) setStaffList((stf.data as Staff[]) || [])
    setLoading(false)
  }, [month, daysInMonth])
  useEffect(() => { loadData() }, [loadData])

  const prevMonth = () => setMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })
  const nextMonth = () => setMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })
  const goToday = () => { const n = new Date(); setMonth({ year: n.getFullYear(), month: n.getMonth() }) }

  const toggleStaff = (id: string) => setActiveStaff(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const staffColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    staffList.forEach((s, i) => { m[s.id] = STAFF_COLORS[i % STAFF_COLORS.length] })
    return m
  }, [staffList])

  const filtered = useMemo(() =>
    schedules.filter(s => activeStaff.size === 0 || (s.staff_id && activeStaff.has(s.staff_id)))
  , [schedules, activeStaff])

  // 주 단위 그룹
  const weeks = useMemo(() => {
    const r: (number | null)[][] = []; let w: (number | null)[] = []
    for (let i = 0; i < firstDow; i++) w.push(null)
    for (let d = 1; d <= daysInMonth; d++) { w.push(d); if (w.length === 7) { r.push(w); w = [] } }
    if (w.length) { while (w.length < 7) w.push(null); r.push(w) }
    return r
  }, [daysInMonth, firstDow])

  const getWeekBars = useCallback((week: (number | null)[]) => {
    const wd = week.map(d => d ? ds(month.year, month.month, d) : null)
    const ws = wd.find(d => d) || '', we = [...wd].reverse().find(d => d) || ''
    return filtered.filter(s => s.start_date <= we && s.end_date >= ws).map(s => {
      const bs = s.start_date < ws ? ws : s.start_date, be = s.end_date > we ? we : s.end_date
      const si = wd.indexOf(bs), ei = wd.indexOf(be)
      if (si < 0 || ei < 0) return null
      const sn = staffList.find(st => st.id === s.staff_id)?.name
      return { schedule: s, left: (si / 7) * 100, width: ((ei - si + 1) / 7) * 100, si, ei, staffName: sn }
    }).filter(Boolean) as any[]
  }, [filtered, month, staffList])

  const getBarColor = (s: Schedule) => s.staff_id && staffColorMap[s.staff_id] ? staffColorMap[s.staff_id] : TYPE_COLORS[s.schedule_type] || '#3B82F6'

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('schedules').delete().eq('id', id)
    setEditSchedule(null); setShowModal(false); loadData()
  }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* 타이틀 + 탭 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">업무 캘린더</h1>
          <div className="flex bg-surface-secondary rounded-lg p-0.5">
            <button onClick={() => setActiveTab('calendar')}
              className={`px-4 py-1.5 text-sm rounded-md transition ${activeTab === 'calendar' ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-secondary'}`}>캘린더</button>
            <button onClick={() => setActiveTab('promo')}
              className={`px-4 py-1.5 text-sm rounded-md transition ${activeTab === 'promo' ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-secondary'}`}>홍보현황</button>
          </div>
        </div>
        {activeTab === 'calendar' && (
          <button onClick={() => { setEditSchedule(null); setSelectedDate(today); setShowModal(true) }}
            className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover shadow-sm">+ 일정 추가</button>
        )}
      </div>

      {activeTab === 'calendar' ? (
        <>
          {/* 직원 필터 */}
          <div className="bg-surface rounded-[10px] border border-border-primary px-4 py-3 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-txt-secondary w-10 shrink-0">직원</span>
              {staffList.map((s, i) => {
                const c = STAFF_COLORS[i % STAFF_COLORS.length]
                const on = activeStaff.size === 0 || activeStaff.has(s.id)
                return (
                  <button key={s.id} onClick={() => toggleStaff(s.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition ${on ? 'border-transparent shadow-sm' : 'border-border-primary opacity-40'}`}
                    style={on ? { backgroundColor: c + '18', color: c } : {}}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />{s.name}
                  </button>
                )
              })}
              <span className="mx-2 w-px h-4 bg-border-primary" />
              <span className="text-[10px] text-txt-tertiary">연차=<span className="text-red-400">빨강</span> 홍보=<span className="text-yellow-500">노랑</span></span>
            </div>
            <div className="flex items-center gap-1 bg-surface-secondary rounded-lg p-0.5">
              {(['month', 'week', 'day'] as const).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`px-3 py-1 text-xs rounded-md transition ${viewMode === v ? 'bg-surface shadow-sm font-medium text-txt-primary' : 'text-txt-secondary'}`}>
                  {v === 'month' ? '월' : v === 'week' ? '주' : '일'}
                </button>
              ))}
            </div>
          </div>

          {/* 캘린더 */}
          <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-tertiary">
              <div className="flex items-center gap-2">
                <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-secondary text-txt-secondary text-lg">&lsaquo;</button>
                <h2 className="text-lg font-semibold text-txt-primary min-w-[150px] text-center">{monthLabel}</h2>
                <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-secondary text-txt-secondary text-lg">&rsaquo;</button>
              </div>
              <button onClick={goToday} className="px-3 py-1.5 text-xs border border-border-primary rounded-lg hover:bg-surface-tertiary text-txt-secondary font-medium">오늘</button>
            </div>

            {loading ? <div className="text-center py-20 text-txt-tertiary">불러오는 중...</div> : (
              <div>
                <div className="grid grid-cols-7 text-center text-xs font-semibold border-b border-border-tertiary">
                  {dayNames.map((d, i) => (
                    <div key={d} className={`py-2 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-txt-tertiary'}`}>{d}</div>
                  ))}
                </div>

                {weeks.map((week, wi) => {
                  const bars = getWeekBars(week)
                  const rows: typeof bars[] = []
                  for (const bar of bars) {
                    let placed = false
                    for (const row of rows) {
                      if (!row.some((b: any) => !(bar.ei < b.si || bar.si > b.ei))) { row.push(bar); placed = true; break }
                    }
                    if (!placed) rows.push([bar])
                  }
                  const bh = 36, bg = 2, ah = rows.length * (bh + bg)

                  return (
                    <div key={wi} className="border-b border-surface-secondary last:border-b-0">
                      <div className="grid grid-cols-7">
                        {week.map((day, di) => {
                          const d = day ? ds(month.year, month.month, day) : ''
                          return (
                            <div key={di} className={`px-2 py-2 text-xs border-r border-surface-secondary last:border-r-0 cursor-pointer hover:bg-blue-50/30 ${!day ? 'bg-surface-secondary/30' : ''}`}
                              onClick={() => { if (day) { setSelectedDate(d); setEditSchedule(null); setShowModal(true) } }}>
                              {day && <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-medium
                                ${d === today ? 'bg-accent text-white' : di === 0 ? 'text-red-400' : di === 6 ? 'text-blue-400' : 'text-txt-secondary'}`}>{day}</span>}
                            </div>
                          )
                        })}
                      </div>
                      <div className="relative grid grid-cols-7" style={{ minHeight: Math.max(ah + 4, 116) }}>
                        {week.map((_, di) => <div key={di} className="border-r border-surface-secondary last:border-r-0" />)}
                        {rows.map((row: any[], ri) => row.map((bar: any) => {
                          const s = bar.schedule as Schedule
                          const color = getBarColor(s)
                          const isLeave = s.schedule_type === 'personal' && s.title.includes('연차')
                          const barColor = isLeave ? '#EF4444' : s.schedule_type === 'promo' ? '#F59E0B' : color
                          return (
                            <div key={s.id + '-' + wi}
                              onClick={(e) => { e.stopPropagation(); setEditSchedule(s); setShowModal(true) }}
                              className="absolute flex flex-col justify-center rounded-md cursor-pointer hover:brightness-95 overflow-hidden shadow-sm px-1.5 py-0.5"
                              style={{
                                left: `${bar.left}%`, width: `${bar.width}%`, top: ri * (bh + bg) + 1, height: bh,
                                backgroundColor: s.confirmed ? barColor : 'white',
                                border: s.confirmed ? 'none' : `1.5px dashed ${barColor}`,
                                color: s.confirmed ? 'white' : barColor,
                              }}
                              title={`${bar.staffName || ''} ${s.title}\n${s.memo || ''}`}>
                              <div className="flex items-center gap-1 truncate">
                                {bar.staffName && (
                                  <span className="shrink-0 w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold"
                                    style={{ backgroundColor: s.confirmed ? 'rgba(255,255,255,0.3)' : barColor, color: s.confirmed ? 'white' : 'white' }}>
                                    {bar.staffName.length >= 2 ? bar.staffName.charAt(1) : bar.staffName.charAt(0)}
                                  </span>
                                )}
                                <span className="text-[10px] font-medium truncate">{s.title}</span>
                              </div>
                              {s.memo && (
                                <div className="text-[9px] truncate opacity-80 mt-px">{s.memo.split('\n')[0]}</div>
                              )}
                            </div>
                          )
                        }))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* AI 업무 교정 — 2차 개발 예정 */}
        </>
      ) : (
        /* 홍보현황 탭 */
        <PromoStatusTab staffList={staffList} />
      )}

      {/* 모달 */}
      {showModal && (
        <ScheduleModal schedule={editSchedule} staffList={staffList} defaultDate={selectedDate || today} staffColorMap={staffColorMap}
          onClose={() => { setShowModal(false); setEditSchedule(null); setSelectedDate(null) }}
          onSave={() => { setShowModal(false); setEditSchedule(null); setSelectedDate(null); loadData() }}
          onDelete={editSchedule ? () => handleDelete(editSchedule.id) : undefined} />
      )}
    </div>
  )
}

// ============================================================
//  홍보현황 탭
// ============================================================
function PromoStatusTab({ staffList }: { staffList: Staff[] }) {
  const [promoType, setPromoType] = useState<'small' | 'water'>('small')
  const [promoRecords, setPromoRecords] = useState<PromoRecordRow[]>([])
  const [promoLoading, setPromoLoading] = useState(true)
  const cities = promoType === 'small' ? CITIES_SMALL : CITIES_WATER

  // promo_records 로드
  useEffect(() => {
    const load = async () => {
      setPromoLoading(true)
      const category = promoType === 'small' ? '소규모' : '수도'
      const { data, error } = await supabase
        .from('promo_records')
        .select('id, city_id, dong, visit_date, staff_id, category, memo, cities(name)')
        .eq('category', category)
        .order('visit_date', { ascending: false })
      if (!error && data) setPromoRecords(data as unknown as PromoRecordRow[])
      else setPromoRecords([])
      setPromoLoading(false)
    }
    load()
  }, [promoType])

  // 시별 집계
  const cityData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)

    return cities.map(cityName => {
      const cityRecords = promoRecords.filter(r => r.cities?.name === cityName)

      // 동별 그룹핑
      const dongMap = new Map<string, { visitCount: number; lastVisit: string }>()
      for (const r of cityRecords) {
        const existing = dongMap.get(r.dong)
        if (!existing) {
          dongMap.set(r.dong, { visitCount: 1, lastVisit: r.visit_date })
        } else {
          existing.visitCount++
          if (r.visit_date > existing.lastVisit) existing.lastVisit = r.visit_date
        }
      }

      const uniqueDongs = dongMap.size
      const totalVisits = cityRecords.length

      // 시 전체 마지막 방문일 기준 미방문 기간
      let daysSinceLastVisit = -1
      if (cityRecords.length > 0) {
        const lastVisitDate = cityRecords[0].visit_date // already sorted desc
        daysSinceLastVisit = Math.round((new Date(today).getTime() - new Date(lastVisitDate).getTime()) / 86400000)
      }

      return { city: cityName, uniqueDongs, totalVisits, daysSinceLastVisit }
    })
  }, [cities, promoRecords])

  const totalDongs = cityData.reduce((a, c) => a + c.uniqueDongs, 0)
  const totalVisits = cityData.reduce((a, c) => a + c.totalVisits, 0)
  const hasData = promoRecords.length > 0

  return (
    <div className="space-y-4">
      {/* 소규모/수도 전환 */}
      <div className="bg-surface rounded-[10px] border border-border-primary px-4 py-3 flex items-center justify-between">
        <div className="flex bg-surface-secondary rounded-lg p-0.5">
          <button onClick={() => setPromoType('small')}
            className={`px-4 py-1.5 text-sm rounded-md transition ${promoType === 'small' ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-secondary'}`}>소규모 (15개시)</button>
          <button onClick={() => setPromoType('water')}
            className={`px-4 py-1.5 text-sm rounded-md transition ${promoType === 'water' ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-secondary'}`}>수도 (7개시)</button>
        </div>
        <div className="text-xs text-txt-secondary">
          방문 동 <span className="font-semibold text-green-600 tabular-nums">{totalDongs}</span>개 ·
          총 방문 <span className="font-semibold text-txt-primary tabular-nums">{totalVisits}</span>회
        </div>
      </div>

      {promoLoading ? (
        <div className="bg-surface rounded-[10px] border border-border-primary text-center py-20 text-txt-tertiary">불러오는 중...</div>
      ) : !hasData ? (
        <div className="bg-surface rounded-[10px] border border-border-primary text-center py-20">
          <p className="text-txt-tertiary text-sm">홍보 기록이 없습니다</p>
          <p className="text-txt-tertiary text-xs mt-1">홍보 방문 후 기록을 등록하면 여기에 표시됩니다</p>
        </div>
      ) : (
        <>
          {/* 시별 현황 */}
          <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-secondary border-b border-border-primary">
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary w-20">시</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">방문 현황</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary w-20">방문 동</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary w-20">방문 횟수</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary w-28">미방문 기간</th>
                </tr>
              </thead>
              <tbody>
                {cityData.map(c => {
                  // 방문 동 수 기준 프로그레스 (최대 기준: 해당 카테고리 전체 동 중 최다 방문 시 기준)
                  const maxDongs = Math.max(...cityData.map(d => d.uniqueDongs), 1)
                  const pct = Math.round((c.uniqueDongs / maxDongs) * 100)
                  const danger = c.daysSinceLastVisit > 90
                  const noVisit = c.daysSinceLastVisit < 0
                  return (
                    <tr key={c.city} className="border-b border-surface-secondary hover:bg-surface-tertiary/50">
                      <td className="px-4 py-3 font-medium text-txt-primary">{c.city}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-surface-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-txt-secondary w-10 text-right tabular-nums">{c.uniqueDongs}동</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-green-600 font-medium tabular-nums">{c.uniqueDongs}</td>
                      <td className="px-4 py-3 text-center text-txt-primary font-medium tabular-nums">{c.totalVisits}</td>
                      <td className={`px-4 py-3 text-center font-medium tabular-nums ${noVisit ? 'text-txt-tertiary' : danger ? 'text-red-600' : 'text-txt-secondary'}`}>
                        {noVisit ? (
                          <span>-</span>
                        ) : (
                          <>
                            {danger && <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full mr-1" />}
                            {c.daysSinceLastVisit}일
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* AI 홍보 제안 */}
          {cityData.filter(c => c.daysSinceLastVisit > 60).length > 0 && (
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-[10px] border border-yellow-200/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Bot size={16} className="text-txt-tertiary" />
                <h3 className="text-sm font-semibold text-txt-secondary">AI 홍보 제안</h3>
              </div>
              <div className="space-y-2">
                {cityData.filter(c => c.daysSinceLastVisit > 60).slice(0, 3).map(c => (
                  <div key={c.city} className="flex items-center justify-between bg-white/70 rounded-lg p-3 border border-white">
                    <div>
                      <span className="text-sm font-medium text-txt-secondary">{c.city}</span>
                      <span className="text-xs text-red-500 ml-2 tabular-nums">{c.daysSinceLastVisit}일 미방문</span>
                      <span className="text-xs text-txt-secondary ml-2 tabular-nums">방문 {c.uniqueDongs}개 동</span>
                    </div>
                    <button className="px-3 py-1 text-xs font-medium text-yellow-700 border border-yellow-300 rounded hover:bg-yellow-50">[일정 추가]</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================
//  일정 추가/수정 모달
// ============================================================
function ScheduleModal({ schedule, staffList, defaultDate, staffColorMap, onClose, onSave, onDelete }: {
  schedule: Schedule | null; staffList: Staff[]; defaultDate: string; staffColorMap: Record<string, string>
  onClose: () => void; onSave: () => void; onDelete?: () => void
}) {
  const isEdit = !!schedule
  const [title, setTitle] = useState(schedule?.title || '')
  const [startDate, setStartDate] = useState(schedule?.start_date || defaultDate)
  const [endDate, setEndDate] = useState(schedule?.end_date || defaultDate)
  const [staffId, setStaffId] = useState(schedule?.staff_id || '')
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>(schedule?.staff_id ? [schedule.staff_id] : [])
  const [scheduleType, setScheduleType] = useState(schedule?.schedule_type || 'personal')
  const [memo, setMemo] = useState(schedule?.memo || '')
  const [confirmed, setConfirmed] = useState(schedule?.confirmed ?? false)
  const [saving, setSaving] = useState(false)

  const toggleStaff = (id: string) => {
    setSelectedStaffIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  const handleSubmit = async () => {
    if (!title || !startDate || !endDate) return
    setSaving(true)
    if (isEdit) {
      const color = staffId && staffColorMap[staffId] ? staffColorMap[staffId] : TYPE_COLORS[scheduleType] || '#3B82F6'
      const payload = { title, start_date: startDate, end_date: endDate, staff_id: staffId || null, schedule_type: scheduleType, memo: memo || null, confirmed, color, all_day: true, site_id: null, project_id: null }
      await supabase.from('schedules').update(payload).eq('id', schedule!.id)
    } else {
      // 복수 담당자: 각각 일정 생성
      const ids = selectedStaffIds.length > 0 ? selectedStaffIds : [null]
      const inserts = ids.map(sid => ({
        title, start_date: startDate, end_date: endDate,
        staff_id: sid, schedule_type: scheduleType, memo: memo || null,
        confirmed, color: sid && staffColorMap[sid] ? staffColorMap[sid] : TYPE_COLORS[scheduleType] || '#3B82F6',
        all_day: true, site_id: null, project_id: null,
      }))
      await supabase.from('schedules').insert(inserts)
    }
    setSaving(false); onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-[10px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-[460px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center justify-between">
          <h3 className="font-semibold text-txt-primary text-sm">{isEdit ? '일정 수정' : '일정 추가'}</h3>
          <button onClick={onClose} className="text-txt-tertiary hover:text-txt-secondary text-lg">&times;</button>
        </div>
        <div className="p-5 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1">제목 *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 권선동 실측"
              className="w-full h-[36px] bg-surface border border-border-primary rounded-lg px-3 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-txt-secondary mb-1">시작일 *</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full h-[36px] bg-surface border border-border-primary rounded-lg px-3 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none" /></div>
            <div><label className="block text-xs font-medium text-txt-secondary mb-1">종료일 *</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full h-[36px] bg-surface border border-border-primary rounded-lg px-3 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none" /></div>
          </div>
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1">담당자 {!isEdit && '(복수 선택 가능)'}</label>
            {isEdit ? (
              <select value={staffId} onChange={e => setStaffId(e.target.value)} className="w-full h-[36px] bg-surface border border-border-primary rounded-lg px-3 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none">
                <option value="">선택</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <div className="flex flex-wrap gap-2 mt-1">
                {staffList.map(s => (
                  <label key={s.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] cursor-pointer transition-colors ${
                    selectedStaffIds.includes(s.id) ? 'border-accent bg-accent/10 text-accent font-medium' : 'border-border-primary text-txt-secondary hover:border-accent'
                  }`}>
                    <input type="checkbox" checked={selectedStaffIds.includes(s.id)} onChange={() => toggleStaff(s.id)} className="sr-only" />
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: staffColorMap[s.id] || '#999' }} />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div><label className="block text-xs font-medium text-txt-secondary mb-1">메모</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} className="w-full bg-surface border border-border-primary rounded-lg px-3 py-2 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none resize-none" /></div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="w-4 h-4 rounded border-border-secondary text-accent" />
            <span className="text-sm text-txt-secondary">완료</span>
          </label>
        </div>
        <div className="px-5 py-3.5 border-t border-border-tertiary flex items-center justify-between bg-surface-secondary/50 rounded-b-[10px]">
          <div>{onDelete && <button onClick={onDelete} className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded">삭제</button>}</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-border-primary rounded-lg hover:bg-surface-tertiary">취소</button>
            <button onClick={handleSubmit} disabled={saving || !title || !startDate || !endDate}
              className="px-5 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 font-medium shadow-sm">{saving ? '저장 중...' : isEdit ? '수정' : '추가'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
