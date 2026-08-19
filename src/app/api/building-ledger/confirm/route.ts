import { NextRequest } from 'next/server'
import { admin, requireApiUser } from '@/lib/buildingLedger/admin'
import { buildConfirmUpdate, canTransition, isUuid } from '@/lib/buildingLedger/status'

/**
 * POST /api/building-ledger/confirm
 * 직원이 발급 파일을 확인한다. issued → confirmed 만.
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

  const { id, staff_id } = (body ?? {}) as { id?: unknown; staff_id?: unknown }
  if (typeof id !== 'string' || !isUuid(id)) {
    return Response.json({ error: '유효하지 않은 요청 id입니다' }, { status: 400 })
  }
  if (staff_id !== undefined && staff_id !== null && (typeof staff_id !== 'string' || !isUuid(staff_id))) {
    return Response.json({ error: '유효하지 않은 staff_id입니다' }, { status: 400 })
  }

  const { data: current, error: loadError } = await admin
    .from('building_ledger_requests')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (loadError) {
    return Response.json({ error: `조회 실패: ${loadError.message}` }, { status: 500 })
  }
  if (!current) {
    return Response.json({ error: '요청을 찾을 수 없습니다' }, { status: 404 })
  }
  if (!canTransition(current.status, 'confirmed')) {
    const message = current.status === 'confirmed'
      ? '이미 확인된 건입니다'
      : '발급 완료된 건만 확인할 수 있습니다'
    return Response.json({ error: message }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { data: claimed, error } = await admin
    .from('building_ledger_requests')
    .update(buildConfirmUpdate(typeof staff_id === 'string' ? staff_id : null, now))
    .eq('id', id)
    .eq('status', 'issued')
    .select('id')
    .maybeSingle()

  if (error) {
    return Response.json({ error: `확인 처리 실패: ${error.message}` }, { status: 500 })
  }
  if (!claimed) {
    return Response.json({ error: '이미 처리된 요청입니다' }, { status: 409 })
  }

  return Response.json({ ok: true })
}
