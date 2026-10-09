import type { PushPayload } from '@/lib/push/send'

/** 알림 받을 사람을 고를 때 필요한 직원 정보. */
export interface NoticeStaff {
  id: string
  name: string
  role?: string | null
  /** 채워져 있으면 퇴사자 — 알림을 보내지 않는다 */
  resign_date?: string | null
}

/**
 * 무엇을 누구에게 보낼지에 대한 결정.
 * ok:false는 지금 행 상태로는 이 알림이 맞지 않는다는 뜻이다(예: 이미 처리된 신청에 '신청' 알림).
 */
export type NoticePlan =
  | { ok: true; recipients: string[]; payload: PushPayload }
  | { ok: false; status: 409; error: string }

/** 재직 중인 직원만 남긴다. 퇴사자 기기에 구독이 남아 있어도 회사 알림이 가면 안 된다. */
export function activeIds(ids: (string | null | undefined)[], staff: NoticeStaff[]): string[] {
  const active = new Set(staff.filter(s => !s.resign_date).map(s => s.id))
  return Array.from(new Set(ids.filter((id): id is string => !!id && active.has(id))))
}
