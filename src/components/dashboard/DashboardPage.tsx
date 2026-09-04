'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { isDashboardAiGated } from '@/lib/uiHidden'
import { ChevronDown, ListTodo, ClipboardList, Brain, Building2, FileCheck2 } from 'lucide-react'
import { currentTurnLine } from '@/lib/approval/status'
import type { LineRole, LineState } from '@/types/approval'
import AIBriefingCard from './AIBriefingCard'
import MyTodoCard, { type TodoItem } from './MyTodoCard'
import AssignedTasksCard from './AssignedTasksCard'
import FirstVisitModal from './FirstVisitModal'
import SitesTimeline from './SitesTimeline'
import TaskDetailModal from './TaskDetailModal'
import WeeklyIntakeCard from './WeeklyIntakeCard'
import FunnelCard from './FunnelCard'
import type { BriefingResponse, Task, WeeklyReport } from '@/types'

// 월요일 00:00(로컬) 기준 주 시작 — 주간 보고서 캐시 키용
function weekKeyLocal(d: Date): string {
  const x = new Date(d)
  const day = x.getDay()
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day))
  x.setHours(0, 0, 0, 0)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

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

const STAFF_STORAGE_KEY = 'dawoo_current_staff_id'

// currentTurnLine이 요구하는 필드 전부(seq/staff_id/role/state)를 조회해야 한다.
interface LineForTurn {
  seq: number
  staff_id: string
  role: LineRole
  state: LineState
}

const dashboardAiHidden = isDashboardAiGated()

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
  const [briefingLoading, setBriefingLoading] = useState(!dashboardAiHidden)
  const [mySchedules, setMySchedules] = useState<Schedule[]>([])
  const [myTasksReceived, setMyTasksReceived] = useState<Task[]>([])  // 내가 받은 일
  const [myTasksAssigned, setMyTasksAssigned] = useState<Task[]>([])  // 내가 시킨 일
  const [tasksTableMissing, setTasksTableMissing] = useState(false)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)

  // 주간 보고서 (월요일 기준 지난주 vs 지지난주) — 주 단위 sessionStorage 캐시
  const isMonday = now.getDay() === 1
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(() => {
    if (dashboardAiHidden) return null
    if (typeof window === 'undefined') return null
    try {
      const c = sessionStorage.getItem(`dawoo_weekly_report_${weekKeyLocal(new Date())}`)
      return c ? (JSON.parse(c) as WeeklyReport) : null
    } catch { return null }
  })
  useEffect(() => {
    if (dashboardAiHidden || weeklyReport) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/ai/weekly-report')
        if (!res.ok) return
        const data = (await res.json()) as WeeklyReport
        if (cancelled) return
        setWeeklyReport(data)
        try { sessionStorage.setItem(`dawoo_weekly_report_${weekKeyLocal(new Date())}`, JSON.stringify(data)) } catch { /* */ }
      } catch { /* */ }
    })()
    return () => { cancelled = true }
  }, [weeklyReport])

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

  // 결재할 문서 건수 — ApprovalPage의 "결재전"과 같은 기준: 문서가 pending이고
  // 내 앞 순번이 전부 처리돼 지금이 내 차례인 것만 센다(내가 결재선에 있기만
  // 한 것은 세지 않는다. 두 화면 숫자가 다르면 사용자가 혼란스럽다).
  const [approvalCount, setApprovalCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!currentStaffId) { if (!cancelled) setApprovalCount(0); return }

      const { data: myLines } = await supabase
        .from('expense_report_lines')
        .select('report_id')
        .eq('staff_id', currentStaffId)

      const ids = Array.from(new Set((myLines ?? []).map(l => l.report_id as string)))
      if (ids.length === 0) { if (!cancelled) setApprovalCount(0); return }

      const { data } = await supabase
        .from('expense_reports')
        .select('id, lines:expense_report_lines(seq, staff_id, role, state)')
        .in('id', ids)
        .eq('status', 'pending')

      if (cancelled) return
      const withLines = (data ?? []) as unknown as { id: string; lines: LineForTurn[] }[]
      const count = withLines.filter(r => {
        const turn = currentTurnLine(r.lines)
        return turn !== null && turn.staff_id === currentStaffId
      }).length
      setApprovalCount(count)
    })()
    return () => { cancelled = true }
  }, [currentStaffId])

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

  // 브리핑 API 호출 — AI 서술/액션 포함(/api/ai/briefing). 같은 날 재방문은 sessionStorage 캐시(Claude 재호출 절감)
  const loadBriefing = useCallback(async (force = false) => {
    if (dashboardAiHidden) { setBriefingLoading(false); return }
    if (!currentStaffId) { setBriefingLoading(false); return }  // 직원 미선택/로드실패 시 무한 로딩 방지
    const cacheKey = `dawoo_briefing_${currentStaffId}_${today}`
    if (!force) {
      try {
        const cached = sessionStorage.getItem(cacheKey)
        if (cached) { setBriefing(JSON.parse(cached) as BriefingResponse); setBriefingLoading(false); return }
      } catch { /* */ }
    }
    setBriefingLoading(true)
    try {
      const res = await fetch(`/api/ai/briefing?staff_id=${currentStaffId}`)
      if (res.ok) {
        const data = (await res.json()) as BriefingResponse
        setBriefing(data)
        try { sessionStorage.setItem(cacheKey, JSON.stringify(data)) } catch { /* */ }
      }
    } catch { /* */ }
    setBriefingLoading(false)
  }, [currentStaffId, today])

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
            {greeting}{!dashboardAiHidden && `, ${briefing?.summary ?? '분석 준비 중...'}`}
          </p>
        </div>

        {/* 메인 그리드 — 좌: 접수 퍼널 + 주간 접수 현황 / 우: 결재 + 할 일 */}
        <div className="grid grid-cols-[1.6fr_1fr] gap-4 items-start">
          <div className="flex flex-col gap-4">
            <FunnelCard />
            <WeeklyIntakeCard />
          </div>
          <div className="flex flex-col gap-4">
            <Link href="/approval"
              className="bg-surface border border-border-primary rounded-[10px] px-4 py-3 flex items-center justify-between hover:bg-surface-secondary transition-colors">
              <div className="flex items-center gap-2">
                <FileCheck2 size={16} className="text-txt-tertiary" />
                <span className="text-[13px] text-txt-secondary">결재할 문서</span>
              </div>
              <span className="text-lg font-semibold text-txt-primary">{approvalCount}건</span>
            </Link>
            {!dashboardAiHidden && (
              <AIBriefingCard items={briefing?.items ?? []} summary={briefing?.summary ?? ''} narrative={briefing?.narrative} actions={briefing?.assistantActions} loading={briefingLoading} onRefresh={() => loadBriefing(true)} weeklyReport={weeklyReport} weeklyOpenDefault={isMonday} />
            )}
            <MyTodoCard todos={todoItems} staffSelected={!!currentStaffId} tasksTableMissing={tasksTableMissing} onCompleteTask={completeReceivedTask} onAdd={addMyTask} onOpenDetail={setDetailTaskId} />
            <AssignedTasksCard tasks={myTasksAssigned} staffList={staffList} currentStaffId={currentStaffId} staffSelected={!!currentStaffId} tableMissing={tasksTableMissing} onAdd={addAssignedTask} onToggleDone={toggleAssignedDone} onDelete={deleteAssignedTask} onOpenDetail={setDetailTaskId} getStaffName={getStaffName} />
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
            {greeting}{!dashboardAiHidden && `, ${briefing?.summary ?? '분석 준비 중...'}`}
          </p>
        </div>

        {/* 결재할 문서 */}
        <Link href="/approval"
          className="bg-surface border border-border-primary rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck2 size={16} className="text-txt-tertiary" />
            <span className="text-[13px] text-txt-secondary">결재할 문서</span>
          </div>
          <span className="text-base font-semibold text-txt-primary">{approvalCount}건</span>
        </Link>

        {/* 접수 퍼널 + 주간 접수 현황 (항상 노출) */}
        <FunnelCard />
        <WeeklyIntakeCard />

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
        {!dashboardAiHidden && (
          <MobileAccordion
            title="AI 브리핑"
            icon={<Brain size={16} />}
            open={!!mobileOpen.briefing}
            onToggle={() => toggleMobile('briefing')}
            accentColor="#8B5CF6"
          >
            <AIBriefingCard items={briefing?.items ?? []} summary={briefing?.summary ?? ''} narrative={briefing?.narrative} actions={briefing?.assistantActions} loading={briefingLoading} onRefresh={() => loadBriefing(true)} weeklyReport={weeklyReport} weeklyOpenDefault={isMonday} />
          </MobileAccordion>
        )}

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
