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

/** AuthProvider에 이미 staff가 있으면 목록 페이지가 staff를 다시 조회하지 않는다. */
export function shouldSkipStaffRoundTrip(
  authStaff: { id?: string } | null | undefined,
): boolean {
  return Boolean(authStaff?.id)
}

/** 게이트가 끝나기 전에도 staff id가 있으면 목록 GET을 먼저 보낸다. */
export function canPrefetchCredentialList(input: {
  authStaffId?: string | null
  actorStaffId?: string | null
}): boolean {
  return Boolean(input.authStaffId || input.actorStaffId)
}

/** 역할이 이미 있으면 확인 중을 건너뛰고, 한 번 ok면 유지한다. */
export function resolveVisibleGate(
  kind: CredentialKind,
  staff: { role: string } | null | undefined,
  flags: {
    pickLoading: boolean
    authLoading: boolean
    latchedOk: boolean
  },
): CredentialPageGate {
  if (flags.latchedOk) return 'ok'
  if (staff) return resolveCredentialPageGate(kind, staff)
  if (flags.pickLoading || flags.authLoading) return 'checking'
  return 'denied'
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
