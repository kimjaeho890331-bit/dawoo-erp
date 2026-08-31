import { canSeePrivateIds } from '@/lib/credentialAccess'
import type { CredentialKind } from '@/types'

export type CredentialPageGate = 'checking' | 'ok' | 'denied'

/** 사이드바와 같이 localStorage 직원이 있으면 그걸 쓰고, 없으면 이메일 매핑 staff. */
export function resolvePageStaff<T>(
  picked: T | null | undefined,
  authStaff: T | null | undefined,
): T | null {
  return picked ?? authStaff ?? null
}

/** 로그인 staff 역할로 페이지 진입을 결정한다. 목록 API 결과와는 별개다. */
export function resolveCredentialPageGate(
  kind: CredentialKind,
  staff: { role: string } | null | undefined,
): Exclude<CredentialPageGate, 'checking'> {
  if (!staff) return 'denied'
  if (kind === 'private' && !canSeePrivateIds(staff.role)) return 'denied'
  return 'ok'
}

/**
 * 목록 fetch 401/403으로 이미 통과한 페이지를 닫지 않는다.
 * 역할 게이트가 아직 안 끝났을 때만 deny 후보가 된다.
 */
export function shouldRevokePageOnListStatus(
  gate: CredentialPageGate,
  status: number,
): boolean {
  if (gate === 'ok') return false
  return status === 401 || status === 403
}
