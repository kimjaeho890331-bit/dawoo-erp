'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { supabase as dataClient, setDataClientSession } from '@/lib/supabase'
import { isAutoCreatedStaff } from '@/lib/staff/ghost'

interface StaffInfo {
  id: string
  name: string
  role: string
  phone: string
}

interface AuthContextType {
  user: User | null
  staff: StaffInfo | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  staff: null,
  loading: true,
  signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

// 첫 세션 확인 이후에는 리마운트·토큰 이벤트로 loading을 다시 true로 두지 않는다.
// true로 되돌리면 ClientLayout이 페이지 전체(등록 버튼 포함)를 「로딩 중...」으로 갈아끼운다.
let sessionResolved = false
let cachedUser: User | null = null
let cachedStaff: StaffInfo | null = null

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUserState] = useState<User | null>(cachedUser)
  const [staff, setStaffState] = useState<StaffInfo | null>(cachedStaff)
  const [loading, setLoading] = useState(() => !sessionResolved)

  const setUser = useCallback((next: User | null) => {
    cachedUser = next
    setUserState(next)
  }, [])

  const setStaff = useCallback((next: StaffInfo | null) => {
    cachedStaff = next
    setStaffState(next)
  }, [])

  const markReady = useCallback(() => {
    sessionResolved = true
    setLoading(false)
  }, [])

  // Supabase 클라이언트를 한 번만 생성 (매 렌더 재생성 방지)
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  )

  const fetchStaff = useCallback(
    async (email: string) => {
      try {
        // staff_emails(다중 이메일 매핑)를 먼저 본다 — 직원이 "내 계정 연결"로 등록한
        // 로그인 계정(카카오/네이버 등)은 여기에 있다. 아직 아무도 연결 안 했으면
        // staff.email(기존 단일 칼럼)로 폴백한다 — 기존 동작을 그대로 유지하기 위함.
        //
        // 조회는 화면용 데이터 클라이언트(dataClient)로 한다. 예전에는 로그인 클라이언트로
        // 조회했는데, 그 클라이언트의 조회는 매번 세션 잠금을 잡는다. 로그인 이벤트 처리
        // 도중(잠금을 쥔 채)에 조회하면 서로를 기다려 멈췄고, 5초 시간 초과가 지나서야
        // 화면이 떴다. 두 표 모두 화면들이 이미 같은 클라이언트로 읽는 표라 권한은 같다.
        const { data: mapped, error: mapError } = await dataClient
          .from('staff_emails')
          .select('staff:staff_id(id, name, role, phone)')
          .eq('email', email)
          .maybeSingle()
        if (mapError) return  // 조회 실패는 "연결 안 됨"이 아니다 — 아무것도 바꾸지 않는다

        const mappedStaff = mapped?.staff as unknown as StaffInfo | null

        let data = mappedStaff
        if (!data) {
          const { data: byEmail, error: byEmailError } = await dataClient
            .from('staff')
            .select('id, name, role, phone')
            .eq('email', email)
            .maybeSingle()
          if (byEmailError) return
          // 예전 카카오 로그인이 자동으로 만든 행(직책 '사원')은 본인으로 보지 않는다
          data = byEmail && !isAutoCreatedStaff(byEmail) ? (byEmail as StaffInfo) : null
        }

        if (data) {
          setStaff(data as StaffInfo)
          // staff ID를 localStorage에 저장 (다른 컴포넌트에서 사용)
          localStorage.setItem('dawoo_current_staff_id', data.id)
        } else if (!['/link-account', '/login'].includes(window.location.pathname)) {
          // 직원 정보와 연결되지 않은 계정 — 본인 이름을 고르는 화면으로 보낸다.
          // 예전에는 그대로 들어와 엉뚱한 이름(또는 자동 생성된 직원)으로 기록이 남았다.
          window.location.replace('/link-account')
        }
      } catch {
        // staff 조회 실패해도 로그인은 유지
      }
    },
    [setStaff],
  )

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        // 타임아웃 5초 — 네트워크 느릴 때 무한 로딩 방지
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise<null>(resolve =>
          setTimeout(() => resolve(null), 5000),
        )

        const result = await Promise.race([sessionPromise, timeoutPromise])

        if (cancelled) return

        // 타임아웃으로 이겼을 때(result === null)는 아무것도 덮어쓰지 않는다.
        // onAuthStateChange가 이미 세션을 채워뒀을 수 있는데 여기서 null을 쓰면
        // 로그인이 풀린 것처럼 보인다. "아직 모른다"와 "로그아웃"은 다르다.
        if (result && 'data' in result) {
          // 화면용 데이터 클라이언트에도 로그인 토큰을 넘긴다 — 직원 조회보다 먼저
          setDataClientSession(result.data.session)
          const currentUser = result.data.session?.user ?? null
          setUser(currentUser)

          if (currentUser?.email) {
            // 이 기기에서 이미 직원이 정해져 있으면 직원 조회를 기다리지 않고 바로 화면을 연다
            // (조회는 뒤에서 마저 한다). 처음 쓰는 기기만 기다린다 — 화면들이 처음 뜰 때
            // localStorage의 직원 id를 읽기 때문이다.
            const known = (() => { try { return !!localStorage.getItem('dawoo_current_staff_id') } catch { return false } })()
            if (known) void fetchStaff(currentUser.email)
            else await fetchStaff(currentUser.email)
          }
        }
      } catch (e) {
        // 세션 확인 실패 → 로그인 상태를 알 수 없음. 여기서도 user를 건드리지 않는다.
        // 조용히 삼키면 "로그인했는데 화면만 로그아웃"인 상태를 추적할 수 없어 로그는 남긴다.
        console.error('[auth] 세션 확인 실패:', e)
      } finally {
        if (!cancelled) markReady()
      }
    }

    init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // 이 콜백은 Supabase가 세션 잠금을 쥔 채로 부른다. 여기서 조회를 기다리면(await)
      // 잠금이 풀리지 않아 다른 탭·새로고침이 5초씩 멈췄다(Supabase 문서의 경고 사례).
      // 콜백은 바로 끝내고, 직원 조회는 다음 틱으로 미룬다.
      // 토큰 갱신(TOKEN_REFRESHED)·로그인·로그아웃마다 화면용 클라이언트의 토큰도 바꾼다(기다리지 않는 동기 호출)
      setDataClientSession(session)
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser?.email) {
        const email = currentUser.email
        setTimeout(() => { void fetchStaff(email) }, 0)
      } else {
        setStaff(null)
      }

      // TOKEN_REFRESHED 등에서도 loading을 true로 되돌리지 않는다.
      markReady()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase, fetchStaff, markReady, setUser, setStaff])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setDataClientSession(null)
    setUser(null)
    setStaff(null)
    localStorage.removeItem('dawoo_current_staff_id')
    router.push('/login')
  }, [supabase, router, setUser, setStaff])

  return (
    <AuthContext.Provider value={{ user, staff, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
