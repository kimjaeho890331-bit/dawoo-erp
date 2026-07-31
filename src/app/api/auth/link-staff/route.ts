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

  // staff_emails 교차 검증 — "내 계정 연결"(설정 화면)로 이미 이 staff_id에
  // 매핑이 걸려 있는데 staff.email이 비어 있는 경우(둘이 서로 몰라서 어긋나는
  // 케이스), staff.email만 보고 덮어쓰면 두 테이블이 서로 다른 계정을 가리키게
  // 된다. 매핑이 있고 그 이메일이 지금 로그인 계정과 다르면 막는다. 본인이
  // 이미 연결한 계정으로 다시 온보딩을 시도하는 경우(같은 이메일)는 통과시킨다.
  const { data: existingMapping, error: mappingError } = await adminSupabase
    .from('staff_emails')
    .select('email')
    .eq('staff_id', staffId)
    .maybeSingle()

  if (mappingError) {
    return NextResponse.json({ error: '계정 연결 상태를 확인하지 못했습니다' }, { status: 500 })
  }

  if (existingMapping && existingMapping.email !== user.email) {
    return NextResponse.json(
      { error: '이미 다른 계정이 이 직원으로 연결되어 있습니다. 관리자에게 문의해주세요' },
      { status: 409 },
    )
  }

  // 이메일 연결 + 인증 완료
  const { error } = await adminSupabase
    .from('staff')
    .update({ email: user.email, is_verified: true })
    .eq('id', staffId)

  if (error) {
    return NextResponse.json({ error: '직원 연결에 실패했습니다' }, { status: 500 })
  }

  // staff_emails에도 같은 매핑을 남긴다 — "내 계정 연결" 경로와 온보딩 경로가
  // 같은 사실을 보게 하기 위함. email UNIQUE라 onConflict로 최신화한다.
  const { error: staffEmailsError } = await adminSupabase
    .from('staff_emails')
    .upsert(
      {
        staff_id: staffId,
        email: user.email,
        linked_by_email: user.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' },
    )

  if (staffEmailsError) {
    return NextResponse.json({ error: '계정 연결 기록 저장에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
