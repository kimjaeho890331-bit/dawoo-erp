import { NextRequest } from 'next/server'
import { admin, requireApiUser } from '@/lib/buildingLedger/admin'
import { buildRequestInsert, isUuid } from '@/lib/buildingLedger/status'

const RETURN_FIELDS =
  'id, project_id, status, address_used, drive_file_url, requested_at, issued_at, confirmed_at, requested_by, confirmed_by'

/**
 * POST /api/building-ledger/request
 * 직원이 빌라를 대기열에 넣는다. 중복은 unique index(23505)로 막는다.
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

  const [staffRes, projectRes] = await Promise.all([
    admin.from('staff').select('id').eq('id', staff_id).maybeSingle(),
    admin
      .from('projects')
      .select('id, building_name, owner_name, owner_phone, tenant_phone, road_address, jibun_address')
      .eq('id', project_id)
      .maybeSingle(),
  ])

  if (!staffRes.data) {
    return Response.json({ error: '등록되지 않은 직원입니다' }, { status: 403 })
  }
  if (projectRes.error) {
    return Response.json({ error: `접수 조회 실패: ${projectRes.error.message}` }, { status: 500 })
  }
  if (!projectRes.data) {
    return Response.json({ error: '접수 건을 찾을 수 없습니다' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const { data: created, error } = await admin
    .from('building_ledger_requests')
    .insert(buildRequestInsert(projectRes.data, staff_id, now))
    .select(RETURN_FIELDS)
    .single()

  if (error?.code === '23505') {
    return Response.json({ error: '이미 신청된 빌라입니다' }, { status: 409 })
  }
  if (error || !created) {
    return Response.json({ error: `신청 실패: ${error?.message ?? '알 수 없는 오류'}` }, { status: 500 })
  }

  return Response.json({ ok: true, item: { ...created, projects: projectRes.data } })
}
