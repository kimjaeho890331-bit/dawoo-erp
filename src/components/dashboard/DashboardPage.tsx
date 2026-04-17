'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pin,
  X,
  Check,
  Plus,
  Send,
  AlertTriangle,
  Clock,
  Lightbulb,
  HelpCircle,
  ArrowRight,
  Wrench,
} from 'lucide-react'
import FirstVisitModal from './FirstVisitModal'
import type { BriefingResponse, BriefingItem as BriefingItemType, BriefingCategory, Task } from '@/types'

// --- 타입 ---
interface Schedule {
  id: string
  staff_id: string | null
  schedule_type: string
  title: string
  start_date: string
  end_date: string
  confirmed: boolean
  project_id: string | null
}

interface Staff {
  id: string
  name: string
}

interface Memo {
  id: string
  content: string
  pinned: boolean
}

interface ASRecord {
  id: string
  status: string
}

export interface TodoItem {
  id: string
  source: 'schedule' | 'task'
  title: string
  date: string | null
  href: string
  projectId: string | null
  assignerName: string | null
  scheduleType?: string
  rawId: string
}

const MEMO_STORAGE_KEY = 'dawoo_dashboard_memos'
const STAFF_STORAGE_KEY = 'dawoo_current_staff_id'
const ACCORDION_STORAGE_KEY = 'dawoo_dashboard_accordion'

function loadMemosFromStorage(): Memo[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(MEMO_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Memo[]
  } catch { /* */ }
  return null
}

function saveMemosToStorage(memos: Memo[]) {
  try {
    localStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify(memos))
  } catch { /* */ }
}

function loadAccordionState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(ACCORDION_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return {}
}

function saveAccordionState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(ACCORDION_STORAGE_KEY, JSON.stringify(state))
  } catch { /* */ }
}

// --- 인사말 ---
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return '좋은 아침이에요'
  if (h < 18) return '좋은 오후에요'
  return '좋은 저녁이에요'
}

// --- 날짜 배지 ---
function dayDelta(date: string | null) {
  if (!date) return null
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - t.getTime()) / 86400000)
}

function badgeInfo(date: string | null): { label: string; color: string } {
  const diff = dayDelta(date)
  if (diff === null) return { label: '상시', color: 'text-txt-tertiary' }
  if (diff === 0) return { label: '오늘', color: 'text-[#dc2626] font-semibold' }
  if (diff < 0) return { label: `${Math.abs(diff)}일 지남`, color: 'text-[#dc2626] font-semibold' }
  if (diff <= 2) return { label: `D-${diff}`, color: 'text-[#9a3412] font-medium' }
  return { label: `D-${diff}`, color: 'text-txt-tertiary' }
}

// --- 캘린더 헬퍼 ---
function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// --- 브리핑 카테고리 ---
const BRIEFING_CATEGORIES: { key: BriefingCategory; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'now', label: '지금 당장', icon: <AlertTriangle size={13} />, color: 'text-[#dc2626]' },
  { key: 'today', label: '오늘 안에', icon: <Clock size={13} />, color: 'text-[#d97706]' },
  { key: 'week', label: '이번 주', icon: <Lightbulb size={13} />, color: 'text-[#059669]' },
]

const BRIEFING_BAR_STYLES: Record<string, { bar: string; bg: string }> = {
  now: { bar: 'bg-[#dc2626]', bg: 'hover:bg-[#fef2f2]' },
  today: { bar: 'bg-[#d97706]', bg: 'hover:bg-[#fffbeb]' },
  week: { bar: 'bg-[#059669]', bg: 'hover:bg-[#ecfdf5]' },
}

const TODO_TYPE_COLORS: Record<string, string> = {
  project: '#3B82F6', personal: '#8B5CF6', promo: '#F59E0B', ai: '#06B6D4', task: '#059669',
}

// ===== 아코디언 컴포넌트 =====
function AccordionSection({
  id,
  title,
  count,
  dotColor = 'bg-accent',
  defaultOpen = true,
  accordionState,
  onToggle,
  children,
}: {
  id: string
  title: string
  count?: number
  dotColor?: string
  defaultOpen?: boolean
  accordionState: Record<string, boolean>
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  const open = accordionState[id] ?? defaultOpen
  return (
    <div className="bg-surface border border-border-primary rounded-xl overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-4 py-3.5 active:bg-surface-tertiary transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
          <span className="text-[15px] font-semibold text-txt-primary">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="text-[12px] text-txt-tertiary">({count})</span>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`text-txt-tertiary transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// ===== 미니 캘린더 =====
function MiniCalendar({ schedules }: { schedules: Schedule[] }) {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  )

  const today = new Date().toISOString().slice(0, 10)
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate()
  const firstDayOfWeek = new Date(month.year, month.month, 1).getDay()
  const monthLabel = `${month.year}년 ${month.month + 1}월`

  const prevMonth = () =>
    setMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })
  const nextMonth = () =>
    setMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })

  // 날짜별 일정 맵
  const scheduleDates = useMemo(() => {
    const map = new Map<string, Schedule[]>()
    for (const s of schedules) {
      const start = new Date(s.start_date)
      const end = new Date(s.end_date)
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10)
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(s)
      }
    }
    return map
  }, [schedules])

  // 그리드 셀 만들기
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedSchedules = scheduleDates.get(selectedDate) ?? []

  return (
    <div className="bg-surface border border-border-primary rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3.5">
        <h3 className="text-[15px] font-semibold text-txt-primary mb-3">전체 공정 일정</h3>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-tertiary text-txt-tertiary"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-[14px] font-semibold text-txt-primary">{monthLabel}</span>
          <button
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-tertiary text-txt-tertiary"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-1">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div
              key={d}
              className={`text-center text-[12px] font-medium py-1 ${
                i === 0 ? 'text-[#dc2626]/60' : i === 6 ? 'text-[#2563eb]/60' : 'text-txt-tertiary'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="h-10" />
            const dateKey = dateStr(month.year, month.month, day)
            const isToday = dateKey === today
            const isSelected = dateKey === selectedDate
            const hasSchedule = scheduleDates.has(dateKey)
            const dayOfWeek = (firstDayOfWeek + day - 1) % 7

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(dateKey)}
                className="flex flex-col items-center justify-center h-10 rounded-lg transition-colors relative"
              >
                <span
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-[13px] transition-colors ${
                    isSelected
                      ? 'bg-accent text-white font-semibold'
                      : isToday
                        ? 'bg-[#2563eb]/10 text-[#2563eb] font-semibold'
                        : dayOfWeek === 0
                          ? 'text-[#dc2626]/70'
                          : dayOfWeek === 6
                            ? 'text-[#2563eb]/70'
                            : 'text-txt-primary'
                  }`}
                >
                  {day}
                </span>
                {hasSchedule && (
                  <span
                    className={`absolute bottom-0.5 w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-white' : 'bg-accent'
                    }`}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 선택 날짜 일정 */}
      <div className="border-t border-border-tertiary px-4 py-3">
        <p className="text-[13px] font-medium text-txt-secondary mb-2">
          {selectedDate.replace(/-/g, '.')} 일정
        </p>
        {selectedSchedules.length === 0 ? (
          <p className="text-[13px] text-txt-quaternary py-2">일정 없음</p>
        ) : (
          <div className="space-y-1.5">
            {selectedSchedules.map(s => (
              <Link
                key={s.id}
                href={s.project_id ? `/register/${s.project_id}` : '/calendar/work'}
                className="flex items-center gap-2.5 py-1.5 hover:bg-surface-tertiary rounded-lg px-2 -mx-2 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span className="text-[13px] text-txt-primary truncate">{s.title}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ===== 메인 컴포넌트 =====
export default function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10)

  const [staffList, setStaffList] = useState<Staff[]>([])
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(STAFF_STORAGE_KEY)
  })
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(true)
  const [mySchedules, setMySchedules] = useState<Schedule[]>([])
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([])
  const [myTasksReceived, setMyTasksReceived] = useState<Task[]>([])
  const [myTasksAssigned, setMyTasksAssigned] = useState<Task[]>([])
  const [tasksTableMissing, setTasksTableMissing] = useState(false)
  const [asRecords, setAsRecords] = useState<ASRecord[]>([])

  // 메모장
  const [memos, setMemos] = useState<Memo[]>(() => loadMemosFromStorage() ?? [])
  const [newMemo, setNewMemo] = useState('')
  useEffect(() => { saveMemosToStorage(memos) }, [memos])

  // 아코디언 상태
  const [accordionState, setAccordionState] = useState<Record<string, boolean>>(() => loadAccordionState())
  const toggleAccordion = useCallback((id: string) => {
    setAccordionState(prev => {
      const next = { ...prev, [id]: !(prev[id] ?? true) }
      saveAccordionState(next)
      return next
    })
  }, [])

  // 시킨 일 인라인 폼
  const [addingTask, setAddingTask] = useState(false)
  const [taskContent, setTaskContent] = useState('')
  const [taskAssigneeId, setTaskAssigneeId] = useState('')
  const [taskDeadline, setTaskDeadline] = useState('')

  // 브리핑 아이템 reason 토글
  const [expandedBriefingIds, setExpandedBriefingIds] = useState<Set<string>>(new Set())

  // 담당자 변경 시 localStorage 저장
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (currentStaffId) localStorage.setItem(STAFF_STORAGE_KEY, currentStaffId)
  }, [currentStaffId])

  // staff 목록 로드
  useEffect(() => {
    supabase.from('staff').select('id, name').order('name').then(({ data }) => {
      if (data) setStaffList(data as Staff[])
    })
  }, [])

  // A/S 미처리 건수 로드
  useEffect(() => {
    supabase
      .from('as_records')
      .select('id, status')
      .neq('status', '완료')
      .then(({ data, error }) => {
        if (!error && data) setAsRecords(data as ASRecord[])
      })
  }, [])

  // 전체 일정 로드 (미니 캘린더용)
  useEffect(() => {
    const now = new Date()
    const firstISO = dateStr(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const lastISO = dateStr(now.getFullYear(), now.getMonth(), lastDay)

    supabase
      .from('schedules')
      .select('id, staff_id, schedule_type, title, start_date, end_date, confirmed, project_id')
      .gte('end_date', firstISO)
      .lte('start_date', lastISO)
      .then(({ data, error }) => {
        if (!error && data) setAllSchedules(data as Schedule[])
      })
  }, [])

  // 내 일정 로드 (schedules + tasks)
  const loadMyWork = useCallback(async () => {
    if (!currentStaffId) {
      setMySchedules([]); setMyTasksReceived([]); setMyTasksAssigned([])
      return
    }

    // 1) 내 schedules (담당자=나, 아직 안 지난 일정)
    const sRes = await supabase.from('schedules').select('*')
      .neq('schedule_type', 'site')
      .eq('staff_id', currentStaffId)
      .gte('end_date', today)
      .order('start_date')
    if (!sRes.error) setMySchedules((sRes.data as Schedule[]) || [])

    // 2) 내가 받은 tasks (assigned_to = 나, 미완료)
    const rRes = await supabase.from('tasks').select('*')
      .eq('assigned_to', currentStaffId)
      .eq('done', false)
      .order('deadline', { ascending: true, nullsFirst: false })
    if (rRes.error) {
      if (rRes.error.code === '42P01' || /does not exist|relation/.test(rRes.error.message)) {
        setTasksTableMissing(true)
      }
      setMyTasksReceived([])
    } else {
      setTasksTableMissing(false)
      setMyTasksReceived((rRes.data as Task[]) || [])
    }

    // 3) 내가 시킨 tasks (assigned_by = 나, 미완료)
    const aRes = await supabase.from('tasks').select('*')
      .eq('assigned_by', currentStaffId)
      .eq('done', false)
      .order('deadline', { ascending: true, nullsFirst: false })
    if (!aRes.error) setMyTasksAssigned((aRes.data as Task[]) || [])
  }, [today, currentStaffId])

  // 브리핑 API 호출
  const loadBriefing = useCallback(async () => {
    if (!currentStaffId) return
    setBriefingLoading(true)
    try {
      const res = await fetch(`/api/dashboard/briefing?staff_id=${currentStaffId}`)
      if (res.ok) {
        const data = (await res.json()) as BriefingResponse
        setBriefing(data)
      }
    } catch { /* */ }
    setBriefingLoading(false)
  }, [currentStaffId])

  useEffect(() => { loadMyWork(); loadBriefing() }, [loadMyWork, loadBriefing])

  const getStaffName = (id: string | null) => !id ? '' : staffList.find(s => s.id === id)?.name || ''

  // --- 내 할 일 통합: schedules + 받은 tasks ---
  const todoItems: TodoItem[] = useMemo(() => {
    const fromSchedules: TodoItem[] = mySchedules.map(s => ({
      id: `sch-${s.id}`,
      source: 'schedule',
      title: s.title,
      date: s.start_date,
      href: s.project_id ? `/register/${s.project_id}` : '/calendar/work',
      projectId: s.project_id,
      assignerName: null,
      scheduleType: s.schedule_type,
      rawId: s.id,
    }))
    const fromTasks: TodoItem[] = myTasksReceived.map(t => ({
      id: `task-${t.id}`,
      source: 'task',
      title: t.content,
      date: t.deadline,
      href: t.project_id ? `/register/${t.project_id}` : '/dashboard',
      projectId: t.project_id,
      assignerName: getStaffName(t.assigned_by),
      rawId: t.id,
    }))
    return [...fromSchedules, ...fromTasks].sort((a, b) => {
      const aKey = a.date ?? '9999-99-99'
      const bKey = b.date ?? '9999-99-99'
      return aKey.localeCompare(bKey)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySchedules, myTasksReceived, staffList])

  // 메모장 CRUD
  const addMemo = () => {
    if (!newMemo.trim()) return
    setMemos(p => [{ id: Date.now().toString(), content: newMemo.trim(), pinned: false }, ...p])
    setNewMemo('')
  }
  const togglePin = (id: string) => setMemos(p => p.map(m => m.id === id ? { ...m, pinned: !m.pinned } : m))
  const deleteMemo = (id: string) => setMemos(p => p.filter(m => m.id !== id))
  const sortedMemos = [...memos].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))

  // 시킨 일 CRUD
  const assignableStaff = staffList.filter(s => s.id !== currentStaffId)
  const addAssignedTask = async () => {
    if (!currentStaffId || !taskContent.trim() || !taskAssigneeId) return
    const { error } = await supabase.from('tasks').insert({
      content: taskContent.trim(),
      assigned_to: taskAssigneeId,
      assigned_by: currentStaffId,
      deadline: taskDeadline || null,
      done: false,
    })
    if (!error) {
      setTaskContent(''); setTaskAssigneeId(''); setTaskDeadline(''); setAddingTask(false)
      loadMyWork()
    }
  }
  const toggleAssignedDone = async (taskId: string, done: boolean) => {
    await supabase.from('tasks').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', taskId)
    loadMyWork()
  }
  const deleteAssignedTask = async (taskId: string) => {
    await supabase.from('tasks').delete().eq('id', taskId)
    loadMyWork()
  }
  const completeReceivedTask = async (taskId: string) => {
    await supabase.from('tasks').update({ done: true, done_at: new Date().toISOString() }).eq('id', taskId)
    loadMyWork()
  }

  // 브리핑 reason 토글
  const toggleBriefingReason = (id: string) => {
    setExpandedBriefingIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // --- 첫 방문 모달 ---
  const showFirstVisitModal = !currentStaffId && staffList.length > 0

  return (
    <>
      {showFirstVisitModal && (
        <FirstVisitModal options={staffList} onSelect={setCurrentStaffId} />
      )}

      <div className="min-h-screen bg-page">
        <div className="max-w-[600px] md:max-w-[1200px] mx-auto px-4 py-6 space-y-3">

          {/* ===== 인사 헤더 ===== */}
          <div className="mb-2">
            <h1 className="text-[24px] font-bold text-txt-primary leading-tight">
              {getGreeting()}
            </h1>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[14px] text-txt-tertiary">
                {new Date().toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                })}
              </p>
              {currentStaffId && (
                <select
                  value={currentStaffId}
                  onChange={e => setCurrentStaffId(e.target.value)}
                  className="text-[12px] text-txt-secondary bg-transparent border-none outline-none cursor-pointer"
                >
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* ===== 할일 ===== */}
          <AccordionSection
            id="todo"
            title="할일"
            count={todoItems.length}
            dotColor="bg-[#2563eb]"
            defaultOpen={true}
            accordionState={accordionState}
            onToggle={toggleAccordion}
          >
            {!currentStaffId ? (
              <p className="text-[13px] text-txt-quaternary text-center py-4">
                이름을 선택해주세요
              </p>
            ) : todoItems.length === 0 ? (
              <p className="text-[13px] text-txt-quaternary text-center py-4">
                할 일 없음
              </p>
            ) : (
              <div className="space-y-0.5">
                {todoItems.slice(0, 10).map(t => {
                  const bd = badgeInfo(t.date)
                  const color = t.source === 'task'
                    ? TODO_TYPE_COLORS.task
                    : TODO_TYPE_COLORS[t.scheduleType || ''] || '#3B82F6'
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 py-2 group"
                    >
                      {t.source === 'task' ? (
                        <button
                          onClick={() => completeReceivedTask(t.rawId)}
                          className="w-5 h-5 rounded border border-border-primary flex items-center justify-center shrink-0 text-txt-tertiary hover:text-[#059669] hover:border-[#059669] transition-colors"
                        >
                          <Check size={12} />
                        </button>
                      ) : (
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        </div>
                      )}
                      <Link
                        href={t.href}
                        className="flex-1 min-w-0 text-[14px] text-txt-primary truncate"
                      >
                        {t.title}
                        {t.assignerName && (
                          <span className="text-[12px] text-txt-tertiary ml-1.5">
                            -- {t.assignerName}
                          </span>
                        )}
                      </Link>
                      <span className={`text-[12px] tabular-nums shrink-0 ${bd.color}`}>
                        {bd.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </AccordionSection>

          {/* ===== 시킨 일 ===== */}
          <AccordionSection
            id="assigned"
            title="시킨 일"
            count={myTasksAssigned.length}
            dotColor="bg-[#059669]"
            defaultOpen={true}
            accordionState={accordionState}
            onToggle={toggleAccordion}
          >
            {tasksTableMissing ? (
              <div className="text-center py-4 text-[12px] text-txt-quaternary leading-relaxed">
                <p className="font-medium text-txt-tertiary mb-1">DB 준비 필요</p>
                <p>Supabase SQL Editor에서</p>
                <code className="inline-block px-1 py-0.5 bg-surface-tertiary rounded text-[11px] my-0.5">
                  sql/migration_tasks.sql
                </code>
                <p>한 번 실행해주세요.</p>
              </div>
            ) : !currentStaffId ? (
              <p className="text-[13px] text-txt-quaternary text-center py-4">
                이름을 선택해주세요
              </p>
            ) : (
              <>
                {/* 추가 버튼 */}
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => setAddingTask(v => !v)}
                    className="flex items-center gap-1 text-[12px] text-link hover:underline"
                  >
                    <Plus size={14} /> 지시하기
                  </button>
                </div>

                {/* 인라인 추가 폼 */}
                {addingTask && (
                  <div className="mb-3 p-3 bg-surface-tertiary rounded-lg space-y-2">
                    <input
                      value={taskContent}
                      onChange={e => setTaskContent(e.target.value)}
                      placeholder="내용 (예: 수원 견적서 뽑아오기)"
                      className="w-full text-[13px] border border-border-primary rounded-lg px-3 py-2 bg-surface text-txt-primary placeholder:text-txt-tertiary focus:ring-1 focus:ring-accent focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <select
                        value={taskAssigneeId}
                        onChange={e => setTaskAssigneeId(e.target.value)}
                        className="flex-1 text-[13px] border border-border-primary rounded-lg px-2 py-1.5 bg-surface"
                      >
                        <option value="">수행자 선택</option>
                        {assignableStaff.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={taskDeadline}
                        onChange={e => setTaskDeadline(e.target.value)}
                        className="text-[13px] border border-border-primary rounded-lg px-2 py-1.5 bg-surface"
                      />
                    </div>
                    <button
                      onClick={addAssignedTask}
                      disabled={!taskContent.trim() || !taskAssigneeId}
                      className="w-full py-2 text-[13px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:bg-txt-quaternary disabled:cursor-not-allowed transition-colors"
                    >
                      등록
                    </button>
                  </div>
                )}

                {myTasksAssigned.length === 0 ? (
                  <p className="text-[13px] text-txt-quaternary text-center py-3">
                    시킨 일 없음
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {myTasksAssigned.slice(0, 8).map(t => {
                      const bd = badgeInfo(t.deadline)
                      return (
                        <div
                          key={t.id}
                          className="flex items-center gap-2 py-2 group"
                        >
                          <button
                            onClick={() => toggleAssignedDone(t.id, !t.done)}
                            className="w-5 h-5 rounded border border-border-primary flex items-center justify-center shrink-0 text-txt-tertiary hover:text-[#059669] hover:border-[#059669] transition-colors"
                          >
                            <Check size={12} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] text-txt-primary truncate">{t.content}</p>
                            <p className="text-[12px] text-txt-tertiary flex items-center gap-1">
                              <Send size={10} />
                              {getStaffName(t.assigned_to)}
                            </p>
                          </div>
                          <span className={`text-[12px] tabular-nums shrink-0 ${bd.color}`}>
                            {bd.label}
                          </span>
                          <button
                            onClick={() => deleteAssignedTask(t.id)}
                            className="opacity-0 group-hover:opacity-100 shrink-0 text-txt-quaternary hover:text-[#dc2626] transition-opacity"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </AccordionSection>

          {/* ===== AI 브리핑 ===== */}
          <AccordionSection
            id="briefing"
            title="AI 브리핑"
            count={briefing?.items.length}
            dotColor="bg-[#8B5CF6]"
            defaultOpen={true}
            accordionState={accordionState}
            onToggle={toggleAccordion}
          >
            {briefingLoading ? (
              <p className="text-[13px] text-txt-quaternary text-center py-4">
                분석 중...
              </p>
            ) : !briefing || briefing.items.length === 0 ? (
              <p className="text-[13px] text-txt-quaternary text-center py-4">
                {briefing?.summary || '브리핑 항목 없음'}
              </p>
            ) : (
              <div className="space-y-3">
                {briefing.summary && (
                  <p className="text-[13px] text-txt-secondary leading-snug pb-1">
                    {briefing.summary}
                  </p>
                )}
                {BRIEFING_CATEGORIES.map(cat => {
                  const catItems = briefing.items.filter(i => i.category === cat.key)
                  if (catItems.length === 0) return null
                  return (
                    <div key={cat.key}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={cat.color}>{cat.icon}</span>
                        <span className="text-[12px] font-semibold text-txt-secondary">{cat.label}</span>
                        <span className="text-[11px] text-txt-tertiary">({catItems.length})</span>
                      </div>
                      <div className="space-y-1">
                        {catItems.slice(0, 5).map(item => {
                          const style = BRIEFING_BAR_STYLES[item.category] ?? BRIEFING_BAR_STYLES.week
                          const showReason = expandedBriefingIds.has(item.id)
                          const inner = (
                            <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg transition-colors ${style.bg}`}>
                              <div className={`w-1 self-stretch rounded-full shrink-0 ${style.bar}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-txt-primary leading-snug">
                                  {item.title}
                                </p>
                                {showReason && (
                                  <p className="mt-1.5 text-[12px] text-txt-tertiary leading-relaxed border-l border-border-tertiary pl-2">
                                    {item.reason}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={e => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  toggleBriefingReason(item.id)
                                }}
                                className="shrink-0 mt-0.5 text-txt-quaternary hover:text-txt-secondary"
                              >
                                <HelpCircle size={14} />
                              </button>
                              {item.actionHref && (
                                <ArrowRight size={14} className="shrink-0 mt-0.5 text-txt-quaternary" />
                              )}
                            </div>
                          )
                          return item.actionHref ? (
                            <Link key={item.id} href={item.actionHref} className="block">
                              {inner}
                            </Link>
                          ) : (
                            <div key={item.id}>{inner}</div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </AccordionSection>

          {/* ===== 내 메모 ===== */}
          <AccordionSection
            id="memo"
            title="내 메모"
            count={memos.length}
            dotColor="bg-[#d97706]"
            defaultOpen={true}
            accordionState={accordionState}
            onToggle={toggleAccordion}
          >
            <div className="flex gap-2 mb-2">
              <input
                value={newMemo}
                onChange={e => setNewMemo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addMemo()}
                placeholder="메모 입력..."
                className="flex-1 text-[14px] border border-border-primary rounded-lg px-3 py-2 focus:ring-1 focus:ring-accent focus:outline-none bg-surface text-txt-primary placeholder:text-txt-tertiary"
              />
              <button
                onClick={addMemo}
                className="px-3 py-2 text-[13px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover shrink-0 transition-colors"
              >
                추가
              </button>
            </div>
            {sortedMemos.length === 0 ? (
              <p className="text-[13px] text-txt-quaternary text-center py-3">메모 없음</p>
            ) : (
              <div className="space-y-0.5">
                {sortedMemos.map(m => (
                  <div
                    key={m.id}
                    className={`flex items-start gap-2 px-2 py-2 rounded-lg group ${
                      m.pinned ? 'bg-[#ffedd5]/30' : 'hover:bg-surface-tertiary'
                    }`}
                  >
                    <button
                      onClick={() => togglePin(m.id)}
                      className={`mt-0.5 shrink-0 ${m.pinned ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                    >
                      <Pin size={14} className={m.pinned ? 'text-[#d97706]' : 'text-txt-quaternary'} />
                    </button>
                    <span className="text-[14px] text-txt-secondary flex-1 leading-snug">
                      {m.content}
                    </span>
                    <button
                      onClick={() => deleteMemo(m.id)}
                      className="opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 text-txt-quaternary hover:text-[#dc2626] transition-opacity"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </AccordionSection>

          {/* ===== A/S 미처리 ===== */}
          <AccordionSection
            id="as"
            title="A/S 미처리"
            count={asRecords.length}
            dotColor="bg-[#dc2626]"
            defaultOpen={false}
            accordionState={accordionState}
            onToggle={toggleAccordion}
          >
            {asRecords.length === 0 ? (
              <p className="text-[13px] text-txt-quaternary text-center py-3">
                미처리 A/S 없음
              </p>
            ) : (
              <Link
                href="/as"
                className="flex items-center justify-between py-2 text-[14px] text-txt-primary hover:text-accent transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Wrench size={14} className="text-txt-tertiary" />
                  미처리 A/S {asRecords.length}건
                </span>
                <ArrowRight size={14} className="text-txt-tertiary" />
              </Link>
            )}
          </AccordionSection>

          {/* ===== 미니 캘린더 ===== */}
          <MiniCalendar schedules={allSchedules} />

        </div>
      </div>
    </>
  )
}
