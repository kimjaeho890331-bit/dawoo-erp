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

export const CREDENTIAL_STAFF_ROLE_CACHE_KEY = 'dawoo_credential_staff_role'

export type CachedPageStaff = { id: string; role: string }

type RoleCacheStore = Pick<Storage, 'getItem' | 'setItem'>

function defaultRoleCacheStore(): RoleCacheStore | null {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage
}

/** 같은 탭 세션에 남겨 둔 staffId+role. id가 다르면 쓰지 않는다. */
export function readCachedPageStaff(
  staffId: string | null | undefined,
  storage?: RoleCacheStore | null,
): CachedPageStaff | null {
  if (!staffId) return null
  const store = storage === undefined ? defaultRoleCacheStore() : storage
  if (!store) return null
  try {
    const raw = store.getItem(CREDENTIAL_STAFF_ROLE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: unknown; role?: unknown }
    if (parsed.id !== staffId) return null
    if (typeof parsed.role !== 'string' || !parsed.role) return null
    return { id: staffId, role: parsed.role }
  } catch {
    return null
  }
}

export function writeCachedPageStaff(
  staff: CachedPageStaff,
  storage?: RoleCacheStore | null,
): void {
  const store = storage === undefined ? defaultRoleCacheStore() : storage
  if (!store) return
  try {
    store.setItem(CREDENTIAL_STAFF_ROLE_CACHE_KEY, JSON.stringify({ id: staff.id, role: staff.role }))
  } catch {
    // private mode / quota
  }
}

/** AuthProvider staff 또는 같은 탭 role 캐시가 있으면 pick 조회를 건너뛴다. */
export function shouldSkipStaffRoundTrip(
  authStaff: { id?: string } | null | undefined,
  cached?: { id?: string } | null,
): boolean {
  return Boolean(authStaff?.id || cached?.id)
}

/** 게이트가 끝나기 전에도 staff id가 있으면 목록 GET을 먼저 보낸다. */
export function canPrefetchCredentialList(input: {
  authStaffId?: string | null
  actorStaffId?: string | null
}): boolean {
  return Boolean(input.authStaffId || input.actorStaffId)
}

/**
 * 권한없음만 전체를 가린다.
 * 확인 중이라도 로그인 staff / 로컬 staff id가 있으면 검색·등록·스켈레톤 셸을 바로 그린다.
 */
export function shouldShowCredentialShell(
  gate: CredentialPageGate,
  ids: { authStaffId?: string | null; actorStaffId?: string | null },
): boolean {
  if (gate === 'denied') return false
  if (gate === 'ok') return true
  return canPrefetchCredentialList(ids)
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
