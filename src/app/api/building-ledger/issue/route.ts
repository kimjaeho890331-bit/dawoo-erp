import { NextRequest } from 'next/server'
import { admin, requireApiUser } from '@/lib/buildingLedger/admin'
import { buildIssueUpdate, canTransition, mergeIssueIds } from '@/lib/buildingLedger/status'

/**
 * POST /api/building-ledger/issue
 * 세움터가 발급 결과를 남긴다. requested → issued 만.
 * 드라이브 URL은 호출자가 보낸 값만 저장한다.
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

  if (!body || typeof body !== 'object') {
    return Response.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }

  const payload = body as { ids?: unknown; batch_key?: unknown; items?: unknown }
  if (payload.batch_key !== undefined && typeof payload.batch_key !== 'string') {
    return Response.json({ error: 'batch_key는 문자열이어야 합니다' }, { status: 400 })
  }

  const merged = mergeIssueIds(payload.ids, payload.items)
  if (!merged.ok) return Response.json({ error: merged.error }, { status: 400 })

  const now = new Date().toISOString()
  const updated: string[] = []
  const skipped: string[] = []

  for (const item of merged.items) {
    const { data: current, error: loadError } = await admin
      .from('building_ledger_requests')
      .select('id, status')
      .eq('id', item.id)
      .maybeSingle()

    if (loadError) {
      return Response.json({ error: `조회 실패: ${loadError.message}` }, { status: 500 })
    }
    if (!current || !canTransition(current.status, 'issued')) {
      skipped.push(item.id)
      continue
    }

    const { data: claimed, error } = await admin
      .from('building_ledger_requests')
      .update(buildIssueUpdate(item, now, payload.batch_key))
      .eq('id', item.id)
      .eq('status', 'requested')
      .select('id')
      .maybeSingle()

    if (error) {
      return Response.json({ error: `발급 처리 실패: ${error.message}` }, { status: 500 })
    }
    if (claimed) updated.push(claimed.id)
    else skipped.push(item.id)
  }

  return Response.json({ ok: true, updated, skipped })
}
