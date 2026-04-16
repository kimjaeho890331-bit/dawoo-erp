import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { generateInviteCode } from '@/lib/staff/inviteCode'

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

  // 2. 카카오 닉네임 추출
  const kakaoName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.preferred_username ||
    email.split('@')[0] ||
    '새 직원'

  // 3. service_role 클라이언트 (RLS 우회)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 4. staff 조회
  const { data: existingStaff } = await admin
    .from('staff')
    .select('id, name, is_verified')
    .eq('email', email)
    .maybeSingle()

  let staffId: string
  let staffName: string
  let isNewUser = false

  if (existingStaff) {
    // 기존 직원
    staffId = existingStaff.id
    staffName = existingStaff.name
  } else {
    // 신규 직원 자동 생성
    const { data: newStaff, error: insertError } = await admin
      .from('staff')
      .insert({
        name: kakaoName,
        email,
        role: '사원',
        is_verified: false,
      })
      .select('id, name')
      .single()

    if (insertError || !newStaff) {
      console.error('[auth/callback] staff insert error:', insertError)
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    staffId = newStaff.id
    staffName = newStaff.name
    isNewUser = true
  }

  // 5. 텔레그램 초대코드 없으면 자동 생성
  const { data: existingInvite } = await admin
    .from('staff_invitations')
    .select('id')
    .eq('used_by_staff_id', staffId)
    .is('used_at', null)
    .maybeSingle()

  if (!existingInvite) {
    await admin.from('staff_invitations').insert({
      code: generateInviteCode(),
      name: staffName,
      used_by_staff_id: staffId,
    })
  }

  // 6. 리다이렉트
  const redirectUrl = new URL('/dashboard', request.url)
  if (isNewUser) {
    redirectUrl.searchParams.set('welcome', 'true')
  }

  return NextResponse.redirect(redirectUrl)
}
