import { NextRequest } from 'next/server'
import { admin, resolveActor } from '@/lib/approval/guard'

export async function POST(request: NextRequest) {
  const { endpoint, keys, userAgent, actor_staff_id } = (await request.json()) as {
    endpoint: string
    keys: { p256dh: string; auth: string }
    userAgent?: string
    actor_staff_id?: string
  }

  // 어느 직원의 기기로 등록할지 알아야 하므로 actor_staff_id가 필요하다.
  // resolveActor는 request가 아니라 id를 받는다 — 본문을 두 번 읽지 않기 위해서다.
  const actor = await resolveActor(actor_staff_id)
  if (actor instanceof Response) return actor
  const { staff } = actor

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return Response.json({ error: '구독 정보가 올바르지 않습니다' }, { status: 400 })
  }

  const { error } = await admin.from('push_subscriptions').upsert(
    {
      staff_id: staff.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: userAgent ?? null,
    },
    { onConflict: 'endpoint' },
  )

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
