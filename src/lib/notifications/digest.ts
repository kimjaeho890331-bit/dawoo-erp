// ============================================
// 알림 묶음 메시지 빌더
// ============================================
// 원칙:
// - 빈 내용이면 null 반환 (발송 스킵)
// - 기존 runAllRules 재사용
// - 텔레그램 Markdown 형식

import { createClient } from '@supabase/supabase-js'
import { runAllRules, type ProjectLite, type ScheduleLite, type StaffLite } from '@/lib/dashboard/priorityRules'
import { gridFromAddress } from '@/lib/weather/cityGrid'
import { fetchCurrentWeather } from '@/lib/weather/kma'
import type { BriefingItem, Task } from '@/types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// --- 날짜 헬퍼 ---
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10)
}
function dayNameKo(iso: string) {
  const d = new Date(iso)
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
}
function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}(${dayNameKo(iso)})`
}

export interface DigestContext {
  staff: { id: string; name: string }
  projects: ProjectLite[]
  schedules: ScheduleLite[]
  tasks: Task[]
  staffList: StaffLite[]
}

/**
 * 공통 데이터 로드 — staff 기준으로 모든 컨텍스트 조회
 * 각 빌더가 이걸 재사용
 */
async function loadContext(staffId: string): Promise<DigestContext | null> {
  const [staffRes, projectsRes, schedulesRes, tasksRes, staffListRes] = await Promise.all([
    supabaseAdmin.from('staff').select('id, name').eq('id', staffId).single(),
    supabaseAdmin
      .from('projects')
      .select('id, building_name, owner_name, owner_phone, road_address, jibun_address, staff_id, status, survey_date, survey_time, consent_time, application_date, completion_doc_date, outstanding, updated_at')
      .neq('status', '취소'),
    supabaseAdmin
      .from('schedules')
      .select('id, project_id, staff_id, schedule_type, title, start_date, end_date, memo')
      .neq('schedule_type', 'site')
      .gte('end_date', addDays(todayISO(), -1)),
    supabaseAdmin.from('tasks').select('*').eq('done', false),
    supabaseAdmin.from('staff').select('id, name'),
  ])
  if (staffRes.error || !staffRes.data) return null
  return {
    staff: staffRes.data,
    projects: (projectsRes.data || []) as ProjectLite[],
    schedules: (schedulesRes.data || []) as ScheduleLite[],
    tasks: tasksRes.error ? [] : ((tasksRes.data || []) as Task[]),
    staffList: (staffListRes.data || []) as StaffLite[],
  }
}

// --- 날씨 조회 (본사 주소 기준) ---
async function fetchMorningWeather(): Promise<string> {
  const grid = gridFromAddress('경기도 수원시')  // 본사
  const result = await fetchCurrentWeather(grid.nx, grid.ny)
  return result?.raw || ''
}

// ============================================
// 1. 오전 브리핑 (08:30)
// ============================================
export async function buildMorningBrief(staffId: string): Promise<string | null> {
  const ctx = await loadContext(staffId)
  if (!ctx) return null
  const today = todayISO()

  const items = runAllRules({
    projects: ctx.projects,
    schedules: ctx.schedules,
    tasks: ctx.tasks,
    staffList: ctx.staffList,
    staffFilter: staffId,
  })

  // 오늘 일정 (본인 담당)
  const todaySchedules = ctx.schedules
    .filter(s => s.staff_id === staffId || (s as ScheduleLite & { staff_ids?: string[] }).staff_ids?.includes(staffId))
    .filter(s => s.start_date <= today && s.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))

  // 받은 업무 (내가 받은, 미완료)
  const receivedTasks = ctx.tasks.filter(t => t.assigned_to === staffId && !t.done)

  // 오늘 마감 (프로젝트 방치된 것들 중 나 담당)
  const myTodayDeadline = items.filter(i => i.category === 'today' && i.projectId)

  // AI 긴급 (🔴 지금 당장)
  const urgent = items.filter(i => i.category === 'now')

  // 날씨
  const weather = await fetchMorningWeather()

  // 아무것도 없으면 스킵
  const totalCount = todaySchedules.length + receivedTasks.length + myTodayDeadline.length + urgent.length
  if (totalCount === 0 && !weather) return null

  const lines: string[] = []
  lines.push(`🌅 *${ctx.staff.name}님, ${formatDate(today)} 오전 브리핑*`)
  lines.push('')

  if (todaySchedules.length > 0) {
    lines.push(`📅 *오늘 일정* (${todaySchedules.length}건)`)
    todaySchedules.slice(0, 5).forEach(s => lines.push(`• ${s.title}`))
    lines.push('')
  }

  if (receivedTasks.length > 0) {
    lines.push(`📥 *받은 업무* (${receivedTasks.length}건)`)
    receivedTasks.slice(0, 5).forEach(t => {
      const assigner = ctx.staffList.find(s => s.id === t.assigned_by)?.name || ''
      const deadline = t.deadline ? ` (${t.deadline})` : ''
      lines.push(`• ${t.content}${assigner ? ` — ${assigner}` : ''}${deadline}`)
    })
    lines.push('')
  }

  if (myTodayDeadline.length > 0) {
    lines.push(`⚠️ *오늘 마감* (${myTodayDeadline.length}건)`)
    myTodayDeadline.slice(0, 5).forEach(i => lines.push(`• ${i.title}`))
    lines.push('')
  }

  if (urgent.length > 0) {
    lines.push(`🔴 *AI 긴급* (${urgent.length}건)`)
    urgent.slice(0, 5).forEach(i => lines.push(`• ${i.title}`))
    lines.push('')
  }

  if (weather) {
    lines.push(`🌤 날씨: ${weather}`)
    lines.push('')
  }

  if (totalCount === 0) {
    lines.push('오늘 한가합니다. 여유 있는 하루 되세요 ☕')
  }

  return lines.join('\n').trim()
}

// ============================================
// 2. 오후 재알림 (15:00, 조건부)
// 오늘 아직 안 끝난 것만, 없으면 null
// ============================================
export async function buildAfternoonRemind(staffId: string): Promise<string | null> {
  const ctx = await loadContext(staffId)
  if (!ctx) return null

  // 아직 안 끝난 오늘 마감 = 내가 받은 오늘 마감 tasks + 오늘 미완료 스케줄
  const today = todayISO()
  const pendingTasks = ctx.tasks.filter(t =>
    t.assigned_to === staffId && !t.done && t.deadline === today
  )

  const items = runAllRules({
    projects: ctx.projects,
    schedules: ctx.schedules,
    tasks: ctx.tasks,
    staffList: ctx.staffList,
    staffFilter: staffId,
  })
  const stillNow = items.filter(i => i.category === 'now' || i.category === 'today').slice(0, 5)

  if (pendingTasks.length === 0 && stillNow.length === 0) return null  // 스킵

  const lines: string[] = []
  lines.push(`📌 *${ctx.staff.name}님, 오후 확인*`)
  lines.push('')
  if (pendingTasks.length > 0) {
    lines.push(`*오늘 마감 남음 ${pendingTasks.length}건*`)
    pendingTasks.forEach(t => lines.push(`• ${t.content}`))
    lines.push('')
  }
  if (stillNow.length > 0) {
    lines.push(`*아직 처리 필요*`)
    stillNow.forEach(i => lines.push(`• ${i.title}`))
  }
  return lines.join('\n').trim()
}

// ============================================
// 3. 저녁 정리 (18:00, 매일)
// 내일 예고 + 오늘 미완료
// ============================================
export async function buildEveningRecap(staffId: string): Promise<string | null> {
  const ctx = await loadContext(staffId)
  if (!ctx) return null

  const tomorrow = addDays(todayISO(), 1)

  // 내일 일정
  const tomorrowSchedules = ctx.schedules
    .filter(s => s.staff_id === staffId || (s as ScheduleLite & { staff_ids?: string[] }).staff_ids?.includes(staffId))
    .filter(s => s.start_date <= tomorrow && s.end_date >= tomorrow)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))

  // 내일 마감 업무
  const tomorrowTasks = ctx.tasks.filter(t =>
    t.assigned_to === staffId && !t.done && t.deadline === tomorrow
  )

  // 아무것도 없으면 간단 메시지만
  const totalCount = tomorrowSchedules.length + tomorrowTasks.length
  if (totalCount === 0) {
    return `🌙 *${ctx.staff.name}님, 내일 ${formatDate(tomorrow)}*\n\n예정된 일정/업무 없습니다. 좋은 저녁 보내세요.`
  }

  const lines: string[] = []
  lines.push(`🌙 *${ctx.staff.name}님, 내일 ${formatDate(tomorrow)} 미리보기*`)
  lines.push('')

  if (tomorrowSchedules.length > 0) {
    lines.push(`📅 *내일 일정* (${tomorrowSchedules.length}건)`)
    tomorrowSchedules.forEach(s => lines.push(`• ${s.title}`))
    lines.push('')
  }

  if (tomorrowTasks.length > 0) {
    lines.push(`📥 *내일 마감 업무* (${tomorrowTasks.length}건)`)
    tomorrowTasks.forEach(t => lines.push(`• ${t.content}`))
    lines.push('')
  }

  lines.push(`좋은 저녁 보내세요 🌙`)
  return lines.join('\n').trim()
}

// ============================================
// 4. 일정 30분 전 (즉시)
// ============================================
export async function buildScheduleImminent(scheduleId: string): Promise<{ staffId: string; message: string } | null> {
  const { data: sched } = await supabaseAdmin
    .from('schedules')
    .select('*')
    .eq('id', scheduleId)
    .single()
  if (!sched || !sched.staff_id) return null

  const { data: staff } = await supabaseAdmin
    .from('staff').select('id, name').eq('id', sched.staff_id).single()
  if (!staff) return null

  let projectInfo = ''
  if (sched.project_id) {
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('road_address, jibun_address, owner_name, owner_phone')
      .eq('id', sched.project_id).single()
    if (project) {
      if (project.owner_name) projectInfo += `\n👤 ${project.owner_name}`
      if (project.owner_phone) projectInfo += `\n📞 ${project.owner_phone}`
      if (project.road_address || project.jibun_address) {
        projectInfo += `\n📍 ${project.road_address || project.jibun_address}`
      }
    }
  }

  const message = `🔔 *곧 시작: ${sched.title}*${projectInfo}\n\n30분 후 시작 예정입니다.`
  return { staffId: staff.id, message }
}

// ============================================
// 5. 현장 긴급 (수동 발동)
// ============================================
export function buildSiteUrgent(siteName: string, issue: string, reporter: string): string {
  return `🚨 *현장 긴급: ${siteName}*\n\n${issue}\n\n— ${reporter}`
}
