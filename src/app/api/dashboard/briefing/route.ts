import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'
import { runAllRules, buildSummary, type ProjectLite, type ScheduleLite, type StaffLite } from '@/lib/dashboard/priorityRules'
import type { BriefingResponse, Task } from '@/types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/dashboard/briefing?staff_id=xxx
// staff_id 생략 = 전체
export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const staffFilter = request.nextUrl.searchParams.get('staff_id') || null

  // 병렬로 4개 쿼리 (단일 round trip)
  // 주의: 실제 DB에 consent_date 컬럼이 없음 → consent_time 으로 대체 감지
  // tasks 테이블이 아직 없을 수 있으므로 에러 시 빈 배열로 처리
  const [projectsRes, schedulesRes, staffRes, tasksRes] = await Promise.all([
    supabaseAdmin
      .from('projects')
      .select(
        'id, building_name, owner_name, owner_phone, road_address, jibun_address, staff_id, status, survey_date, survey_time, consent_time, application_date, completion_doc_date, outstanding, updated_at'
      )
      .neq('status', '취소'),
    supabaseAdmin
      .from('schedules')
      .select('id, project_id, staff_id, schedule_type, title, start_date, end_date, memo')
      .neq('schedule_type', 'site')
      .gte('end_date', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
    supabaseAdmin.from('staff').select('id, name'),
    supabaseAdmin.from('tasks').select('*').eq('done', false),
  ])

  if (projectsRes.error || schedulesRes.error || staffRes.error) {
    return Response.json(
      {
        error: '데이터 조회 실패',
        detail: projectsRes.error?.message || schedulesRes.error?.message || staffRes.error?.message,
      },
      { status: 500 },
    )
  }

  const projects = (projectsRes.data || []) as ProjectLite[]
  const schedules = (schedulesRes.data || []) as ScheduleLite[]
  const staffList = (staffRes.data || []) as StaffLite[]
  // tasks 테이블 없으면 빈 배열 (graceful degrade)
  const tasks = tasksRes.error ? [] : ((tasksRes.data || []) as Task[])

  const items = runAllRules({ projects, schedules, tasks, staffList, staffFilter })

  // 미수금은 "정보성"으로만 집계 (경고 아님)
  const filteredProjects = staffFilter
    ? projects.filter(p => p.staff_id === staffFilter)
    : projects
  const outstandingProjects = filteredProjects.filter(p => (p.outstanding || 0) > 0)
  const info = {
    outstandingCount: outstandingProjects.length,
    outstandingTotal: outstandingProjects.reduce((sum, p) => sum + (p.outstanding || 0), 0),
    todayScheduleCount: items.filter(i => i.category === 'now' && i.rule === 'today_schedule_imminent').length,
  }

  const response: BriefingResponse = {
    generatedAt: new Date().toISOString(),
    staffId: staffFilter,
    summary: buildSummary(items, info),
    items,
    info,
  }
  return Response.json(response)
}
