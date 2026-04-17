'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

// --- 타입 ---
interface Schedule {
  id: string
  site_id: string
  title: string
  start_date: string
  end_date: string
  contractor: string | null
  workers: string | null
  memo: string | null
  confirmed: boolean
  color: string
  sort_order: number
}

interface WorkTag {
  name: string
  color: string
}

// --- 기본 공종 태그 ---
const DEFAULT_TAGS: WorkTag[] = [
  { name: '바닥재', color: '#10B981' },
  { name: '필름', color: '#EF4444' },
  { name: '방수', color: '#10B981' },
  { name: '전기', color: '#F59E0B' },
  { name: '소방', color: '#22C55E' },
  { name: '철거', color: '#EF4444' },
  { name: '목공', color: '#1F2937' },
  { name: '타일', color: '#EC4899' },
  { name: '메지', color: '#F97316' },
  { name: '도배', color: '#8B5CF6' },
  { name: '입주청소', color: '#F97316' },
]

// --- 유틸 ---
function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1
}

function addDays(dateString: string, days: number) {
  const d = new Date(dateString)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

interface Vendor {
  id: string
  name: string
  vendor_type: string
  phone: string | null
}

// --- 메인 ---
export default function ProcessCalendar({
  siteId,
  schedules,
  onReload,
  vendorList = [],
}: {
  siteId: string
  schedules: Schedule[]
  onReload: () => void
  vendorList?: Vendor[]
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [tags, setTags] = useState<WorkTag[]>(DEFAULT_TAGS)
  const [showAddTag, setShowAddTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3B82F6')
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [dragTag, setDragTag] = useState<WorkTag | null>(null)

  // 스트레치: 실시간 프리뷰용 state
  const [stretching, setStretching] = useState<{
    scheduleId: string
    edge: 'start' | 'end'
  } | null>(null)
  const [stretchPreview, setStretchPreview] = useState<string | null>(null) // 프리뷰 날짜
  const stretchingRef = useRef(stretching)
  stretchingRef.current = stretching

  const calendarRef = useRef<HTMLDivElement>(null)

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

  // 스트레치 프리뷰 적용된 스케줄 목록
  const displaySchedules = useMemo(() => {
    if (!stretching || !stretchPreview) return schedules
    return schedules.map(s => {
      if (s.id !== stretching.scheduleId) return s
      if (stretching.edge === 'start' && stretchPreview <= s.end_date) {
        return { ...s, start_date: stretchPreview }
      }
      if (stretching.edge === 'end' && stretchPreview >= s.start_date) {
        return { ...s, end_date: stretchPreview }
      }
      return s
    })
  }, [schedules, stretching, stretchPreview])

  // 주(week) 단위로 날짜 그룹핑
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

  // 해당 주에 걸치는 스케줄 + 위치 계산 (프리뷰 적용)
  const getWeekBars = useCallback((week: (number | null)[]) => {
    const weekDates = week.map(d => d ? dateStr(month.year, month.month, d) : null)
    const weekStart = weekDates.find(d => d) || ''
    const weekEnd = [...weekDates].reverse().find(d => d) || ''

    return displaySchedules
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
        return { schedule: s, left, width, startIdx, endIdx, duration, isStart, isEnd }
      })
      .filter(Boolean) as { schedule: Schedule; left: number; width: number; startIdx: number; endIdx: number; duration: number; isStart: boolean; isEnd: boolean }[]
  }, [displaySchedules, month])

  // 공종 태그 드래그 → 캘린더 드롭 → 바로 생성
  const handleTagDragStart = (tag: WorkTag) => {
    setDragTag(tag)
  }

  const handleDayDrop = async (day: number) => {
    if (dragTag) {
      const targetDate = dateStr(month.year, month.month, day)
      await supabase.from('schedules').insert({
        site_id: siteId,
        title: dragTag.name,
        start_date: targetDate,
        end_date: targetDate,  // 1일 시작
        color: dragTag.color,
        confirmed: false,
      })
      setDragTag(null)
      onReload()
      return
    }
  }

  // 바 드래그 이동
  const handleBarDragStart = (e: React.DragEvent, s: Schedule) => {
    e.dataTransfer.setData('scheduleId', s.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleBarDrop = async (e: React.DragEvent, day: number) => {
    e.preventDefault()
    const scheduleId = e.dataTransfer.getData('scheduleId')
    if (!scheduleId) return
    const s = schedules.find(sc => sc.id === scheduleId)
    if (!s) return
    const targetDate = dateStr(month.year, month.month, day)
    const duration = daysBetween(s.start_date, s.end_date) - 1
    const newEnd = addDays(targetDate, duration)
    await supabase.from('schedules').update({ start_date: targetDate, end_date: newEnd }).eq('id', s.id)
    onReload()
  }

  // 스트레치 mousedown
  const handleStretchMouseDown = (e: React.MouseEvent, scheduleId: string, edge: 'start' | 'end') => {
    e.stopPropagation()
    e.preventDefault()
    setStretching({ scheduleId, edge })
    setStretchPreview(null)
  }

  // 글로벌 mousemove (실시간 프리뷰) + mouseup (확정)
  useEffect(() => {
    if (!stretching) return

    const findDayFromPoint = (x: number, y: number): number | null => {
      const el = document.elementFromPoint(x, y)
      const cell = el?.closest('[data-day]') as HTMLElement | null
      if (!cell) return null
      return parseInt(cell.dataset.day || '0') || null
    }

    const handleMouseMove = (e: MouseEvent) => {
      const day = findDayFromPoint(e.clientX, e.clientY)
      if (day) {
        setStretchPreview(dateStr(month.year, month.month, day))
      }
    }

    const handleMouseUp = async (e: MouseEvent) => {
      const st = stretchingRef.current
      if (!st) { cleanup(); return }

      const day = findDayFromPoint(e.clientX, e.clientY)
      if (!day) { cleanup(); return }

      const s = schedules.find(sc => sc.id === st.scheduleId)
      if (!s) { cleanup(); return }

      const targetDate = dateStr(month.year, month.month, day)

      if (st.edge === 'start') {
        if (targetDate <= s.end_date) {
          await supabase.from('schedules').update({ start_date: targetDate }).eq('id', s.id)
        }
      } else {
        if (targetDate >= s.start_date) {
          await supabase.from('schedules').update({ end_date: targetDate }).eq('id', s.id)
        }
      }
      cleanup()
      onReload()
    }

    const cleanup = () => {
      setStretching(null)
      setStretchPreview(null)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [stretching, schedules, month, onReload])

  // 태그 추가/삭제
  const handleAddTag = () => {
    if (!newTagName.trim()) return
    setTags(prev => [...prev, { name: newTagName.trim(), color: newTagColor }])
    setNewTagName('')
    setShowAddTag(false)
  }
  const handleRemoveTag = (name: string) => {
    setTags(prev => prev.filter(t => t.name !== name))
  }

  // 스케줄 삭제
  const handleDeleteSchedule = async (id: string) => {
    await supabase.from('schedules').delete().eq('id', id)
    setEditSchedule(null)
    setShowScheduleModal(false)
    onReload()
  }

  const TAG_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#1F2937', '#06B6D4']

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-lg transition-colors">&lsaquo;</button>
          <h3 className="text-base font-bold text-gray-900 min-w-[140px] text-center">{monthLabel} 공정 일정</h3>
          <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-lg transition-colors">&rsaquo;</button>
        </div>
        <p className="text-[11px] text-gray-400">공종 드래그 추가 · 바 끝 잡아 늘리기/줄이기 · 더블클릭 수정</p>
      </div>

      <div className="flex gap-3">
        {/* 왼쪽: 공종 태그 목록 (2열) */}
        <div className="w-40 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600">공종</span>
            <button onClick={() => setShowAddTag(!showAddTag)} className="text-[11px] text-blue-600 hover:text-blue-800 font-medium">+ 추가</button>
          </div>

          {showAddTag && (
            <div className="mb-2 p-2 border border-gray-200 rounded-lg bg-gray-50 space-y-2">
              <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="공종명"
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                onKeyDown={e => e.key === 'Enter' && handleAddTag()} />
              <div className="flex gap-1 flex-wrap">
                {TAG_COLORS.map(c => (
                  <button key={c} onClick={() => setNewTagColor(c)}
                    className={`w-4 h-4 rounded-full border-2 transition-all ${newTagColor === c ? 'border-gray-800 scale-125' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex gap-1">
                <button onClick={handleAddTag} className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">추가</button>
                <button onClick={() => setShowAddTag(false)} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">취소</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1">
            {tags.map(tag => (
              <div
                key={tag.name}
                draggable
                onDragStart={() => handleTagDragStart(tag)}
                className="flex items-center gap-1 px-1.5 py-1 border border-gray-200 rounded cursor-grab active:cursor-grabbing hover:bg-gray-50 hover:border-gray-300 group transition-colors"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                <span className="text-[11px] text-gray-700 truncate flex-1">{tag.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 오른쪽: 캘린더 그리드 */}
        <div className="flex-1 min-w-0" ref={calendarRef}>
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold mb-0.5 border-b border-gray-200 pb-1">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} className={`py-0.5 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>{d}</div>
            ))}
          </div>

          {/* 주별 렌더링 */}
          {weeks.map((week, wi) => {
            const bars = getWeekBars(week)
            const rows: typeof bars[] = []
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
              <div key={wi} className="border-b border-gray-100">
                {/* 날짜 숫자 */}
                <div className="grid grid-cols-7">
                  {week.map((day, di) => (
                    <div
                      key={di}
                      data-day={day || undefined}
                      className={`px-1 py-0.5 text-[11px] border-r border-gray-50 last:border-r-0 ${!day ? 'bg-gray-50/50' : ''} ${stretching ? 'cursor-ew-resize' : ''}`}
                      onDragOver={day ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } : undefined}
                      onDrop={day ? e => {
                        e.preventDefault()
                        if (dragTag) { handleDayDrop(day); return }
                        handleBarDrop(e, day)
                      } : undefined}
                    >
                      {day && (
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px]
                          ${dateStr(month.year, month.month, day) === today ? 'bg-blue-600 text-white font-bold' : ''}
                          ${di === 0 ? 'text-red-400' : di === 6 ? 'text-blue-400' : 'text-gray-500'}
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
                  style={{ minHeight: Math.max(barsAreaHeight + 4, 66) }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                >
                  {week.map((day, di) => (
                    <div key={di}
                      data-day={day || undefined}
                      className={`border-r border-gray-50 last:border-r-0 ${stretching ? 'cursor-ew-resize' : ''}`}
                      onDragOver={day ? e => { e.preventDefault() } : undefined}
                      onDrop={day ? e => {
                        e.preventDefault()
                        if (dragTag) { handleDayDrop(day); return }
                        handleBarDrop(e, day)
                      } : undefined}
                    />
                  ))}

                  {rows.map((row, ri) => (
                    row.map(bar => {
                      const s = bar.schedule
                      const top = ri * (barHeight + barGap) + 2
                      const isStretching = stretching?.scheduleId === s.id
                      return (
                        <div
                          key={s.id + '-' + wi}
                          draggable={!stretching}
                          onDragStart={e => handleBarDragStart(e, s)}
                          onDoubleClick={() => { setEditSchedule(s); setShowScheduleModal(true) }}
                          className={`absolute flex items-center rounded-md cursor-move group/bar overflow-hidden transition-[width,left] ${isStretching ? 'duration-75' : 'duration-0'} ${
                            s.confirmed ? 'text-white shadow-sm' : 'bg-white shadow-sm'
                          }`}
                          style={{
                            left: `${bar.left}%`,
                            width: `${bar.width}%`,
                            top,
                            height: barHeight,
                            ...(s.confirmed
                              ? { backgroundColor: s.color }
                              : { border: `1.5px dashed ${s.color}`, color: s.color }),
                          }}
                          title={`${s.title}${s.contractor ? ` (${s.contractor})` : ''} ${bar.duration}일${s.workers ? ` / 작업자: ${s.workers}` : ''}`}
                        >
                          {/* 왼쪽 스트레치 핸들 */}
                          {bar.isStart && (
                            <div
                              className="absolute left-0 top-0 bottom-0 w-4 cursor-col-resize z-10 opacity-0 group-hover/bar:opacity-100 transition-opacity flex items-center justify-center hover:bg-black/20"
                              onMouseDown={e => handleStretchMouseDown(e, s.id, 'start')}
                            >
                              <div className="flex gap-px"><div className="w-[2px] h-3 rounded-full bg-white/70" /><div className="w-[2px] h-3 rounded-full bg-white/70" /></div>
                            </div>
                          )}

                          <span className="text-[10px] font-medium px-2 truncate w-full text-center leading-tight">
                            {s.title}
                            {s.contractor ? ` (${s.contractor})` : ''}
                            <span className="opacity-70 ml-0.5">{bar.duration}일</span>
                          </span>

                          {/* 오른쪽 스트레치 핸들 */}
                          {bar.isEnd && (
                            <div
                              className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize z-10 opacity-0 group-hover/bar:opacity-100 transition-opacity flex items-center justify-center hover:bg-black/20"
                              onMouseDown={e => handleStretchMouseDown(e, s.id, 'end')}
                            >
                              <div className="flex gap-px"><div className="w-[2px] h-3 rounded-full bg-white/70" /><div className="w-[2px] h-3 rounded-full bg-white/70" /></div>
                            </div>
                          )}
                        </div>
                      )
                    })
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-6 h-2.5 rounded bg-blue-500 inline-block" /> 확정
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-6 h-2.5 rounded border-[1.5px] border-dashed border-red-400 inline-block" /> 미확정
        </span>
      </div>

      {/* 공종 수정 모달 (더블클릭 시) */}
      {showScheduleModal && editSchedule && (
        <ScheduleModal
          siteId={siteId}
          schedule={editSchedule}
          vendorList={vendorList}
          onClose={() => { setShowScheduleModal(false); setEditSchedule(null) }}
          onSave={() => { setShowScheduleModal(false); setEditSchedule(null); onReload() }}
          onDelete={() => handleDeleteSchedule(editSchedule.id)}
        />
      )}
    </div>
  )
}

// --- 공종 수정 모달 ---
const MODAL_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#1F2937', '#22C55E']

function ScheduleModal({
  siteId, schedule, vendorList = [], onClose, onSave, onDelete,
}: {
  siteId: string
  schedule: Schedule
  vendorList?: Vendor[]
  onClose: () => void
  onSave: () => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(schedule.title)
  const [startDate, setStartDate] = useState(schedule.start_date)
  const [endDate, setEndDate] = useState(schedule.end_date)
  const [contractor, setContractor] = useState(schedule.contractor || '')
  const [workers, setWorkers] = useState(schedule.workers || '')
  const [memo, setMemo] = useState(schedule.memo || '')
  const [confirmed, setConfirmed] = useState(schedule.confirmed)
  const [color, setColor] = useState(schedule.color)
  const [saving, setSaving] = useState(false)
  const [contractorSearch, setContractorSearch] = useState(schedule.contractor || '')
  const [showContractorDropdown, setShowContractorDropdown] = useState(false)
  const [workerSearch, setWorkerSearch] = useState(schedule.workers || '')
  const [showWorkerDropdown, setShowWorkerDropdown] = useState(false)
  const contractorRef = useRef<HTMLDivElement>(null)
  const workerRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (contractorRef.current && !contractorRef.current.contains(e.target as Node)) setShowContractorDropdown(false)
      if (workerRef.current && !workerRef.current.contains(e.target as Node)) setShowWorkerDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSubmit = async () => {
    if (!title || !startDate || !endDate) return
    setSaving(true)
    await supabase.from('schedules').update({
      title, start_date: startDate, end_date: endDate,
      contractor: contractor || null, workers: workers || null, memo: memo || null, confirmed, color,
    }).eq('id', schedule.id)
    setSaving(false)
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[460px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 text-sm">공종 수정</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">공종명 *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-none transition" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">시작일 *</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">종료일 *</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative" ref={contractorRef}>
              <label className="block text-xs font-medium text-gray-600 mb-1">시공업체</label>
              <input
                value={contractorSearch}
                onChange={e => { setContractorSearch(e.target.value); setContractor(e.target.value) }}
                onFocus={() => setShowContractorDropdown(true)}
                placeholder="업체명 검색..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
              />
              {showContractorDropdown && contractorSearch && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {vendorList
                    .filter(v => v.vendor_type === '협력업체' && v.name.includes(contractorSearch))
                    .slice(0, 5)
                    .map(v => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => { setContractor(v.name); setContractorSearch(v.name); setShowContractorDropdown(false) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-gray-800">{v.name}</span>
                        {v.phone && <span className="text-xs text-gray-400 ml-2">{v.phone}</span>}
                      </button>
                    ))}
                  {vendorList.filter(v => v.vendor_type === '협력업체' && v.name.includes(contractorSearch)).length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>
                  )}
                </div>
              )}
            </div>
            <div className="relative" ref={workerRef}>
              <label className="block text-xs font-medium text-gray-600 mb-1">투입 작업자</label>
              <input
                value={workerSearch}
                onChange={e => { setWorkerSearch(e.target.value); setWorkers(e.target.value) }}
                onFocus={() => setShowWorkerDropdown(true)}
                placeholder="작업자 검색..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
              />
              {showWorkerDropdown && workerSearch && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {vendorList
                    .filter(v => v.vendor_type === '일용직' && v.name.includes(workerSearch))
                    .slice(0, 5)
                    .map(v => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => { setWorkers(v.name); setWorkerSearch(v.name); setShowWorkerDropdown(false) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-gray-800">{v.name}</span>
                        {v.phone && <span className="text-xs text-gray-400 ml-2">{v.phone}</span>}
                      </button>
                    ))}
                  {vendorList.filter(v => v.vendor_type === '일용직' && v.name.includes(workerSearch)).length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">메모</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">색상</label>
            <div className="flex gap-1.5">
              {MODAL_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-gray-800 scale-110 ring-2 ring-gray-200' : 'border-gray-100 hover:border-gray-300'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700">확정 (업체/작업자 배정 완료)</span>
          </label>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-b-xl">
          <button onClick={onDelete} className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors">삭제</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">취소</button>
            <button onClick={handleSubmit} disabled={saving || !title || !startDate || !endDate}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? '저장 중...' : '수정'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
