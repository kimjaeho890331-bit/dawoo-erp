import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'
import { runAllRules, buildSummary, type ProjectLite, type ScheduleLite, type StaffLite } from '@/lib/dashboard/priorityRules'
import type { BriefingResponse, BriefingItem, BriefingAction, Task } from '@/types'

export const maxDuration = 30

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// 룰 기반 브리핑(/api/dashboard/briefing) 위에 AI 서술 + "오늘 챙길 일" 액션을 얹는다.
// AI는 상황을 자연어로 브리핑하고, AI 비서가 바로 처리할 질문(query)을 제안.
// 미수금/잔액 독촉 금지 — 시스템 프롬프트로 강제.
export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })

  const staffFilter = request.nextUrl.searchParams.get('staff_id') || null

  // 데이터 수집 (dashboard/briefing과 동일한 쿼리)
  const [projectsRes, schedulesRes, staffRes, tasksRes] = await Promise.all([
    supabaseAdmin.from('projects')
      .select('id, building_name, owner_name, owner_phone, road_address, jibun_address, staff_id, status, survey_date, survey_time, consent_time, application_date, completion_doc_date, outstanding, updated_at')
      .neq('status', '취소'),
    supabaseAdmin.from('schedules')
      .select('id, project_id, staff_id, schedule_type, title, start_date, end_date, memo')
      .neq('schedule_type', 'site')
      .gte('end_date', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
    supabaseAdmin.from('staff').select('id, name'),
    supabaseAdmin.from('tasks').select('*').eq('done', false),
  ])

  if (projectsRes.error || schedulesRes.error || staffRes.error) {
    return Response.json({ error: '데이터 조회 실패', detail: projectsRes.error?.message || schedulesRes.error?.message || staffRes.error?.message }, { status: 500 })
  }

  const projects = (projectsRes.data || []) as ProjectLite[]
  const schedules = (schedulesRes.data || []) as ScheduleLite[]
  const staffList = (staffRes.data || []) as StaffLite[]
  const tasks = tasksRes.error ? [] : ((tasksRes.data || []) as Task[])

  const items = runAllRules({ projects, schedules, tasks, staffList, staffFilter })
  const filteredProjects = staffFilter ? projects.filter(p => p.staff_id === staffFilter) : projects
  const outstandingProjects = filteredProjects.filter(p => (p.outstanding || 0) > 0)
  const info = {
    outstandingCount: outstandingProjects.length,
    outstandingTotal: outstandingProjects.reduce((s, p) => s + (p.outstanding || 0), 0),
    todayScheduleCount: items.filter(i => i.category === 'now' && i.rule === 'today_schedule_imminent').length,
  }
  const summary = buildSummary(items, info)

  // 현재 사용자 이름
  let staffName = ''
  if (staffFilter) staffName = staffList.find(s => s.id === staffFilter)?.name || ''

  // AI 서술 + 액션 생성 (실패해도 룰 기반 요약으로 graceful)
  let narrative: string | undefined
  let assistantActions: BriefingAction[] | undefined
  try {
    const ai = await generateNarrative(items, info, staffName)
    if (ai) { narrative = ai.narrative; assistantActions = ai.assistantActions }
  } catch { /* graceful — 룰 요약 유지 */ }

  const response: BriefingResponse = {
    generatedAt: new Date().toISOString(),
    staffId: staffFilter,
    summary,
    narrative,
    assistantActions,
    items,
    info,
  }
  return Response.json(response)
}

const NOW = ['일', '월', '화', '수', '목', '금', '토']
const SYSTEM = `당신은 다우건설(정부 지원 수도/소규모 공사 접수~수금 ERP)의 AI 비서입니다.
대표·직원에게 오늘 업무 상황을 브리핑합니다.

[브리핑 규칙]
- narrative: 2~3문장. 따뜻하고 간결하게, 사람이 "오늘 뭐부터 챙길지" 바로 감 잡게.
- 사실 기반. 과장·평가·감탄사 남발 금지. 항목 수와 핵심만.
- 미수금·잔액은 독촉/경고 금지. 굳이 언급하지 말 것 (관공서 일이라 회수는 정상 절차).
- 챙길 일이 없으면 여유롭다고 담백하게.

[assistantActions] (0~3개)
- 지금/오늘 챙기면 좋은 일을 'AI 비서에게 보낼 질문(query)' 형태로.
- query는 비서가 도구로 처리 가능한 형태: 조회/정리/일정 등. (예: "동의서 안 받은 접수 알려줘", "오늘 일정 정리해줘")
- label은 8자 내외 짧게.

반드시 아래 JSON만 출력(설명/코드펜스 금지):
{"narrative":"...","assistantActions":[{"label":"...","query":"..."}]}`

async function generateNarrative(
  items: BriefingItem[], info: { outstandingCount: number; outstandingTotal: number; todayScheduleCount: number }, staffName: string,
): Promise<{ narrative: string; assistantActions: BriefingAction[] } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const d = new Date()
  const dateStr = `${d.getMonth() + 1}월 ${d.getDate()}일 (${NOW[d.getDay()]})`
  const byCat = { now: items.filter(i => i.category === 'now'), today: items.filter(i => i.category === 'today'), week: items.filter(i => i.category === 'week') }
  const list = (arr: BriefingItem[]) => arr.slice(0, 8).map(i => `· ${i.title}`).join('\n') || '· 없음'
  const digest = `오늘: ${dateStr}${staffName ? ` / 사용자: ${staffName}` : ' / 전체 팀'}
[지금 챙길 일 ${byCat.now.length}]
${list(byCat.now)}
[오늘 챙길 일 ${byCat.today.length}]
${list(byCat.today)}
[이번 주 예고 ${byCat.week.length}]
${list(byCat.week)}
(참고·언급금지) 미수금 ${info.outstandingCount}건`

  // 12초 타임아웃 — 느리거나 콜드한 Claude가 룰 기반 브리핑 노출을 과도하게 지연시키지 않게 (초과 시 abort→catch→룰 요약 폴백)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 600, system: SYSTEM, messages: [{ role: 'user', content: digest }] }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) return null
  const result = await res.json()
  const text = (result.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('').trim()
  const jsonStr = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  let parsed: { narrative?: string; assistantActions?: BriefingAction[] }
  try { parsed = JSON.parse(jsonStr) } catch { return null }
  if (!parsed.narrative) return null
  const actions = Array.isArray(parsed.assistantActions)
    ? parsed.assistantActions.filter(a => a && a.label && a.query).slice(0, 3)
    : []
  return { narrative: parsed.narrative, assistantActions: actions }
}
