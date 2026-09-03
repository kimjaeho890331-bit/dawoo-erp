import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'

function actorStaffIdFrom(request: NextRequest, bodyActorId?: string | null): string | null {
  const headerId = request.headers.get('x-actor-staff-id')?.trim()
  const bodyId = bodyActorId?.trim()
  return headerId || bodyId || null
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user?.email) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  let body: {
    project_id?: string
    from_status?: string | null
    to_status?: string
    note?: string | null
    actor_staff_id?: string
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }

  const { resolveActor } = await import('@/lib/approval/guard')
  const { insertStatusLogRow } = await import('@/lib/statusLog/insert')
  const actor = await resolveActor(actorStaffIdFrom(request, body.actor_staff_id))
  if (actor instanceof Response) return actor

  const inserted = await insertStatusLogRow({
    staffId: actor.staff.id,
    projectId: body.project_id || '',
    fromStatus: body.from_status ?? null,
    toStatus: body.to_status || '',
    note: body.note ?? null,
  })
  if ('error' in inserted) {
    return Response.json({ error: inserted.error }, { status: inserted.status })
  }
  return Response.json({ ok: true }, { status: 201 })
}
