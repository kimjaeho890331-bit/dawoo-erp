import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'

export const maxDuration = 10

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * POST /api/certificate/request
 * ERP 상세모달 [건축물대장 발급] 버튼 → cowork_tasks 큐에 pending task 생성
 * body: { project_id, cert_types?: string[] }  (cert_types 기본: ['표제부','전유부'])
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })

  try {
    const body = await request.json()
    const projectId = body.project_id as string | undefined
    const certTypes = (body.cert_types as string[] | undefined) || ['표제부', '전유부']
    if (!projectId) return Response.json({ error: 'project_id 필수' }, { status: 400 })

    // 프로젝트 정보 조회 → payload 구성
    const { data: project, error: pErr } = await supabaseAdmin
      .from('projects')
      .select('id, building_name, road_address, jibun_address, dong, ho')
      .eq('id', projectId)
      .single()
    if (pErr || !project) return Response.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 })
    if (!project.road_address && !project.jibun_address) {
      return Response.json({ error: '주소가 입력되지 않은 프로젝트입니다' }, { status: 400 })
    }

    // 진행중(pending/processing) 같은 task 중복 방지
    const { data: existing } = await supabaseAdmin
      .from('cowork_tasks')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('task_type', 'issue_certificate')
      .in('status', ['pending', 'processing'])
      .limit(1)
    if (existing && existing.length > 0) {
      return Response.json({
        error: '이미 진행중인 발급 요청이 있습니다',
        existing_task_id: existing[0].id,
        existing_status: existing[0].status,
      }, { status: 409 })
    }

    // 요청자 staff id (Supabase auth user.email → staff 매핑)
    let requestedBy: string | null = null
    if (user.email) {
      const { data: staff } = await supabaseAdmin
        .from('staff')
        .select('id')
        .eq('email', user.email)
        .single()
      requestedBy = staff?.id || null
    }

    // task INSERT
    const { data: task, error: iErr } = await supabaseAdmin
      .from('cowork_tasks')
      .insert({
        project_id: projectId,
        task_type: 'issue_certificate',
        payload: {
          building_name: project.building_name,
          road_address: project.road_address,
          jibun_address: project.jibun_address,
          dong: project.dong,
          ho: project.ho,
          cert_types: certTypes,
        },
        status: 'pending',
        requested_by: requestedBy,
      })
      .select('id, status, created_at')
      .single()
    if (iErr) throw iErr

    return Response.json({ success: true, task })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Certificate Request] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
