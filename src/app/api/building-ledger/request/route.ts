import { NextRequest } from 'next/server'
import { admin, requireApiUser } from '@/lib/buildingLedger/admin'
import { buildRequestInsert, canQueueProject, isUuid } from '@/lib/buildingLedger/status'

/**
 * POST /api/building-ledger/request
 * 직원이 빌라를 대기열에 넣는다. requested_by는 화면에서 고른 직원.
 */
export async function POST(request: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof Response) return user

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }

  const { project_id, staff_id } = (body ?? {}) as { project_id?: unknown; staff_id?: unknown }
  if (typeof project_id !== 'string' || !isUuid(project_id)) {
    return Response.json({ error: '유효하지 않은 프로젝트입니다' }, { status: 400 })
  }
  if (typeof staff_id !== 'string' || !isUuid(staff_id)) {
    return Response.json({ error: '직원을 선택해 주세요' }, { status: 400 })
  }

  const { data: staff } = await admin.from('staff').select('id').eq('id', staff_id).maybeSingle()
  if (!staff) {
    return Response.json({ error: '등록되지 않은 직원입니다' }, { status: 403 })
  }

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, road_address, jibun_address')
    .eq('id', project_id)
    .maybeSingle()

  if (projectError) {
    return Response.json({ error: `접수 조회 실패: ${projectError.message}` }, { status: 500 })
  }
  if (!project) {
    return Response.json({ error: '접수 건을 찾을 수 없습니다' }, { status: 404 })
  }

  const { data: openRows, error: openError } = await admin
    .from('building_ledger_requests')
    .select('status')
    .eq('project_id', project_id)
    .in('status', ['requested', 'issued'])

  if (openError) {
    return Response.json({ error: `대기열 조회 실패: ${openError.message}` }, { status: 500 })
  }
  if (!canQueueProject((openRows ?? []).map(r => r.status as string))) {
    return Response.json({ error: '이미 신청된 빌라입니다' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { data: created, error } = await admin
    .from('building_ledger_requests')
    .insert(buildRequestInsert(project, staff_id, now))
    .select('id')
    .single()

  if (error?.code === '23505') {
    return Response.json({ error: '이미 신청된 빌라입니다' }, { status: 409 })
  }
  if (error || !created) {
    return Response.json({ error: `신청 실패: ${error?.message ?? '알 수 없는 오류'}` }, { status: 500 })
  }

  return Response.json({ ok: true, id: created.id })
}
