import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rate limiting (in-memory, 서버리스 환경에서는 인스턴스별)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(ip: string, path: string): boolean {
  const limit = path.startsWith('/api/chat') ? 20 : 60
  const windowMs = 60 * 1000 // 1분
  const now = Date.now()
  const key = `${ip}:${path.startsWith('/api/chat') ? 'chat' : 'api'}`

  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false
  entry.count++
  return true
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /login, 정적 리소스는 인증 불필요 — 바로 통과
  if (pathname === '/login' || pathname.startsWith('/auth/')) {
    return NextResponse.next()
  }

  // 외부 시스템이 호출하는 엔드포인트는 인증 스킵 (자체 시크릿으로 검증)
  // - 텔레그램 웹훅: X-Telegram-Bot-Api-Secret-Token 헤더
  // - 텔레그램 setup: 최초 1회 수동 호출
  // - Vercel Cron: CRON_SECRET 헤더
  if (
    pathname.startsWith('/api/telegram/') ||
    pathname.startsWith('/api/notifications/cron/')
  ) {
    return NextResponse.next()
  }

  // 개발 환경에서는 인증 건너뛰기 (Supabase Auth 유저 생성 전)
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === '1') {
    return NextResponse.next()
  }

  // Rate limit 체크 (API 경로만)
  if (pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || '127.0.0.1'

    if (!checkRateLimit(ip, pathname)) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      )
    }
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 미인증 사용자 처리
  if (!user) {
    // API 경로: 401 JSON 응답
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: '인증이 필요합니다' },
        { status: 401 }
      )
    }

    // 나머지 경로: /login으로 리다이렉트
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
