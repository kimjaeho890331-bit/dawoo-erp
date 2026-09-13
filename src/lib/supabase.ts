import { createBrowserSupabaseClient } from './supabase/browser'

export {
  createBrowserSupabaseClient,
  isIsolatedAnonDataClientAuth,
  staffSessionAccessToken,
} from './supabase/browser'

/**
 * 화면에서 데이터를 읽고 쓰는 브라우저 클라이언트.
 * AuthProvider와 같은 @supabase/ssr 쿠키 세션을 쓴다 — 로그인 JWT가 요청에 실린다.
 *
 * 예전에는 persistSession:false + storageKey `dawoo-erp-data-client` 인
 * 세션 없는 anon 클라이언트였다. Auth 클라이언트와 기본 storageKey가 같으면
 * navigator.locks 가 충돌해 서버는 로그인인데 화면만 로그아웃으로 보였고,
 * 키를 나누면 JWT가 데이터 요청에 안 실렸다.
 * 지금은 클라이언트를 하나만 두어 그 버그를 피한다.
 * 여기에 @supabase/supabase-js createClient 를 다시 두지 말 것.
 */
export const supabase = createBrowserSupabaseClient()
