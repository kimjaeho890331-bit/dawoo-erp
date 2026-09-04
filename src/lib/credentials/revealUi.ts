export const REVEAL_VISIBLE_MS = 8000
export const REVEAL_CACHE_MS = 45_000

export type RevealRowStatus = 'pending' | 'open' | 'error'

export type RevealState =
  | { id: string; status: 'pending' }
  | { id: string; status: 'open'; password: string }
  | { id: string; status: 'error'; message: string }

export type RevealCacheEntry = {
  password: string
  expiresAt: number
}

export type RevealClickDecision =
  | { action: 'ignore' }
  | { action: 'toggle-hide' }
  | { action: 'show-cached'; password: string }
  | { action: 'fetch' }

/** 탭이 닫히면 같이 사라지는 메모리 캐시. 목록 API·activity_log에는 넣지 않는다. */
export const revealPasswordCache = new Map<string, RevealCacheEntry>()

export function cachedRevealPassword(
  cache: Map<string, RevealCacheEntry>,
  id: string,
  now: number,
): string | null {
  const entry = cache.get(id)
  if (!entry || entry.expiresAt <= now) {
    if (entry) cache.delete(id)
    return null
  }
  return entry.password
}

export function rememberRevealPassword(
  cache: Map<string, RevealCacheEntry>,
  id: string,
  password: string,
  now: number,
  ttlMs = REVEAL_CACHE_MS,
): void {
  cache.set(id, { password, expiresAt: now + ttlMs })
}

/**
 * 같은 행이 이미 열려 있으면 재요청 없이 숨긴다.
 * 타이머가 끝난 뒤에도 캐시가 살아 있으면 토글만.
 */
export function decideRevealClick(input: {
  rowId: string
  current: RevealState | null
  cache: Map<string, RevealCacheEntry>
  now: number
}): RevealClickDecision {
  if (input.current?.id === input.rowId) {
    if (input.current.status === 'pending') return { action: 'ignore' }
    if (input.current.status === 'open') return { action: 'toggle-hide' }
  }

  const cached = cachedRevealPassword(input.cache, input.rowId, input.now)
  if (cached !== null) {
    return { action: 'show-cached', password: cached }
  }
  return { action: 'fetch' }
}

export function revealErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error.trim()
  return '조회 실패'
}
