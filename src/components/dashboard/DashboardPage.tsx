'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Pin, X, ChevronDown, ListTodo, ClipboardList, Brain, StickyNote, Building2 } from 'lucide-react'
import AIBriefingCard from './AIBriefingCard'
import MyTodoCard, { type TodoItem } from './MyTodoCard'
import AssignedTasksCard from './AssignedTasksCard'
import FirstVisitModal from './FirstVisitModal'
import SitesTimeline from './SitesTimeline'
import TaskDetailModal from './TaskDetailModal'
import type { BriefingResponse, Task } from '@/types'

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

const MEMO_STORAGE_KEY = 'dawoo_dashboard_memos'
const STAFF_STORAGE_KEY = 'dawoo_current_staff_id'

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

export default function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10)
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']
  const now = new Date()
  const todayLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 (${dayNames[now.getDay()]})`

  const [staffList, setStaffList] = useState<Staff[]>([])
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(STAFF_STORAGE_KEY)
  })
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(true)
  const [mySchedules, setMySchedules] = useState<Schedule[]>([])
  const [myTasksReceived, setMyTasksReceived] = useState<Task[]>([])  // 내가 받은 일
  const [myTasksAssigned, setMyTasksAssigned] = useState<Task[]>([])  // 내가 시킨 일
  const [tasksTableMissing, setTasksTableMissing] = useState(false)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)

  // 메모장
  const [memos, setMemos] = useState<Memo[]>(() => loadMemosFromStorage() ?? [])
  const [newMemo, setNewMemo] = useState('')
  useEffect(() => { saveMemosToStorage(memos) }, [memos])

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
      href: s.project_id ? `/register/small?project=${s.project_id}` : '/calendar/work',
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
      href: t.project_id ? `/register/small?project=${t.project_id}` : '/dashboard',
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

  // 메모장
  const addMemo = () => {
    if (!newMemo.trim()) return
    setMemos(p => [{ id: Date.now().toString(), content: newMemo.trim(), pinned: false }, ...p])
    setNewMemo('')
  }
  const togglePin = (id: string) => setMemos(p => p.map(m => m.id === id ? { ...m, pinned: !m.pinned } : m))
  const deleteMemo = (id: string) => setMemos(p => p.filter(m => m.id !== id))
  const sortedMemos = [...memos].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))

  // 시킨 일 CRUD
  const addAssignedTask = async (content: string, assigneeId: string, deadline: string | null) => {
    if (!currentStaffId) return
    const { error } = await supabase.from('tasks').insert({
      content, assigned_to: assigneeId, assigned_by: currentStaffId, deadline, done: false,
    })
    if (!error) loadMyWork()
  }
  // 내 할 일 직접 등록 (assigned_to = assigned_by = 본인)
  const addMyTask = async (content: string, deadline: string | null) => {
    if (!currentStaffId) return
    const { error } = await supabase.from('tasks').insert({
      content, assigned_to: currentStaffId, assigned_by: currentStaffId, deadline, done: false,
    })
    if (!error) loadMyWork()
  }
  // 모달용 저장/삭제/완료
  const saveTask = async (id: string, patch: Partial<Task>) => {
    await supabase.from('tasks').update(patch).eq('id', id)
    loadMyWork()
  }
  const deleteTask = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id)
    loadMyWork()
  }
  const completeTask = async (id: string) => {
    await supabase.from('tasks').update({ done: true, done_at: new Date().toISOString() }).eq('id', id)
    loadMyWork()
  }
  const toggleAssignedDone = async (taskId: string, done: boolean) => {
    await supabase.from('tasks').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', taskId)
    loadMyWork()
  }
  const deleteAssignedTask = async (taskId: string) => {
    await supabase.from('tasks').delete().eq('id', taskId)
    loadMyWork()
  }
  // 내가 받은 task 완료 처리 (내 할 일 카드에서)
  const completeReceivedTask = async (taskId: string) => {
    await supabase.from('tasks').update({ done: true, done_at: new Date().toISOString() }).eq('id', taskId)
    loadMyWork()
  }

  // --- 첫 방문 모달 ---
  const showFirstVisitModal = !currentStaffId && staffList.length > 0
  const handleFirstSelect = (id: string) => {
    setCurrentStaffId(id)
  }

  const currentStaffName = currentStaffId ? getStaffName(currentStaffId) : ''
  const greeting = currentStaffName ? `${currentStaffName}님` : '안녕하세요'

  // 모바일 아코디언 상태
  const [mobileOpen, setMobileOpen] = useState<Record<string, boolean>>({ todo: true })
  const toggleMobile = (key: string) => setMobileOpen(p => ({ ...p, [key]: !p[key] }))

  // --- 메모장 공통 JSX ---
  const memoContent = (
    <>
      <div className="flex gap-1.5 mb-2 px-1">
        <input value={newMemo} onChange={e => setNewMemo(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMemo()}
          placeholder="메모 입력..." className="flex-1 text-[13px] border border-border-primary rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-accent focus:outline-none bg-surface text-txt-primary placeholder:text-txt-tertiary" />
        <button onClick={addMemo} className="px-2.5 py-1.5 text-[13px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover shrink-0">추가</button>
      </div>
      {sortedMemos.length === 0 ? (
        <div className="text-center py-6 text-txt-quaternary text-[13px]">메모 없음</div>
      ) : (
        sortedMemos.map(m => (
          <div key={m.id} className={`flex items-start gap-1.5 px-2.5 py-2 rounded-lg group ${m.pinned ? 'bg-[#ffedd5]/30' : 'hover:bg-surface-tertiary'}`}>
            <button onClick={() => togglePin(m.id)} className={`mt-0.5 shrink-0 ${m.pinned ? '' : 'opacity-0 group-hover:opacity-100'}`}>
              <Pin size={16} className={m.pinned ? 'text-[#d97706]' : 'text-txt-quaternary'} />
            </button>
            <span className="text-[13px] text-txt-secondary flex-1 leading-snug">{m.content}</span>
            <button onClick={() => deleteMemo(m.id)} className="opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 text-txt-quaternary hover:text-[#dc2626]">
              <X size={14} />
            </button>
          </div>
        ))
      )}
    </>
  )

  return (
    <>
      {showFirstVisitModal && (
        <FirstVisitModal options={staffList} onSelect={handleFirstSelect} />
      )}

      {/* ===== PC 레이아웃 (md 이상) — 기존 그대로 ===== */}
      <div className="hidden md:block p-6 max-w-[1200px] mx-auto space-y-4 bg-page min-h-screen">
        {/* 헤더 */}
        <div className="bg-surface rounded-[10px] border border-border-primary px-6 py-5 border-l-4 border-l-accent">
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">{todayLabel}</h1>
          <p className="text-[13px] text-txt-secondary mt-0.5">
            {greeting}, {briefing?.summary ?? '분석 준비 중...'}
          </p>
        </div>

        {/* 메인 그리드 */}
        <div className="grid grid-cols-5 gap-4 items-stretch min-h-[640px]">
          <div className="col-span-2 flex flex-col gap-4">
            <MyTodoCard todos={todoItems} staffSelected={!!currentStaffId} tasksTableMissing={tasksTableMissing} onCompleteTask={completeReceivedTask} onAdd={addMyTask} onOpenDetail={setDetailTaskId} />
            <AssignedTasksCard tasks={myTasksAssigned} staffList={staffList} currentStaffId={currentStaffId} staffSelected={!!currentStaffId} tableMissing={tasksTableMissing} onAdd={addAssignedTask} onToggleDone={toggleAssignedDone} onDelete={deleteAssignedTask} onOpenDetail={setDetailTaskId} getStaffName={getStaffName} />
            <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden flex flex-col flex-1 min-h-0">
              <div className="px-5 py-3.5 border-b border-border-tertiary">
                <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">메모장</h2>
              </div>
              <div className="px-4 py-3 flex-1 overflow-y-auto">{memoContent}</div>
            </div>
          </div>
          <div className="col-span-3">
            <AIBriefingCard items={briefing?.items ?? []} summary={briefing?.summary ?? ''} loading={briefingLoading} />
          </div>
        </div>
        <SitesTimeline />
      </div>

      {/* ===== 모바일 레이아웃 (md 미만) — 아코디언 ===== */}
      <div className="md:hidden px-4 py-4 space-y-2.5 bg-page min-h-screen">
        {/* 헤더 */}
        <div className="bg-surface rounded-xl border border-border-primary px-4 py-4 border-l-4 border-l-accent">
          <h1 className="text-[18px] font-semibold tracking-[-0.3px] text-txt-primary">{todayLabel}</h1>
          <p className="text-[12px] text-txt-secondary mt-0.5 line-clamp-2">
            {greeting}, {briefing?.summary ?? '분석 준비 중...'}
          </p>
        </div>

        {/* 내 할 일 */}
        <MobileAccordion
          title="내 할 일"
          icon={<ListTodo size={16} />}
          badge={todoItems.length}
          open={!!mobileOpen.todo}
          onToggle={() => toggleMobile('todo')}
          accentColor="#3B82F6"
        >
          <MyTodoCard todos={todoItems} staffSelected={!!currentStaffId} tasksTableMissing={tasksTableMissing} onCompleteTask={completeReceivedTask} onAdd={addMyTask} onOpenDetail={setDetailTaskId} />
        </MobileAccordion>

        {/* 시킨 일 */}
        <MobileAccordion
          title="시킨 일"
          icon={<ClipboardList size={16} />}
          badge={myTasksAssigned.length}
          open={!!mobileOpen.assigned}
          onToggle={() => toggleMobile('assigned')}
          accentColor="#F59E0B"
        >
          <AssignedTasksCard tasks={myTasksAssigned} staffList={staffList} currentStaffId={currentStaffId} staffSelected={!!currentStaffId} tableMissing={tasksTableMissing} onAdd={addAssignedTask} onToggleDone={toggleAssignedDone} onDelete={deleteAssignedTask} onOpenDetail={setDetailTaskId} getStaffName={getStaffName} />
        </MobileAccordion>

        {/* AI 브리핑 */}
        <MobileAccordion
          title="AI 브리핑"
          icon={<Brain size={16} />}
          open={!!mobileOpen.briefing}
          onToggle={() => toggleMobile('briefing')}
          accentColor="#8B5CF6"
        >
          <AIBriefingCard items={briefing?.items ?? []} summary={briefing?.summary ?? ''} loading={briefingLoading} />
        </MobileAccordion>

        {/* 메모장 */}
        <MobileAccordion
          title="메모장"
          icon={<StickyNote size={16} />}
          badge={memos.length}
          open={!!mobileOpen.memo}
          onToggle={() => toggleMobile('memo')}
          accentColor="#10B981"
        >
          <div className="px-3 py-2">{memoContent}</div>
        </MobileAccordion>

        {/* 현장 스케줄 */}
        <MobileAccordion
          title="현장 스케줄"
          icon={<Building2 size={16} />}
          open={!!mobileOpen.sites}
          onToggle={() => toggleMobile('sites')}
          accentColor="#06B6D4"
        >
          <SitesTimeline />
        </MobileAccordion>
      </div>

      {(() => {
        const detailTask = detailTaskId
          ? [...myTasksReceived, ...myTasksAssigned].find(t => t.id === detailTaskId)
          : null
        if (!detailTask) return null
        const isSelf =
          detailTask.assigned_to === currentStaffId &&
          detailTask.assigned_by === currentStaffId
        const mode: 'received' | 'assigned' | 'self' = isSelf
          ? 'self'
          : detailTask.assigned_by === currentStaffId
          ? 'assigned'
          : 'received'
        return (
          <TaskDetailModal
            task={detailTask}
            staffList={staffList}
            mode={mode}
            getStaffName={getStaffName}
            onClose={() => setDetailTaskId(null)}
            onSave={(patch) => saveTask(detailTask.id, patch)}
            onDelete={() => deleteTask(detailTask.id)}
            onComplete={() => completeTask(detailTask.id)}
          />
        )
      })()}
    </>
  )
}

// ===== 모바일 아코디언 컴포넌트 =====
function MobileAccordion({ title, icon, badge, open, onToggle, accentColor, children }: {
  title: string
  icon: React.ReactNode
  badge?: number
  open: boolean
  onToggle: () => void
  accentColor: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface rounded-xl border border-border-primary overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-3 active:bg-surface-secondary transition-colors"
      >
        <span className="shrink-0" style={{ color: accentColor }}>{icon}</span>
        <span className="text-[14px] font-semibold text-txt-primary flex-1 text-left">{title}</span>
        {badge !== undefined && badge > 0 && (
          <span
            className="text-[11px] font-bold text-white rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5"
            style={{ backgroundColor: accentColor }}
          >
            {badge}
          </span>
        )}
        <ChevronDown
          size={16}
          className={`text-txt-tertiary transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-border-tertiary">
          {children}
        </div>
      )}
    </div>
  )
}
