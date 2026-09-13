import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 예전에 데이터 전용 createClient 가 쓰던 분리 storageKey.
 * AuthProvider 기본 키와 같으면 navigator.locks 가 충돌했고,
 * 다르게 두면 세션 JWT가 데이터 요청에 안 실렸다.
 * 지금은 쓰지 않는다 — 클라이언트를 하나만 둔다.
 */
export const ISOLATED_ANON_DATA_STORAGE_KEY = 'dawoo-erp-data-client'

type CreateBrowserClient = (
  url: string,
  anonKey: string,
) => SupabaseClient

let createFn: CreateBrowserClient = createBrowserClient
let cached: SupabaseClient | undefined

export function getSupabaseBrowserEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  }
}

/**
 * AuthProvider·로그인·화면 데이터가 같이 쓰는 브라우저 클라이언트.
 * @supabase/ssr 쿠키 세션(로그인 JWT)이 from(...) 요청에 실린다.
 *
 * createBrowserClient 는 브라우저에서 기본 싱글톤이다. 우리가 한 번 더 캐시하는
 * 이유는 AuthProvider 와 `import { supabase }` 가 서로 다른 인스턴스를 만들어
 * 같은 storageKey 잠금을 두고 싸우지 않게 하기 위해서다.
 * persistSession/storageKey 를 여기서 덮어쓰지 말 것.
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  if (cached) return cached
  const { url, anonKey } = getSupabaseBrowserEnv()
  cached = createFn(url, anonKey)
  return cached
}

export function resetBrowserSupabaseClientForTests() {
  cached = undefined
  createFn = createBrowserClient
}

export function setBrowserClientFactoryForTests(next: CreateBrowserClient) {
  cached = undefined
  createFn = next
}

/**
 * persistSession:false 또는 분리 storageKey 는 세션 JWT를 안 싣거나
 * Auth 클라이언트와 잠금이 갈라진다. Stage 1 클라이언트는 이 설정이 아니다.
 */
export function isIsolatedAnonDataClientAuth(
  auth?: { persistSession?: boolean; storageKey?: string } | null,
): boolean {
  if (!auth) return false
  if (auth.persistSession === false) return true
  if (auth.storageKey === ISOLATED_ANON_DATA_STORAGE_KEY) return true
  return false
}

/**
 * 로그아웃(세션/유저 없음)이면 staff JWT가 없다.
 * 빈 세션을 직원 세션처럼 쓰지 않는다.
 */
export function staffSessionAccessToken(
  session: { access_token?: string | null; user?: unknown } | null | undefined,
): string | null {
  if (!session?.access_token || !session.user) return null
  return session.access_token
}
