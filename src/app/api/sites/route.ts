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
    name?: string | null
    address?: string | null
    site_manager?: string | null
    site_assistant?: string | null
    client_manager?: string | null
    client_phone?: string | null
    start_date?: string | null
    end_date?: string | null
    quote_date?: string | null
    construction_start_date?: string | null
    inflow_path?: string | null
    work_kind?: string | null
    status?: string | null
    contract_type?: string | null
    budget?: number | null
    memo?: string | null
    actor_staff_id?: string
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }

  const { resolveActor } = await import('@/lib/approval/guard')
  const { insertNewSite } = await import('@/lib/sites/insert')
  const actor = await resolveActor(actorStaffIdFrom(request, body.actor_staff_id))
  if (actor instanceof Response) return actor

  const inserted = await insertNewSite({
    name: body.name,
    address: body.address,
    site_manager: body.site_manager,
    site_assistant: body.site_assistant,
    client_manager: body.client_manager,
    client_phone: body.client_phone,
    start_date: body.start_date,
    end_date: body.end_date,
    quote_date: body.quote_date,
    construction_start_date: body.construction_start_date,
    inflow_path: body.inflow_path,
    work_kind: body.work_kind,
    status: body.status,
    contract_type: body.contract_type,
    budget: body.budget,
    memo: body.memo,
  })
  if ('error' in inserted) {
    return Response.json({ error: inserted.error }, { status: inserted.status })
  }
  return Response.json({ id: inserted.id }, { status: 201 })
}
