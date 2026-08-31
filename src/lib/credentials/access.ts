import { canSeePrivateIds } from '@/lib/credentialAccess'
import type { CredentialKind } from '@/types'

/**
 * API 역할 게이트. 화면 숨김과 별개로, 직원/현장소장이
 * /api/ids-private 을 직접 쳐도 행을 주지 않는다.
 */
export function credentialDenyBody(error: string) {
  return { error, items: [] as never[] }
}

export function credentialAccessDeny(
  kind: CredentialKind,
  role: string | null | undefined,
): { error: string; status: number } | null {
  if (kind === 'private' && !canSeePrivateIds(role)) {
    return { error: '권한없음', status: 403 }
  }
  return null
}

/** 로그인 이메일 매핑이 있으면 그걸 쓰고, 없으면 화면에서 고른 staff id. */
export function pickCredentialStaff<T>(
  mappedByEmail: T | null | undefined,
  mappedByActorId: T | null | undefined,
): T | null {
  return mappedByEmail ?? mappedByActorId ?? null
}
