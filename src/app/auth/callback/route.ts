import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { session } } = await supabase.auth.exchangeCodeForSession(code)

    if (session?.user?.email) {
      // service_role로 staff 조회 (RLS 우회)
      const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const { data: staff } = await adminSupabase
        .from('staff')
        .select('is_verified')
        .eq('email', session.user.email)
        .single()

      if (staff?.is_verified) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }

      // 미인증 또는 미연결 → 온보딩
      return NextResponse.redirect(new URL('/onboard', request.url))
    }
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
