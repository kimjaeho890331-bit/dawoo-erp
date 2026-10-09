import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * 화면에서 데이터를 읽고 쓰는 클라이언트. 로그인 세션 자체는 여기서 다루지 않는다 —
 * 세션은 AuthProvider의 쿠키 기반 클라이언트(@supabase/ssr)가 전담한다.
 *
 * 예전에는 이 클라이언트가 로그인 정보 없이(anon) 요청해서, DB에 "로그인한 사람만" 규칙(RLS)을
 * 켜면 직원 화면이 모두 비었다. 그래서 RLS를 켤 수 없었다. 이제 AuthProvider가 넘겨 주는
 * 로그인 토큰을 요청마다 싣는다(accessToken 옵션).
 *
 * accessToken 옵션을 쓰면 이 클라이언트는 자기 로그인 관리(GoTrue)를 만들지 않는다 —
 * 세션 잠금(navigator.locks)을 잡지 않으므로, 예전처럼 두 클라이언트가 같은 잠금을 두고
 * 다투거나 로그인 이벤트 중에 조회하다 멈추는 일이 생기지 않는다.
 * (대신 이 클라이언트의 supabase.auth는 쓸 수 없다. 로그인 관련은 AuthProvider의 클라이언트로.)
 *
 * 토큰이 없거나 만료됐으면 지금까지처럼 anon 키로 요청한다 — RLS를 켜기 전에는 보이는 것이 같다.
 */
let accessToken: string | null = null
let expiresAt = 0
let markReady: () => void = () => {}
const sessionReady = new Promise<void>(resolve => { markReady = resolve })

/** AuthProvider가 세션을 확인하거나 바뀔 때마다 부른다. 로그아웃이면 null. */
export function setDataClientSession(session: { access_token: string; expires_at?: number } | null) {
  accessToken = session?.access_token ?? null
  expiresAt = session?.expires_at ?? 0
  markReady()
  // 실시간 구독(접수대장·입금·일정)도 같은 토큰으로 다시 인증한다
  void supabase.realtime.setAuth().catch(() => {})
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => {
    if (typeof window === 'undefined') return null
    // 첫 화면은 AuthProvider가 세션을 확인하기 전에 조회를 시작할 수 있다. 잠깐(최대 3초) 기다려
    // 로그인 토큰을 싣는다 — RLS를 켠 뒤 첫 조회만 anon으로 나가 빈 목록이 뜨는 것을 막는다.
    await Promise.race([sessionReady, new Promise(resolve => setTimeout(resolve, 3000))])
    // 만료 30초 전부터는 싣지 않는다(만료 토큰은 401). 쿠키 클라이언트가 곧 새 토큰을 넘겨 준다.
    if (accessToken && expiresAt - 30 > Date.now() / 1000) return accessToken
    return null
  },
})
