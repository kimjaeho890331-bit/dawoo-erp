'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

// --- 타입 ---
interface Schedule {
  id: string
  site_id: string | null
  project_id: string | null
  staff_id: string | null
  staff_ids: string[] | null  // 다중 담당자 (신규, 기존 staff_id와 병행)
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
  start_time: string | null
  end_time: string | null
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
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStaff, setActiveStaff] = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState(false)
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showDailyLog, setShowDailyLog] = useState(false)

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
    schedules.filter(s => {
      if (activeStaff.size === 0) return true
      // 다중 담당자 필터: staff_id 또는 staff_ids 중 하나라도 매칭되면 노출
      if (s.staff_id && activeStaff.has(s.staff_id)) return true
      if (s.staff_ids && s.staff_ids.some(id => activeStaff.has(id))) return true
      return false
    })
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
    return filtered.filter(s => s.start_date <= we && s.end_date >= ws).sort((a, b) => {
      if (!a.start_time && !b.start_time) return 0
      if (!a.start_time) return -1
      if (!b.start_time) return 1
      return a.start_time.localeCompare(b.start_time)
    }).map(s => {
      const bs = s.start_date < ws ? ws : s.start_date, be = s.end_date > we ? we : s.end_date
      const si = wd.indexOf(bs), ei = wd.indexOf(be)
      if (si < 0 || ei < 0) return null
      // 다중 담당자: staff_ids 우선, 없으면 staff_id fallback
      const ids = (s.staff_ids && s.staff_ids.length > 0) ? s.staff_ids : (s.staff_id ? [s.staff_id] : [])
      const names = ids.map(id => staffList.find(st => st.id === id)?.name).filter(Boolean) as string[]
      const sn = names.length === 0 ? undefined : names.length === 1 ? names[0] : `${names[0]} 외${names.length - 1}`
      return { schedule: s, left: (si / 7) * 100, width: ((ei - si + 1) / 7) * 100, si, ei, staffName: sn }
    }).filter(Boolean) as any[]
  }, [filtered, month, staffList])

  const getBarColor = (s: Schedule) => s.staff_id && staffColorMap[s.staff_id] ? staffColorMap[s.staff_id] : TYPE_COLORS[s.schedule_type] || '#3B82F6'

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    // 접수대장 연동: 삭제 전에 project_id 확인
    const target = schedules.find(s => s.id === id)
    if (target?.project_id) {
      const t = target.title || ''
      const df = t.includes('실측') ? 'survey_date' : t.includes('동의서') ? 'consent_date' : t.includes('신청서') ? 'application_date' : t.includes('착공서류') ? 'construction_doc_date' : t.includes('시공') ? 'construction_date' : t.includes('완료서류') ? 'completion_doc_date' : null
      if (df) await supabase.from('projects').update({ [df]: null }).eq('id', target.project_id)
    }
    await supabase.from('schedules').delete().eq('id', id)
    setEditSchedule(null); setShowModal(false); loadData()
  }

  // 드래그앤드롭: 일정 이동
  const [dragSchedule, setDragSchedule] = useState<Schedule | null>(null)

  const handleDragStart = (e: React.DragEvent, s: Schedule) => {
    setDragSchedule(s)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', s.id)
  }

  const handleDrop = async (e: React.DragEvent, targetDate: string) => {
    e.preventDefault()
    if (!dragSchedule) return
    const duration = Math.max(0, Math.round((new Date(dragSchedule.end_date).getTime() - new Date(dragSchedule.start_date).getTime()) / 86400000))
    const newEnd = new Date(targetDate)
    newEnd.setDate(newEnd.getDate() + duration)
    const endStr = newEnd.toISOString().substring(0, 10)
    await supabase.from('schedules').update({ start_date: targetDate, end_date: endStr }).eq('id', dragSchedule.id)

    // 접수대장 연동: project_id가 있으면 해당 날짜 필드도 업데이트
    if (dragSchedule.project_id) {
      const title = dragSchedule.title || ''
      const dateField =
        title.includes('실측') ? 'survey_date' :
        title.includes('동의서') ? 'consent_date' :
        title.includes('신청서') ? 'application_date' :
        title.includes('착공서류') ? 'construction_doc_date' :
        title.includes('시공') ? 'construction_date' :
        title.includes('완료서류') ? 'completion_doc_date' : null
      if (dateField) {
        await supabase.from('projects').update({ [dateField]: targetDate }).eq('id', dragSchedule.project_id)
      }
    }

    setDragSchedule(null)
    loadData()
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }

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
                            <div key={di} className={`px-2 py-2 text-xs border-r border-surface-secondary last:border-r-0 hover:bg-blue-50/30 ${!day ? 'bg-surface-secondary/30' : ''} ${day ? 'cursor-pointer' : ''}`}
                              onDoubleClick={() => { if (day) { setSelectedDate(d); setEditSchedule(null); setShowModal(true) } }}
                              title={day ? '더블클릭 → 일정 추가' : ''}
                              onDragOver={day ? handleDragOver : undefined}
                              onDrop={day ? (e) => handleDrop(e, d) : undefined}>
                              {day && <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-medium
                                ${d === today ? 'bg-accent text-white' : di === 0 ? 'text-red-400' : di === 6 ? 'text-blue-400' : 'text-txt-secondary'}`}>{day}</span>}
                            </div>
                          )
                        })}
                      </div>
                      <div className="relative grid grid-cols-7" style={{ minHeight: Math.max(ah + 4, 116) }}>
                        {week.map((day, di) => {
                          const d = day ? ds(month.year, month.month, day) : ''
                          return <div key={di} className={`border-r border-surface-secondary last:border-r-0 ${day ? 'cursor-pointer' : ''}`}
                            onDoubleClick={() => { if (day) { setSelectedDate(d); setEditSchedule(null); setShowModal(true) } }}
                            onDragOver={day ? handleDragOver : undefined}
                            onDrop={day ? (e) => handleDrop(e, d) : undefined} />
                        })}
                        {rows.map((row: any[], ri) => row.map((bar: any) => {
                          const s = bar.schedule as Schedule
                          const color = getBarColor(s)
                          const isLeave = s.schedule_type === 'personal' && s.title.includes('연차')
                          const barColor = isLeave ? '#EF4444' : s.schedule_type === 'promo' ? '#F59E0B' : color
                          return (
                            <div key={s.id + '-' + wi}
                              draggable
                              onDragStart={(e) => handleDragStart(e, s)}
                              onClick={(e) => { e.stopPropagation(); setEditSchedule(s); setShowModal(true) }}
                              className="absolute flex flex-col justify-center rounded-md cursor-grab active:cursor-grabbing hover:brightness-95 overflow-hidden shadow-sm px-1.5 py-0.5"
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

          {/* 오늘 일정 */}
          <TodaySection
            schedules={schedules}
            staffList={staffList}
            staffColorMap={staffColorMap}
            currentStaffId={typeof window !== 'undefined' ? localStorage.getItem('dawoo_current_staff_id') : null}
            onScheduleClick={(s) => { setEditSchedule(s); setShowModal(true) }}
            onToggleConfirmed={async (id, confirmed) => {
              await supabase.from('schedules').update({ confirmed }).eq('id', id)
              loadData()
            }}
            onOpenDailyLog={() => setShowDailyLog(true)}
          />
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

      {showDailyLog && (
        <DailyLogModal
          staffId={typeof window !== 'undefined' ? localStorage.getItem('dawoo_current_staff_id') : null}
          schedules={schedules}
          staffList={staffList}
          onClose={() => setShowDailyLog(false)}
        />
      )}
    </div>
  )
}

// ============================================================
//  홍보현황 탭
// ============================================================
interface SchoolInfo { name: string; type: string; address: string; city: string; dong: string }

function PromoStatusTab({ staffList }: { staffList: Staff[] }) {
  const [promoType, setPromoType] = useState<'small' | 'water' | 'school'>('small')
  const [promoRecords, setPromoRecords] = useState<PromoRecordRow[]>([])
  const [promoLoading, setPromoLoading] = useState(true)
  const [expandedCity, setExpandedCity] = useState<string | null>(null)
  const [schools, setSchools] = useState<SchoolInfo[]>([])
  const [schoolsLoaded, setSchoolsLoaded] = useState(false)

  const cities = promoType === 'small' ? CITIES_SMALL : promoType === 'water' ? CITIES_WATER : ['수원', '화성', '안양']

  // promo_records 로드
  useEffect(() => {
    const load = async () => {
      setPromoLoading(true)
      const category = promoType === 'small' ? '소규모' : promoType === 'water' ? '수도' : '학교'
      const { data } = await supabase
        .from('promo_records')
        .select('id, city_id, dong, visit_date, staff_id, category, memo, cities(name)')
        .eq('category', category)
        .order('visit_date', { ascending: false })
      setPromoRecords((data as unknown as PromoRecordRow[]) || [])
      setPromoLoading(false)
    }
    load()
  }, [promoType])

  // 학교 데이터 로드 (한번만)
  useEffect(() => {
    if (promoType === 'school' && !schoolsLoaded) {
      fetch('/api/schools').then(r => r.json()).then(d => {
        if (Array.isArray(d)) setSchools(d)
        setSchoolsLoaded(true)
      }).catch(() => setSchoolsLoaded(true))
    }
  }, [promoType, schoolsLoaded])

  // 시별 집계 + 동별 상세
  const cityData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return cities.map(cityName => {
      const cityRecords = promoRecords.filter(r => r.cities?.name === cityName)
      const dongMap = new Map<string, { visitCount: number; lastVisit: string; staffNames: string[] }>()
      for (const r of cityRecords) {
        const existing = dongMap.get(r.dong)
        const staffName = staffList.find(s => s.id === r.staff_id)?.name || ''
        if (!existing) {
          dongMap.set(r.dong, { visitCount: 1, lastVisit: r.visit_date, staffNames: staffName ? [staffName] : [] })
        } else {
          existing.visitCount++
          if (r.visit_date > existing.lastVisit) existing.lastVisit = r.visit_date
          if (staffName && !existing.staffNames.includes(staffName)) existing.staffNames.push(staffName)
        }
      }
      let daysSinceLastVisit = -1
      if (cityRecords.length > 0) {
        daysSinceLastVisit = Math.round((new Date(today).getTime() - new Date(cityRecords[0].visit_date).getTime()) / 86400000)
      }
      return {
        city: cityName,
        uniqueDongs: dongMap.size,
        totalVisits: cityRecords.length,
        daysSinceLastVisit,
        dongs: Array.from(dongMap.entries()).map(([dong, info]) => ({ dong, ...info })).sort((a, b) => b.visitCount - a.visitCount),
      }
    })
  }, [cities, promoRecords, staffList])

  // 학교 시별 그룹
  const schoolsByCity = useMemo(() => {
    if (promoType !== 'school') return {}
    const grouped: Record<string, Record<string, SchoolInfo[]>> = {}
    for (const s of schools) {
      if (!grouped[s.city]) grouped[s.city] = {}
      if (!grouped[s.city][s.dong]) grouped[s.city][s.dong] = []
      grouped[s.city][s.dong].push(s)
    }
    return grouped
  }, [schools, promoType])

  const totalDongs = cityData.reduce((a, c) => a + c.uniqueDongs, 0)
  const totalVisits = cityData.reduce((a, c) => a + c.totalVisits, 0)

  const typeIcon = (t: string) => t === '초등학교' ? '🏫' : t === '중학교' ? '🏛' : '🎓'

  return (
    <div className="space-y-4">
      {/* 3탭 전환 */}
      <div className="bg-surface rounded-[10px] border border-border-primary px-4 py-3 flex items-center justify-between">
        <div className="flex bg-surface-secondary rounded-lg p-0.5">
          {[
            { key: 'small' as const, label: `소규모 (${CITIES_SMALL.length}시)` },
            { key: 'water' as const, label: `수도 (${CITIES_WATER.length}시)` },
            { key: 'school' as const, label: '학교 (3시)' },
          ].map(tab => (
            <button key={tab.key} onClick={() => { setPromoType(tab.key); setExpandedCity(null) }}
              className={`px-4 py-1.5 text-sm rounded-md transition ${promoType === tab.key ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-secondary'}`}>{tab.label}</button>
          ))}
        </div>
        <div className="text-xs text-txt-secondary">
          방문 동 <span className="font-semibold text-green-600 tabular-nums">{totalDongs}</span>개 ·
          총 방문 <span className="font-semibold text-txt-primary tabular-nums">{totalVisits}</span>회
        </div>
      </div>

      {promoLoading ? (
        <div className="bg-surface rounded-[10px] border border-border-primary text-center py-16 text-txt-tertiary text-sm">불러오는 중...</div>
      ) : (
        <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
          {/* 시별 아코디언 */}
          {cityData.map(c => {
            const isExpanded = expandedCity === c.city
            const danger = c.daysSinceLastVisit > 90
            const noVisit = c.daysSinceLastVisit < 0
            const citySchools = promoType === 'school' ? schoolsByCity[c.city] || {} : {}
            const schoolDongs = Object.keys(citySchools).sort()

            return (
              <div key={c.city} className="border-b border-border-tertiary last:border-b-0">
                {/* 시 행 */}
                <button onClick={() => setExpandedCity(isExpanded ? null : c.city)}
                  className="w-full flex items-center px-4 py-3 hover:bg-surface-tertiary/50 transition-colors text-left">
                  <span className={`text-[11px] mr-2 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                  <span className="font-medium text-txt-primary text-sm flex-1">{c.city}</span>
                  <span className="text-xs text-green-600 font-medium tabular-nums mr-4">{c.uniqueDongs}동 · {c.totalVisits}회</span>
                  {promoType === 'school' && <span className="text-xs text-txt-tertiary mr-4">{schools.filter(s => s.city === c.city).length}교</span>}
                  <span className={`text-xs font-medium tabular-nums ${noVisit ? 'text-txt-quaternary' : danger ? 'text-red-600' : 'text-txt-secondary'}`}>
                    {noVisit ? '미방문' : `${c.daysSinceLastVisit}일 전`}
                  </span>
                </button>

                {/* 동 리스트 (펼침) */}
                {isExpanded && (
                  <div className="bg-surface-secondary/50 px-4 pb-3">
                    {promoType !== 'school' ? (
                      // 소규모/수도: 홍보 기록 동별
                      c.dongs.length > 0 ? (
                        <div className="space-y-1">
                          {c.dongs.map(d => (
                            <div key={d.dong} className="flex items-center justify-between px-3 py-2 bg-surface rounded-lg text-[12px]">
                              <span className="font-medium text-txt-primary">{d.dong}</span>
                              <div className="flex items-center gap-3 text-txt-secondary">
                                <span className="tabular-nums">{d.visitCount}회</span>
                                <span>{new Date(d.lastVisit).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</span>
                                {d.staffNames.length > 0 && <span className="text-txt-tertiary">{d.staffNames.join(', ')}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-txt-quaternary text-center py-4">방문 기록이 없습니다</p>
                      )
                    ) : (
                      // 학교: 동별 학교 리스트
                      schoolDongs.length > 0 ? (
                        <div className="space-y-2">
                          {schoolDongs.map(dong => (
                            <div key={dong}>
                              <p className="text-[11px] font-semibold text-txt-tertiary mb-1 px-1">{dong}</p>
                              <div className="space-y-0.5">
                                {citySchools[dong].sort((a, b) => {
                                  const order = ['초등학교', '중학교', '고등학교']
                                  return order.indexOf(a.type) - order.indexOf(b.type)
                                }).map(s => (
                                  <div key={s.name} className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded text-[12px]">
                                    <span>{typeIcon(s.type)}</span>
                                    <span className="font-medium text-txt-primary flex-1">{s.name}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                      s.type === '초등학교' ? 'bg-green-100 text-green-700' :
                                      s.type === '중학교' ? 'bg-blue-100 text-blue-700' :
                                      'bg-purple-100 text-purple-700'
                                    }`}>{s.type.replace('학교', '')}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : !schoolsLoaded ? (
                        <p className="text-[12px] text-txt-quaternary text-center py-4">학교 데이터 로딩 중...</p>
                      ) : (
                        <p className="text-[12px] text-txt-quaternary text-center py-4">학교 데이터가 없습니다</p>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
//  오늘 일정 영역
// ============================================================
function TodaySection({
  schedules,
  staffList,
  staffColorMap,
  currentStaffId,
  onScheduleClick,
  onToggleConfirmed,
  onOpenDailyLog,
}: {
  schedules: Schedule[]
  staffList: Staff[]
  staffColorMap: Record<string, string>
  currentStaffId: string | null
  onScheduleClick: (s: Schedule) => void
  onToggleConfirmed: (id: string, confirmed: boolean) => void
  onOpenDailyLog?: () => void
}) {
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']
  const todayDay = dayNames[new Date().getDay()]

  // 오늘 일정 필터 (오늘에 걸쳐있는 모든 일정)
  const todaySchedules = useMemo(() =>
    schedules.filter(s => s.start_date <= today && s.end_date >= today)
  , [schedules, today])

  // staffList 재정렬: currentStaffId 맨 앞
  const sortedStaff = useMemo(() => {
    if (!currentStaffId) return staffList
    const me = staffList.find(s => s.id === currentStaffId)
    const rest = staffList.filter(s => s.id !== currentStaffId)
    return me ? [me, ...rest] : staffList
  }, [staffList, currentStaffId])

  // 직원별 일정 그룹핑
  const staffScheduleMap = useMemo(() => {
    const map: Record<string, Schedule[]> = {}
    for (const s of sortedStaff) {
      const mine = todaySchedules.filter(sc =>
        sc.staff_id === s.id || (sc.staff_ids && sc.staff_ids.includes(s.id))
      )
      // 정렬: 시간형 먼저(start_time 오름차순) → 마감형(end_date 가까운 순) → 종일형
      mine.sort((a, b) => {
        const aIsTime = a.start_date === a.end_date && !!a.start_time
        const bIsTime = b.start_date === b.end_date && !!b.start_time
        const aIsRange = a.start_date !== a.end_date
        const bIsRange = b.start_date !== b.end_date
        // 시간형 먼저
        if (aIsTime && !bIsTime) return -1
        if (!aIsTime && bIsTime) return 1
        if (aIsTime && bIsTime) return (a.start_time || '').localeCompare(b.start_time || '')
        // 마감형 다음
        if (aIsRange && !bIsRange) return -1
        if (!aIsRange && bIsRange) return 1
        if (aIsRange && bIsRange) return a.end_date.localeCompare(b.end_date)
        return 0
      })
      map[s.id] = mine
    }
    return map
  }, [sortedStaff, todaySchedules])

  const getScheduleLabel = (s: Schedule) => {
    const isSameDay = s.start_date === s.end_date
    if (isSameDay && s.start_time) {
      return s.end_time ? `${s.start_time}~${s.end_time}` : s.start_time
    }
    if (!isSameDay) {
      return `~${s.end_date.slice(5).replace('-', '/')}`
    }
    return '종일'
  }

  return (
    <div className="mt-4 bg-surface rounded-[10px] border border-border-primary overflow-hidden">
      <div className="px-5 py-3 border-b border-border-tertiary flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-accent" />
        <h3 className="text-[14px] font-semibold text-txt-primary">
          오늘 일정
        </h3>
        <span className="text-[12px] text-txt-tertiary">
          {today.slice(5).replace('-', '/')} ({todayDay})
        </span>
        <span className="text-[12px] text-txt-quaternary ml-auto mr-2">
          총 {todaySchedules.length}건
        </span>
        <button
          onClick={() => onOpenDailyLog?.()}
          className="px-3 py-1.5 text-[12px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition"
        >
          업무일지
        </button>
      </div>

      {/* 직원 카드 그리드 */}
      <div className="p-4">
        {sortedStaff.filter(s => (staffScheduleMap[s.id]?.length || 0) > 0).length === 0 ? (
          <div className="py-6 text-center text-[13px] text-txt-quaternary">
            오늘 예정된 일정이 없습니다
          </div>
        ) : (
        <div className="grid grid-cols-5 gap-3">
          {sortedStaff.filter(s => (staffScheduleMap[s.id]?.length || 0) > 0).map(staff => {
            const color = staffColorMap[staff.id] || '#999'
            const count = staffScheduleMap[staff.id]?.length || 0
            const isExpanded = expandedStaffId === staff.id
            const isMe = staff.id === currentStaffId

            return (
              <button
                key={staff.id}
                onClick={() => setExpandedStaffId(isExpanded ? null : staff.id)}
                className={`relative flex flex-col items-center gap-1 py-3 px-2 rounded-lg border transition-all text-center ${
                  isExpanded
                    ? 'border-transparent shadow-sm ring-1'
                    : count > 0
                      ? 'border-border-primary hover:border-border-secondary hover:shadow-sm'
                      : 'border-border-primary opacity-50'
                }`}
                style={isExpanded ? { borderColor: color, boxShadow: `0 0 0 1px ${color}40`, backgroundColor: color + '08' } : {}}
              >
                {isMe && (
                  <span className="absolute top-1 right-1.5 text-[8px] text-txt-quaternary font-medium">나</span>
                )}
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold"
                  style={{ backgroundColor: color }}
                >
                  {staff.name.length >= 2 ? staff.name.charAt(1) : staff.name.charAt(0)}
                </span>
                <span className="text-[12px] font-medium text-txt-primary">{staff.name}</span>
                <span className={`text-[11px] tabular-nums ${count > 0 ? 'text-txt-secondary font-medium' : 'text-txt-quaternary'}`}>
                  {count > 0 ? `${count}건` : '-'}
                </span>
              </button>
            )
          })}
        </div>
        )}

        {/* 아코디언: 선택된 직원의 일정 리스트 */}
        {expandedStaffId && staffScheduleMap[expandedStaffId] && (
          <div className="mt-3 rounded-lg border border-border-tertiary overflow-hidden">
            {staffScheduleMap[expandedStaffId].length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-txt-quaternary">
                오늘 예정된 일정이 없습니다
              </div>
            ) : (
              staffScheduleMap[expandedStaffId].map((s, i) => {
                const isSameDay = s.start_date === s.end_date
                const isTimeType = isSameDay && !!s.start_time
                const isRangeType = !isSameDay
                const typeLabel = TYPE_LABELS[s.schedule_type] || s.schedule_type

                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-secondary/50 transition ${
                      i > 0 ? 'border-t border-border-tertiary' : ''
                    }`}
                    onClick={() => onScheduleClick(s)}
                  >
                    {/* 시간 라벨 */}
                    <span className={`shrink-0 w-[90px] text-[12px] tabular-nums ${
                      isTimeType ? 'text-txt-primary font-medium' : 'text-txt-tertiary'
                    }`}>
                      {isTimeType ? '●' : isRangeType ? '▬' : '○'}{' '}
                      {getScheduleLabel(s)}
                    </span>

                    {/* 제목 */}
                    <span className="flex-1 text-[13px] text-txt-primary truncate">{s.title}</span>

                    {/* 분류 배지 */}
                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      s.schedule_type === 'project' ? 'bg-blue-50 text-blue-600' :
                      s.schedule_type === 'promo' ? 'bg-yellow-50 text-yellow-700' :
                      s.schedule_type === 'ai' ? 'bg-cyan-50 text-cyan-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {typeLabel}
                    </span>

                    {/* 완료 체크 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleConfirmed(s.id, !s.confirmed) }}
                      className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition ${
                        s.confirmed
                          ? 'bg-accent border-accent text-white'
                          : 'border-border-secondary hover:border-accent'
                      }`}
                    >
                      {s.confirmed && <span className="text-[10px]">&#10003;</span>}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
//  일정 추가/수정 모달 (View + Edit 2모드)
// ============================================================
function ScheduleModal({ schedule, staffList, defaultDate, staffColorMap, onClose, onSave, onDelete }: {
  schedule: Schedule | null; staffList: Staff[]; defaultDate: string; staffColorMap: Record<string, string>
  onClose: () => void; onSave: () => void; onDelete?: () => void
}) {
  const isEdit = !!schedule
  const [isEditing, setIsEditing] = useState(!isEdit)
  const [title, setTitle] = useState(schedule?.title || '')
  const [startDate, setStartDateRaw] = useState(schedule?.start_date || defaultDate)
  const [endDate, setEndDate] = useState(schedule?.end_date || defaultDate)
  const [hasEndDate, setHasEndDate] = useState(isEdit ? schedule?.start_date !== schedule?.end_date : false)
  // 다중 담당자: 편집 시 schedule.staff_ids 또는 staff_id fallback
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>(
    schedule?.staff_ids && schedule.staff_ids.length > 0
      ? schedule.staff_ids
      : schedule?.staff_id ? [schedule.staff_id] : []
  )
  const [staffExpanded, setStaffExpanded] = useState(false)
  const [scheduleType, setScheduleType] = useState(schedule?.schedule_type || 'personal')
  const [userTouchedType, setUserTouchedType] = useState(false)
  const [memo, setMemo] = useState(schedule?.memo || '')
  const [confirmed, setConfirmed] = useState(schedule?.confirmed ?? false)
  const [saving, setSaving] = useState(false)

  // 시간: hour / minute 분리
  const [startHour, setStartHour] = useState(schedule?.start_time?.split(':')[0] || '')
  const [startMinute, setStartMinute] = useState(schedule?.start_time?.split(':')[1] || '')

  // 종료일 체크 해제 시 endDate = startDate 동기화
  useEffect(() => {
    if (!hasEndDate) setEndDate(startDate)
  }, [hasEndDate, startDate])

  // 시작일 변경 시: 오늘 이후 + 종료일이 시작일 이전이면 종료일 자동 동기화
  const setStartDate = (next: string) => {
    setStartDateRaw(next)
    const todayISO = new Date().toISOString().slice(0, 10)
    if (next > todayISO && endDate < next) {
      setEndDate(next)
    }
  }

  const toggleStaff = (id: string) => {
    setSelectedStaffIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  // 제목에 "홍보" 포함 && 사용자가 직접 type을 바꾼 적 없으면 자동 'promo' 설정
  useEffect(() => {
    if (!userTouchedType && title.includes('홍보') && scheduleType !== 'promo') {
      setScheduleType('promo')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title])

  const selectedStaffNames = selectedStaffIds
    .map(id => staffList.find(s => s.id === id)?.name)
    .filter(Boolean)
    .join(', ')

  const handleSubmit = async () => {
    if (!title || !startDate || !endDate) return
    setSaving(true)
    // 시간 재조합
    const startTime = startHour ? `${startHour}:${startMinute || '00'}` : ''
    const isSameDay = startDate === endDate
    // 제목에 "홍보" 포함 시 자동 promo (저장 직전 최종 보정)
    const finalType = (!userTouchedType && title.includes('홍보')) ? 'promo' : scheduleType
    const primaryStaff = selectedStaffIds[0] || null
    const color = primaryStaff && staffColorMap[primaryStaff]
      ? staffColorMap[primaryStaff]
      : TYPE_COLORS[finalType] || '#3B82F6'
    const payload = {
      title, start_date: startDate, end_date: endDate,
      staff_id: primaryStaff,              // 호환성: 첫번째 담당자 미러링
      staff_ids: selectedStaffIds.length > 0 ? selectedStaffIds : null,
      schedule_type: finalType,
      memo: memo || null,
      confirmed, color, all_day: true,
      start_time: isSameDay && startTime ? startTime : null,
      end_time: null as string | null,
      site_id: schedule?.site_id || null,
      project_id: schedule?.project_id || null,
    }
    if (isEdit) {
      // staff_ids 컬럼 미존재 시 graceful fallback
      const { error } = await supabase.from('schedules').update(payload).eq('id', schedule!.id)
      if (error && /staff_ids/.test(error.message)) {
        const { staff_ids: _ignore, ...legacy } = payload
        void _ignore
        await supabase.from('schedules').update(legacy).eq('id', schedule!.id)
      }
      // 접수대장 연동 (기존 로직 유지)
      if (schedule!.project_id) {
        const t = schedule!.title || ''
        const df = t.includes('실측') ? 'survey_date' : t.includes('동의서') ? 'consent_date' : t.includes('신청서') ? 'application_date' : t.includes('착공서류') ? 'construction_doc_date' : t.includes('시공') ? 'construction_date' : t.includes('완료서류') ? 'completion_doc_date' : null
        if (df) await supabase.from('projects').update({ [df]: startDate }).eq('id', schedule!.project_id)
      }
    } else {
      const { error } = await supabase.from('schedules').insert(payload)
      if (error && /staff_ids/.test(error.message)) {
        const { staff_ids: _ignore, ...legacy } = payload
        void _ignore
        await supabase.from('schedules').insert(legacy)
      }
    }
    setSaving(false); onSave()
  }

  // === View Mode helpers ===
  const viewStaffNames = selectedStaffIds
    .map(id => staffList.find(s => s.id === id)?.name)
    .filter(Boolean)
  const viewStaffLabel = viewStaffNames.length === 0 ? '-' : viewStaffNames.join(', ')
  const viewTypeLabel = TYPE_LABELS[scheduleType] || scheduleType
  const viewTime = schedule?.start_time || null
  const viewDateLabel = (() => {
    if (!schedule) return ''
    const sd = schedule.start_date
    const ed = schedule.end_date
    const fmt = (d: string) => {
      const [y, m, day] = d.split('-')
      return `${y}.${m}.${day}`
    }
    if (sd === ed) return fmt(sd)
    return `${fmt(sd)} ~ ${fmt(ed)}`
  })()

  // === View Mode ===
  if (!isEditing && isEdit && schedule) {
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-surface rounded-[10px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-[480px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center justify-between">
            <h3 className="font-semibold text-txt-primary text-sm">일정 상세</h3>
            <div className="flex items-center gap-1">
              <button onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors">수정</button>
              <button onClick={onClose} className="text-txt-tertiary hover:text-txt-secondary text-lg leading-none px-1">&times;</button>
            </div>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {/* 제목 (큰 글씨) */}
            <div className="flex items-start gap-2">
              {viewTime && (
                <span className="text-[14px] font-medium text-txt-secondary mt-[1px] shrink-0">{viewTime}</span>
              )}
              <h2 className="text-[16px] font-bold text-txt-primary leading-snug break-words">{title}</h2>
            </div>

            {/* 담당자 + 완료 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-txt-tertiary">담당자:</span>
                <span className="text-[13px] font-medium text-txt-primary">{viewStaffLabel}</span>
              </div>
              {confirmed && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-[11px] font-medium">
                  <span>&#10003;</span> 완료
                </span>
              )}
              {!confirmed && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-secondary text-txt-tertiary text-[11px] font-medium">
                  미완료
                </span>
              )}
            </div>

            {/* 날짜 + 시간 + 분류 */}
            <div className="flex items-center gap-4 text-[13px] text-txt-secondary">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-txt-tertiary" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                <span>{viewDateLabel}</span>
              </div>
              {viewTime && (
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-txt-tertiary" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  <span>{viewTime}</span>
                </div>
              )}
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                scheduleType === 'project' ? 'bg-blue-50 text-blue-600' :
                scheduleType === 'promo' ? 'bg-yellow-50 text-yellow-700' :
                scheduleType === 'ai' ? 'bg-cyan-50 text-cyan-700' :
                'bg-gray-100 text-gray-600'
              }`}>{viewTypeLabel}</span>
            </div>

            {/* 메모 */}
            {memo && (
              <div>
                <span className="text-xs text-txt-tertiary block mb-1">메모</span>
                <div className="text-[13px] text-txt-primary whitespace-pre-wrap leading-relaxed bg-surface-secondary/50 rounded-lg px-3 py-2.5">
                  {memo}
                </div>
              </div>
            )}

            {/* 시공 정보 (project_id가 있을 때) */}
            {schedule?.project_id && schedule.memo && (
              <div className="mt-3 pt-3 border-t border-border-tertiary">
                <p className="text-[11px] font-semibold text-txt-tertiary mb-2">시공 정보</p>
                <pre className="text-[12px] text-txt-secondary leading-relaxed whitespace-pre-wrap font-[inherit]">
                  {schedule.memo}
                </pre>
              </div>
            )}

            {/* 시공 사진 안내 */}
            {schedule?.project_id && (
              <div className="mt-3 pt-3 border-t border-border-tertiary">
                <p className="text-[11px] text-txt-quaternary">시공 사진은 접수대장 상세에서 확인하세요</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 border-t border-border-tertiary flex items-center justify-between bg-surface-secondary/50 rounded-b-[10px]">
            <div>{onDelete && <button onClick={onDelete} className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded">삭제</button>}</div>
            <div />
          </div>
        </div>
      </div>
    )
  }

  // === Edit Mode ===
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-[10px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-[480px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center justify-between">
          <h3 className="font-semibold text-txt-primary text-sm">{isEdit ? '일정 수정' : '일정 추가'}</h3>
          <button onClick={onClose} className="text-txt-tertiary hover:text-txt-secondary text-lg">&times;</button>
        </div>
        <div className="p-5 space-y-3.5">
          {/* 제목 */}
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1">제목 *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 권선동 실측"
              className="w-full h-[36px] bg-surface border border-border-primary rounded-lg px-3 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none" />
          </div>

          {/* 담당자 + 완료 (같은 줄) */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <button
                type="button"
                onClick={() => setStaffExpanded(v => !v)}
                className="w-full flex items-center justify-between gap-2 h-[36px] px-3 bg-surface border border-border-primary rounded-lg text-[13px] hover:border-accent transition-colors"
              >
                <span className="text-xs font-medium text-txt-secondary">담당자 배정</span>
                <span className={`text-[12px] truncate flex-1 text-right ${selectedStaffNames ? 'text-txt-primary' : 'text-txt-quaternary'}`}>
                  {selectedStaffNames || '선택'}
                </span>
                <span className={`text-txt-tertiary transition-transform ${staffExpanded ? 'rotate-180' : ''}`}>▼</span>
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer shrink-0">
              <span className="text-xs font-medium text-txt-secondary">완료</span>
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="w-4 h-4 rounded border-border-secondary text-accent" />
            </label>
          </div>
          {staffExpanded && (
            <div className="p-2 bg-surface-tertiary/40 rounded-lg flex flex-wrap gap-2">
              {staffList.map(s => (
                <label key={s.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] cursor-pointer transition-colors ${
                  selectedStaffIds.includes(s.id) ? 'border-accent bg-accent/10 text-accent font-medium' : 'border-border-primary bg-surface text-txt-secondary hover:border-accent'
                }`}>
                  <input type="checkbox" checked={selectedStaffIds.includes(s.id)} onChange={() => toggleStaff(s.id)} className="sr-only" />
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: staffColorMap[s.id] || '#999' }} />
                  {s.name}
                </label>
              ))}
            </div>
          )}

          {/* 시작일 + 시간 (시/분 분리) */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-txt-secondary mb-1">시작일 *</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full h-[36px] bg-surface border border-border-primary rounded-lg px-3 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none" />
            </div>
            <div className="shrink-0">
              <label className="block text-xs font-medium text-txt-secondary mb-1">시간</label>
              <div className="flex items-center gap-1">
                <select value={startHour} onChange={e => setStartHour(e.target.value)}
                  className="w-[60px] h-[36px] bg-surface border border-border-primary rounded-lg px-2 text-[13px] text-center focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none">
                  <option value="">--</option>
                  {Array.from({ length: 16 }, (_, i) => {
                    const h = String(i + 7).padStart(2, '0')
                    return <option key={h} value={h}>{h}</option>
                  })}
                </select>
                <span className="text-txt-tertiary text-sm font-medium">:</span>
                <select value={startMinute} onChange={e => setStartMinute(e.target.value)}
                  className="w-[60px] h-[36px] bg-surface border border-border-primary rounded-lg px-2 text-[13px] text-center focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none">
                  <option value="">--</option>
                  {['00', '10', '20', '30', '40', '50'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 종료일 (체크박스로 토글) */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-1.5">
              <input type="checkbox" checked={hasEndDate} onChange={e => setHasEndDate(e.target.checked)} className="w-3.5 h-3.5 rounded border-border-secondary text-accent" />
              <span className="text-xs font-medium text-txt-secondary">종료일 설정</span>
            </label>
            {hasEndDate && (
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full h-[36px] bg-surface border border-border-primary rounded-lg px-3 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none" />
            )}
          </div>

          {/* 분류 */}
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1">분류</label>
            <select
              value={scheduleType}
              onChange={e => { setScheduleType(e.target.value); setUserTouchedType(true) }}
              className="w-full h-[36px] bg-surface border border-border-primary rounded-lg px-3 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
            >
              <option value="personal">개인</option>
              <option value="project">지원사업</option>
              <option value="promo">홍보</option>
              <option value="ai">AI제안</option>
            </select>
            {!userTouchedType && title.includes('홍보') && (
              <p className="text-[10px] text-[#F59E0B] mt-1">제목에 &quot;홍보&quot;가 포함되어 자동으로 홍보 분류로 저장됩니다</p>
            )}
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1">메모</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={4}
              className="w-full bg-surface border border-border-primary rounded-lg px-3 py-2 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border-tertiary flex items-center justify-between bg-surface-secondary/50 rounded-b-[10px]">
          <div>{onDelete && <button onClick={onDelete} className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded">삭제</button>}</div>
          <div className="flex gap-2">
            <button onClick={isEdit ? () => setIsEditing(false) : onClose}
              className="px-4 py-2 text-sm border border-border-primary rounded-lg hover:bg-surface-tertiary">취소</button>
            <button onClick={handleSubmit} disabled={saving || !title || !startDate || !endDate}
              className="px-5 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 font-medium shadow-sm">{saving ? '저장 중...' : '저장'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
//  업무일지 모달
// ============================================================
function DailyLogModal({
  staffId,
  schedules,
  staffList,
  onClose,
}: {
  staffId: string | null
  schedules: Schedule[]
  staffList: Staff[]
  onClose: () => void
}) {
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10))
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load existing log
  useEffect(() => {
    if (!staffId) return
    ;(async () => {
      try {
        const { data } = await supabase
          .from('daily_logs')
          .select('*')
          .eq('staff_id', staffId)
          .eq('log_date', logDate)
          .maybeSingle()
        if (data) {
          setMemo(data.memo || '')
        } else {
          setMemo('')
        }
      } catch {
        // daily_logs table may not exist yet
        setMemo('')
      }
    })()
  }, [staffId, logDate])

  // Today's schedules for this staff
  const todaySchedules = useMemo(() =>
    schedules.filter(s =>
      s.start_date <= logDate && s.end_date >= logDate &&
      (s.staff_id === staffId || (s.staff_ids && s.staff_ids.includes(staffId || '')))
    ).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
  , [schedules, logDate, staffId])

  const completed = todaySchedules.filter(s => s.confirmed)
  const incomplete = todaySchedules.filter(s => !s.confirmed)

  // Tomorrow's schedules
  const tomorrow = new Date(logDate)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)

  const tomorrowSchedules = useMemo(() =>
    schedules.filter(s =>
      s.start_date <= tomorrowStr && s.end_date >= tomorrowStr &&
      (s.staff_id === staffId || (s.staff_ids && s.staff_ids.includes(staffId || '')))
    ).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
  , [schedules, tomorrowStr, staffId])

  // My projects count
  const [projectStats, setProjectStats] = useState({ active: 0, outstanding: 0, deadline: 0 })
  useEffect(() => {
    if (!staffId) return
    ;(async () => {
      try {
        const { data } = await supabase
          .from('projects')
          .select('status, outstanding')
          .eq('staff_id', staffId)
        if (data) {
          const active = data.filter((p: { status: string }) => !['취소', '입금'].includes(p.status)).length
          const outstanding = data.filter((p: { outstanding: number }) => p.outstanding > 0).length
          setProjectStats({ active, outstanding, deadline: 0 })
        }
      } catch {
        // ignore
      }
    })()
  }, [staffId])

  const staffName = staffList.find(s => s.id === staffId)?.name || ''

  // Date navigation
  const prevDay = () => {
    const d = new Date(logDate)
    d.setDate(d.getDate() - 1)
    setLogDate(d.toISOString().slice(0, 10))
  }
  const nextDay = () => {
    const d = new Date(logDate)
    d.setDate(d.getDate() + 1)
    setLogDate(d.toISOString().slice(0, 10))
  }

  const dayNames = ['일','월','화','수','목','금','토']
  const dateObj = new Date(logDate)
  const dateLabel = `${dateObj.getMonth()+1}월 ${dateObj.getDate()}일 (${dayNames[dateObj.getDay()]})`

  const handleSave = async () => {
    if (!staffId) return
    setSaving(true)
    try {
      const payload = {
        staff_id: staffId,
        log_date: logDate,
        completed_items: completed.map(s => ({ id: s.id, title: s.title, time: s.start_time })),
        incomplete_items: incomplete.map(s => ({ id: s.id, title: s.title, time: s.start_time })),
        tomorrow_items: tomorrowSchedules.map(s => ({ id: s.id, title: s.title, time: s.start_time })),
        memo: memo || null,
        project_summary: projectStats,
      }

      const { data: existing } = await supabase
        .from('daily_logs')
        .select('id')
        .eq('staff_id', staffId)
        .eq('log_date', logDate)
        .maybeSingle()

      if (existing) {
        await supabase.from('daily_logs').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id)
      } else {
        await supabase.from('daily_logs').insert(payload)
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // daily_logs table may not exist yet — fail gracefully
      alert('업무일지 테이블이 아직 생성되지 않았습니다.')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-[10px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-[640px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header with date navigation */}
        <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-txt-primary">업무일지</span>
            {staffName && <span className="text-[12px] text-txt-tertiary">({staffName})</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevDay} className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-tertiary text-txt-secondary">&lsaquo;</button>
            <span className="text-[13px] font-medium text-txt-primary min-w-[120px] text-center">{dateLabel}</span>
            <button onClick={nextDay} className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-tertiary text-txt-secondary">&rsaquo;</button>
          </div>
          <button onClick={onClose} className="text-txt-tertiary hover:text-txt-secondary text-lg">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Project summary */}
          <div className="p-3 bg-surface-secondary rounded-lg">
            <p className="text-[11px] font-semibold text-txt-tertiary mb-1">내 담당 프로젝트</p>
            <div className="flex gap-4 text-[12px]">
              <span>진행중 <span className="font-semibold text-accent">{projectStats.active}건</span></span>
              <span>미수금 <span className="font-semibold text-[#e57e25]">{projectStats.outstanding}건</span></span>
            </div>
          </div>

          {/* Today / Tomorrow side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Left: Today */}
            <div>
              <h4 className="text-[12px] font-semibold text-txt-primary mb-2">오늘 한 일</h4>
              {completed.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-medium text-green-600 mb-1">완료 {completed.length}건</p>
                  {completed.map(s => (
                    <div key={s.id} className="text-[12px] text-txt-secondary py-0.5">
                      {s.start_time && <span className="text-txt-tertiary tabular-nums mr-1">{s.start_time}</span>}
                      {s.title}
                    </div>
                  ))}
                </div>
              )}
              {incomplete.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-[#e57e25] mb-1">미완료 {incomplete.length}건</p>
                  {incomplete.map(s => (
                    <div key={s.id} className="text-[12px] text-txt-secondary py-0.5">
                      {s.start_time && <span className="text-txt-tertiary tabular-nums mr-1">{s.start_time}</span>}
                      {s.title}
                    </div>
                  ))}
                </div>
              )}
              {todaySchedules.length === 0 && (
                <p className="text-[12px] text-txt-quaternary">일정 없음</p>
              )}
            </div>

            {/* Right: Tomorrow */}
            <div>
              <h4 className="text-[12px] font-semibold text-txt-primary mb-2">내일 할 일</h4>
              {tomorrowSchedules.length > 0 ? (
                tomorrowSchedules.map(s => (
                  <div key={s.id} className="text-[12px] text-txt-secondary py-0.5">
                    {s.start_time && <span className="text-txt-tertiary tabular-nums mr-1">{s.start_time}</span>}
                    {s.title}
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-txt-quaternary">일정 없음</p>
              )}
            </div>
          </div>

          {/* Memo */}
          <div>
            <label className="block text-[12px] font-semibold text-txt-primary mb-1">메모</label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              rows={5}
              placeholder="오늘 업무 내용, 특이사항, 내일 추가 할 일 등을 메모하세요..."
              className="w-full bg-surface border border-border-primary rounded-lg px-3 py-2.5 text-[13px] text-txt-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none resize-none leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border-tertiary flex items-center justify-end gap-2">
          {saved && <span className="text-[12px] text-green-600 font-medium mr-2">저장됨</span>}
          <button onClick={onClose} className="px-4 py-2 text-[13px] border border-border-primary rounded-lg hover:bg-surface-tertiary transition">닫기</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-[13px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
