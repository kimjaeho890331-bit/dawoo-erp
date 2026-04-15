// ============================================
// 대시보드 AI 브리핑 — 룰 기반 우선순위 감지
// ============================================
// 원칙:
// - 룰 함수는 순수 함수 (입력 → 출력, 사이드 이펙트 없음)
// - 각 함수는 BriefingItem[] 반환
// - 미수금 경고 카드는 만들지 않음 (관공서 일은 떼일 걱정 없음)

import type { BriefingItem, ProjectStatus, Task } from '@/types'

// --- 입력 데이터 타입 ---
// 주의: 실제 DB에 consent_date 컬럼이 없음. consent_time 존재 여부로 동의서 수령 판정.
export interface ProjectLite {
  id: string
  building_name: string | null
  owner_name: string | null
  owner_phone: string | null
  road_address: string | null
  jibun_address: string | null
  staff_id: string | null
  status: ProjectStatus | string
  survey_date: string | null
  survey_time: string | null
  consent_time: string | null
  application_date: string | null
  completion_doc_date: string | null
  outstanding: number
  updated_at: string
}

export interface ScheduleLite {
  id: string
  project_id: string | null
  staff_id: string | null
  schedule_type: string
  title: string
  start_date: string
  end_date: string
  memo: string | null
}

export interface StaffLite {
  id: string
  name: string
}

// --- 날짜 헬퍼 ---
const todayISO = () => new Date().toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
const daysAgo = (iso: string) => daysBetween(iso.slice(0, 10), todayISO())

const formatShortAddress = (road: string | null, jibun: string | null) => {
  const addr = road || jibun || ''
  // "경기도 수원시 팔달구 인계동 123-45" → "수원 인계동"
  const parts = addr.split(/\s+/).filter(Boolean)
  if (parts.length < 3) return addr
  const city = parts[1]?.replace(/시$|군$|구$/, '') ?? ''
  const dong = parts.find((p, i) => i >= 2 && /동$|읍$|면$|리$/.test(p)) ?? parts[2]
  return `${city} ${dong}`.trim()
}

// ============================================
// 룰 1: 오늘 예정 일정 (🔴 지금 당장)
// ============================================
export function ruleTodaySchedules(
  schedules: ScheduleLite[],
  projects: ProjectLite[],
  staffList: StaffLite[]
): BriefingItem[] {
  const today = todayISO()
  const items: BriefingItem[] = []
  const projectMap = new Map(projects.map(p => [p.id, p]))
  const staffMap = new Map(staffList.map(s => [s.id, s.name]))

  for (const s of schedules) {
    if (s.start_date > today || s.end_date < today) continue
    if (s.schedule_type === 'site') continue

    const project = s.project_id ? projectMap.get(s.project_id) : null
    const staffName = s.staff_id ? staffMap.get(s.staff_id) || '' : ''
    const shortAddr = project ? formatShortAddress(project.road_address, project.jibun_address) : ''
    const owner = project?.owner_name || ''
    const phone = project?.owner_phone || ''

    const titleParts = [s.title]
    if (shortAddr) titleParts.push(shortAddr)
    if (owner) titleParts.push(owner + '님댁')

    items.push({
      id: `today_schedule_imminent:${s.id}`,
      category: 'now',
      rule: 'today_schedule_imminent',
      priority: 1,
      title: titleParts.join(' · '),
      reason: `오늘(${today}) 예정 일정${phone ? ` · 연락처 ${phone}` : ''}${staffName ? ` · 담당 ${staffName}` : ''}`,
      actionHref: project ? `/register/${project.id}` : '/calendar/work',
      actionLabel: project ? '접수 상세' : '캘린더 열기',
      projectId: project?.id ?? null,
      scheduleId: s.id,
      meta: {
        phone: phone || null,
        address: shortAddr || null,
        staff: staffName || null,
      },
    })
  }
  return items
}

// ============================================
// 룰 2: 동의서 누락 (🔴 지금 당장)
// 신청서 단계까지 왔는데 consent_time NULL (DB에 consent_date 없어서 time으로 판정)
// ============================================
export function ruleConsentMissing(projects: ProjectLite[]): BriefingItem[] {
  const AFTER_CONSENT = new Set(['신청서제출', '승인', '착공계', '공사', '완료서류제출', '입금'])
  return projects
    .filter(p => AFTER_CONSENT.has(p.status) && !p.consent_time)
    .map(p => ({
      id: `consent_missing:${p.id}`,
      category: 'now' as const,
      rule: 'consent_missing' as const,
      priority: 2,
      title: `${p.building_name || '(건물명 없음)'} — 동의서 없이 ${p.status} 진행 중`,
      reason: `1단계 필수 서류인 동의서가 비어 있습니다. 현재 단계: ${p.status}`,
      actionHref: `/register/${p.id}`,
      actionLabel: '동의서 입력',
      projectId: p.id,
      scheduleId: null,
    }))
}

// ============================================
// 룰 3: 신청서 제출 누락 (🔴 지금 당장)
// 승인 이상 단계인데 application_date NULL
// ============================================
export function ruleApplicationMissing(projects: ProjectLite[]): BriefingItem[] {
  const AFTER_APP = new Set(['승인', '착공계', '공사', '완료서류제출', '입금'])
  return projects
    .filter(p => AFTER_APP.has(p.status) && !p.application_date)
    .map(p => ({
      id: `application_missing:${p.id}`,
      category: 'now' as const,
      rule: 'application_missing' as const,
      priority: 3,
      title: `${p.building_name || '(건물명 없음)'} — 신청서 제출일 미입력`,
      reason: `현재 단계 ${p.status}인데 application_date가 비어 있습니다.`,
      actionHref: `/register/${p.id}`,
      actionLabel: '신청서 입력',
      projectId: p.id,
      scheduleId: null,
    }))
}

// ============================================
// 룰 4: 실측 시간 미입력 (🟡 오늘 안에)
// survey_date는 있는데 survey_time NULL
// ============================================
export function ruleSurveyTimeMissing(projects: ProjectLite[]): BriefingItem[] {
  return projects
    .filter(p => p.survey_date && !p.survey_time)
    .map(p => ({
      id: `survey_time_missing:${p.id}`,
      category: 'today' as const,
      rule: 'survey_time_missing' as const,
      priority: 1,
      title: `${p.building_name || '(건물명 없음)'} — 실측 ${p.survey_date} 시간 미입력`,
      reason: `실측일은 정해졌는데 시간(survey_time)이 없습니다. 현장 방문 전 시간 확정 필요.`,
      actionHref: `/register/${p.id}`,
      actionLabel: '시간 입력',
      projectId: p.id,
      scheduleId: null,
    }))
}

// ============================================
// 룰 5: 접수 진행 방치 (🟡 오늘 안에)
// 진행 중인데 updated_at 3일 이상 전
// ============================================
export function ruleApplicationStale(projects: ProjectLite[]): BriefingItem[] {
  const ACTIVE = new Set(['실사', '견적전달', '동의서', '신청서제출'])
  return projects
    .filter(p => ACTIVE.has(p.status))
    .filter(p => daysAgo(p.updated_at) >= 3)
    .map(p => ({
      id: `application_stale:${p.id}`,
      category: 'today' as const,
      rule: 'application_stale' as const,
      priority: 2,
      title: `${p.building_name || '(건물명 없음)'} — ${p.status} 단계에서 ${daysAgo(p.updated_at)}일째 정체`,
      reason: `최근 수정일(updated_at) 기준 ${daysAgo(p.updated_at)}일 동안 변화 없음. 진행 상황 확인 필요.`,
      actionHref: `/register/${p.id}`,
      actionLabel: '상태 확인',
      projectId: p.id,
      scheduleId: null,
    }))
}

// ============================================
// 룰 6: 완료서류 미제출 (🟡 오늘 안에)
// 공사 완료된 지 5일 이상인데 completion_doc_date NULL
// ============================================
export function ruleCompletionDocStale(projects: ProjectLite[]): BriefingItem[] {
  return projects
    .filter(p => p.status === '완료서류제출' && !p.completion_doc_date)
    .filter(p => daysAgo(p.updated_at) >= 5)
    .map(p => ({
      id: `completion_doc_stale:${p.id}`,
      category: 'today' as const,
      rule: 'completion_doc_stale' as const,
      priority: 3,
      title: `${p.building_name || '(건물명 없음)'} — 완료서류 ${daysAgo(p.updated_at)}일째 미제출`,
      reason: `status='완료서류제출'이지만 completion_doc_date 비어있고 ${daysAgo(p.updated_at)}일째 방치.`,
      actionHref: `/register/${p.id}`,
      actionLabel: '완료서류 입력',
      projectId: p.id,
      scheduleId: null,
    }))
}

// ============================================
// 룰 7: 시킨 일 마감 지남 (🟡 오늘 안에)
// tasks 테이블에서 assigned_by = 나인 건 중 마감 지났고 미완료
// ============================================
export function ruleAssignedTaskOverdue(
  tasks: Task[],
  staffList: StaffLite[],
  staffFilter: string | null
): BriefingItem[] {
  if (!staffFilter) return []
  const today = todayISO()
  const staffMap = new Map(staffList.map(s => [s.id, s.name]))
  return tasks
    .filter(t => t.assigned_by === staffFilter)
    .filter(t => !t.done)
    .filter(t => t.deadline && t.deadline < today)
    .map(t => ({
      id: `assigned_task_overdue:${t.id}`,
      category: 'today' as const,
      rule: 'application_stale' as const, // 기존 rule key 재사용 (시킨 일 지연)
      priority: 5,
      title: `${staffMap.get(t.assigned_to || '') || '담당자'}에게 시킨 일 — "${t.content.slice(0, 30)}" 마감 ${daysBetween(t.deadline || today, today)}일 지남`,
      reason: `내가 ${t.deadline}까지 지시한 일이 아직 완료되지 않았습니다. 상대방 확인 필요.`,
      actionHref: `/dashboard`,
      actionLabel: '확인',
      projectId: null,
      scheduleId: null,
    }))
}

// ============================================
// 룰 8: 입금 예상 요약 (🟢 이번 주 · 정보성)
// 경고가 아니라 "얼마 들어올 예정" 정보만 제공
// ============================================
export function rulePaymentIncomingInfo(projects: ProjectLite[]): BriefingItem[] {
  const withOutstanding = projects.filter(p => (p.outstanding || 0) > 0)
  if (withOutstanding.length === 0) return []
  const total = withOutstanding.reduce((sum, p) => sum + (p.outstanding || 0), 0)
  return [{
    id: 'payment_incoming_info:summary',
    category: 'week',
    rule: 'payment_incoming_info',
    priority: 2,
    title: `입금 예상 ${withOutstanding.length}건 · ${total.toLocaleString()}원`,
    reason: '정보성: 시공 완료 후 입금 대기 중인 건수와 총액입니다. 경고가 아닌 참고용.',
    actionHref: '/register/small',
    actionLabel: '접수대장',
    projectId: null,
    scheduleId: null,
  }]
}

// ============================================
// 룰 9: 단계 전환 가능 (🟢 이번 주 · 제안)
// 필수 필드 다 채워졌는데 status 변경 안 된 건 감지
// ============================================
export function ruleStageUpgradeable(projects: ProjectLite[]): BriefingItem[] {
  // 간단 판정: 현재 단계별로 필수 필드 체크
  const candidates: BriefingItem[] = []
  for (const p of projects) {
    let canUpgrade = false
    let nextStage = ''
    if (p.status === '실사' && p.survey_date) {
      canUpgrade = true; nextStage = '견적전달'
    } else if (p.status === '동의서' && p.consent_time) {
      canUpgrade = true; nextStage = '신청서제출'
    } else if (p.status === '신청서제출' && p.application_date) {
      canUpgrade = true; nextStage = '승인'
    }
    if (canUpgrade) {
      candidates.push({
        id: `stage_upgradeable:${p.id}`,
        category: 'week',
        rule: 'stage_upgradeable',
        priority: 1,
        title: `${p.building_name || '(건물명 없음)'} — 다음 단계(${nextStage})로 전환 가능`,
        reason: `${p.status} 단계 필수 필드가 모두 채워졌습니다. 수동으로 단계를 올려주세요.`,
        actionHref: `/register/${p.id}`,
        actionLabel: '단계 전환',
        projectId: p.id,
        scheduleId: null,
      })
    }
  }
  return candidates.slice(0, 3)
}

// ============================================
// 메인: 모든 룰 실행 → 단일 BriefingItem[]
// ============================================
export function runAllRules(input: {
  projects: ProjectLite[]
  schedules: ScheduleLite[]
  tasks: Task[]
  staffList: StaffLite[]
  staffFilter: string | null // null = 전체
}): BriefingItem[] {
  const { staffFilter } = input
  const filteredProjects = staffFilter
    ? input.projects.filter(p => p.staff_id === staffFilter)
    : input.projects
  const filteredSchedules = staffFilter
    ? input.schedules.filter(s => s.staff_id === staffFilter)
    : input.schedules

  const items: BriefingItem[] = [
    ...ruleTodaySchedules(filteredSchedules, filteredProjects, input.staffList),
    ...ruleConsentMissing(filteredProjects),
    ...ruleApplicationMissing(filteredProjects),
    ...ruleSurveyTimeMissing(filteredProjects),
    ...ruleApplicationStale(filteredProjects),
    ...ruleCompletionDocStale(filteredProjects),
    ...ruleAssignedTaskOverdue(input.tasks, input.staffList, staffFilter),
    ...ruleStageUpgradeable(filteredProjects),
    ...rulePaymentIncomingInfo(filteredProjects),
  ]

  // 카테고리 내부에서 priority 오름차순으로 정렬
  const order: Record<string, number> = { now: 0, today: 1, week: 2 }
  items.sort((a, b) => {
    const cat = (order[a.category] ?? 99) - (order[b.category] ?? 99)
    if (cat !== 0) return cat
    return a.priority - b.priority
  })
  return items
}

// ============================================
// 상단 요약 한 줄 생성 (룰 기반, Claude 없이)
// ============================================
export function buildSummary(
  items: BriefingItem[],
  info: { outstandingCount: number; outstandingTotal: number; todayScheduleCount: number }
): string {
  const now = items.filter(i => i.category === 'now').length
  const today = items.filter(i => i.category === 'today').length
  const week = items.filter(i => i.category === 'week').length
  const parts: string[] = []
  if (now > 0) parts.push(`지금 ${now}건`)
  if (today > 0) parts.push(`오늘 ${today}건`)
  if (week > 0) parts.push(`이번 주 ${week}건`)
  if (parts.length === 0) return '챙길 일 없음. 여유 있는 하루!'
  return `챙길 일 ${parts.join(' · ')}`
}
