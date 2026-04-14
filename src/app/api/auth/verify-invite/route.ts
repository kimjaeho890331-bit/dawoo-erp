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
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { code } = await request.json()
  const inviteCode = process.env.INVITE_CODE

  if (!inviteCode) {
    return NextResponse.json({ error: '초대코드가 설정되지 않았습니다' }, { status: 500 })
  }

  if (code !== inviteCode) {
    return NextResponse.json({ valid: false, error: '초대코드가 일치하지 않습니다' }, { status: 401 })
  }

  return NextResponse.json({ valid: true })
}
