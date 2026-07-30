import webpush from 'web-push'
import { admin } from '@/lib/approval/guard'
import { isExpiredSubscriptionError } from './errors'

export { isExpiredSubscriptionError }

let configured = false

/**
 * VAPID 설정을 시도한다. 이 함수는 절대 예외를 던지지 않는다 — sendPush()의 계약이
 * "실패해도 결재 처리 자체를 실패시키지 않는다"이므로, 환경변수가 비어 있거나
 * 형식이 잘못돼 setVapidDetails가 throw해도 여기서 삼키고 로그만 남긴다.
 */
function configure() {
  if (configured) return
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? 'mailto:dawooconstr@gmail.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    )
    configured = true
  } catch (e) {
    console.error('[push] VAPID 설정 실패 — 이번 요청의 푸시 발송을 건너뜁니다:', e)
  }
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
  // 공개키·개인키 둘 다 없으면 조용히 넘어간다. 한쪽만 있으면 setVapidDetails가
  // throw할 수 있으므로(과거엔 개인키만 확인해 이 경우를 막지 못했다) 여기서 같이 걸러낸다.
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return

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
