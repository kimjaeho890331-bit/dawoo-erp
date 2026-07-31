import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * 화면에서 데이터를 읽고 쓰는 anon 클라이언트. 로그인 세션은 여기서 다루지 않는다 —
 * 세션은 AuthProvider의 쿠키 기반 클라이언트(@supabase/ssr)가 전담한다.
 *
 * auth 옵션을 명시적으로 꺼두는 이유:
 * 기본값으로 두면 이 클라이언트도 GoTrue를 초기화하면서 기본 저장소 이름
 * `sb-<project>-auth-token`을 쓴다. AuthProvider의 클라이언트와 이름이 같아지고,
 * 이름이 같으면 브라우저 잠금(navigator.locks)도 같은 것을 잡는다. 실제로
 * 세션이 없는 이쪽이 잠금을 5초간 붙들면 AuthProvider의 getSession()이
 * "another request stole it" 예외로 죽어, 서버는 로그인 상태로 보는데 화면만
 * 로그아웃으로 보이는 상태가 됐다.
 *
 * persistSession/autoRefreshToken을 끄고 storageKey를 따로 주어 두 클라이언트가
 * 서로 다른 잠금을 쓰게 한다. 이 클라이언트는 원래도 세션을 갖지 않았으므로
 * 요청이 나가는 권한(anon)은 달라지지 않는다.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'dawoo-erp-data-client',
  },
})