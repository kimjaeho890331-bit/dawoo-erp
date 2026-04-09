import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function getAuthUser() {
  // 개발 환경 인증 우회
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === '1') {
    return { id: 'dev-user', email: 'dev@dawoo.co.kr' } as any
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // API Route에서는 정상 동작, Server Component에서는 무시
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
