import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { staffId } = await request.json()
  if (!staffId) {
    return NextResponse.json({ error: '직원 ID가 필요합니다' }, { status: 400 })
  }

  // service_role로 staff 업데이트 (RLS 우회)
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 이미 다른 이메일이 연결된 직원인지 확인
  const { data: existing } = await adminSupabase
    .from('staff')
    .select('id, email')
    .eq('id', staffId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: '직원을 찾을 수 없습니다' }, { status: 404 })
  }

  if (existing.email && existing.email !== user.email) {
    return NextResponse.json({ error: '이미 다른 계정에 연결된 직원입니다' }, { status: 409 })
  }

  // 이메일 연결 + 인증 완료
  const { error } = await adminSupabase
    .from('staff')
    .update({ email: user.email, is_verified: true })
    .eq('id', staffId)

  if (error) {
    return NextResponse.json({ error: '직원 연결에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
