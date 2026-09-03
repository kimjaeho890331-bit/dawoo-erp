import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { listActivityLogs } from '@/lib/activityLog/list'

function actorStaffIdFrom(request: NextRequest, bodyActorId?: string | null): string | null {
  const headerId = request.headers.get('x-actor-staff-id')?.trim()
  const bodyId = bodyActorId?.trim()
  return headerId || bodyId || null
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user?.email) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const targetId = request.nextUrl.searchParams.get('target_id')
  const targetType = request.nextUrl.searchParams.get('target_type')
  const listed = await listActivityLogs({
    targetId,
    targetType,
  })
  if ('error' in listed) {
    return Response.json({ error: listed.error }, { status: listed.status })
  }
  return Response.json({ rows: listed.rows })
}

export async function POST(request: NextRequest) {
  let body: {
    action?: string
    target_type?: string | null
    target_id?: string | null
    detail?: string | null
    actor_staff_id?: string
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }

  const { resolveActor } = await import('@/lib/approval/guard')
  const { insertActivityLog } = await import('@/lib/activityLog/insert')
  const actor = await resolveActor(actorStaffIdFrom(request, body.actor_staff_id))
  if (actor instanceof Response) return actor

  const inserted = await insertActivityLog({
    staffId: actor.staff.id,
    action: body.action || '',
    target_type: body.target_type ?? null,
    target_id: body.target_id ?? null,
    detail: body.detail ?? null,
  })
  if ('error' in inserted) {
    return Response.json({ error: inserted.error }, { status: inserted.status })
  }
  return Response.json({ row: inserted.row }, { status: 201 })
}
