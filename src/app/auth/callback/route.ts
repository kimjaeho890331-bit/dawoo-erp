import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { isAutoCreatedStaff } from '@/lib/staff/ghost'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 1. 세션 교환
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

  const { data: { session }, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

  if (sessionError || !session?.user) {
    console.error('[auth/callback] session error:', sessionError)
    return NextResponse.redirect(new URL('/login?error=auth', request.url))
  }

  const user = session.user
  const email = user.email

  if (!email) {
    return NextResponse.redirect(new URL('/login?error=no_email', request.url))
  }

  // 2. service_role 클라이언트 (RLS 우회)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 3. 이 로그인 계정이 어느 직원인지 — 「내 계정 연결」(staff_emails)을 먼저, 없으면 직원 정보의 이메일.
  //    예전에는 직원 정보의 이메일만 보고, 없으면 카카오 닉네임으로 직원 행을 새로 만들었다(직책 '사원').
  //    그래서 직원 목록에 같은 사람이 한 명 더 생기고 그 사람의 기록이 새 행 이름으로 쌓였다.
  //    이제는 새로 만들지 않고, 연결이 안 된 계정은 본인 이름을 고르는 화면으로 보낸다.
  //    (텔레그램 코드 자동 생성도 뺐다 — 텔레그램은 쓰지 않는다)
  const { data: mapped } = await admin
    .from('staff_emails')
    .select('staff_id')
    .eq('email', email)
    .maybeSingle()

  let linked = !!mapped?.staff_id
  if (!linked) {
    const { data: byEmail } = await admin
      .from('staff')
      .select('id, role')
      .eq('email', email)
      .maybeSingle()
    // 예전에 자동으로 생긴 행(직책 '사원')은 연결된 것으로 보지 않는다 — 실제 이름을 고르게 한다
    linked = !!byEmail && !isAutoCreatedStaff(byEmail)
  }

  return NextResponse.redirect(new URL(linked ? '/dashboard' : '/link-account', request.url))
}
