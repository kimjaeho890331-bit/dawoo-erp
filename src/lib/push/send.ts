import webpush from 'web-push'
import { admin } from '@/lib/approval/guard'
import { isExpiredSubscriptionError } from './errors'

export { isExpiredSubscriptionError }

let configured = false

function configure() {
  if (configured) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:dawooconstr@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  configured = true
}

export interface PushPayload {
  title: string
  body: string
  /** 알림 클릭 시 이동할 경로. public/sw.js의 notificationclick이 data.url로 읽는다. */
  url: string
  tag?: string
}

/**
 * 직원들에게 웹푸시를 보낸다. 실패해도 예외를 던지지 않는다 —
 * 알림이 안 갔다고 결재 처리 자체가 실패하면 안 된다.
 */
export async function sendPush(staffIds: string[], payload: PushPayload): Promise<void> {
  if (staffIds.length === 0) return
  if (!process.env.VAPID_PRIVATE_KEY) return // 키 미설정 환경에서는 조용히 넘어간다

  configure()

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('staff_id', staffIds)

  const body = JSON.stringify(payload)
  const dead: string[] = []

  await Promise.all(
    (subs ?? []).map(async s => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        )
      } catch (e) {
        if (isExpiredSubscriptionError(e)) dead.push(s.id)
      }
    }),
  )

  if (dead.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', dead)
  }
}
