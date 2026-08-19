import { NextRequest } from 'next/server'
import { admin, requireApiUser } from '@/lib/buildingLedger/admin'
import { canCancelRequest, isUuid } from '@/lib/buildingLedger/status'

/**
 * POST /api/building-ledger/cancel
 * 아직 세움터가 가져가기 전(requested)일 때만 대기열에서 뺀다.
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

  const { id } = (body ?? {}) as { id?: unknown }
  if (typeof id !== 'string' || !isUuid(id)) {
    return Response.json({ error: '유효하지 않은 요청 id입니다' }, { status: 400 })
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
  if (!canCancelRequest(current.status)) {
    return Response.json({ error: '신청 중인 건만 뺄 수 있습니다' }, { status: 409 })
  }

  const { error } = await admin
    .from('building_ledger_requests')
    .delete()
    .eq('id', id)
    .eq('status', 'requested')

  if (error) {
    return Response.json({ error: `빼기 실패: ${error.message}` }, { status: 500 })
  }

  return Response.json({ ok: true })
}
