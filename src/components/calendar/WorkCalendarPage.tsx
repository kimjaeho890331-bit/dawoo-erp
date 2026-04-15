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
    return filtered.filter(s => s.start_date <= we && s.end_date >= ws).map(s => {
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
//  일정 추가/수정 모달
// ============================================================
function ScheduleModal({ schedule, staffList, defaultDate, staffColorMap, onClose, onSave, onDelete }: {
  schedule: Schedule | null; staffList: Staff[]; defaultDate: string; staffColorMap: Record<string, string>
  onClose: () => void; onSave: () => void; onDelete?: () => void
}) {
  const isEdit = !!schedule
  const [title, setTitle] = useState(schedule?.title || '')
  const [startDate, setStartDateRaw] = useState(schedule?.start_date || defaultDate)
  const [endDate, setEndDate] = useState(schedule?.end_date || defaultDate)
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
            <button
              type="button"
              onClick={() => setStaffExpanded(v => !v)}
              className="w-full flex items-center justify-between gap-2 h-[36px] px-3 bg-surface border border-border-primary rounded-lg text-[13px] hover:border-accent transition-colors"
            >
              <span className="text-xs font-medium text-txt-secondary">담당자 배정</span>
              <span className={`text-[12px] truncate flex-1 text-right ${selectedStaffNames ? 'text-txt-primary' : 'text-txt-quaternary'}`}>
                {selectedStaffNames || '담당자 선택 (다중 가능)'}
              </span>
              <span className={`text-txt-tertiary transition-transform ${staffExpanded ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {staffExpanded && (
              <div className="mt-2 p-2 bg-surface-tertiary/40 rounded-lg flex flex-wrap gap-2">
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
          </div>
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
              <p className="text-[10px] text-[#F59E0B] mt-1">제목에 "홍보"가 포함되어 자동으로 홍보 분류로 저장됩니다</p>
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
