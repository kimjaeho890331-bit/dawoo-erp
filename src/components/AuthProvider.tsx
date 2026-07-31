'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [staff, setStaff] = useState<StaffInfo | null>(null)
  const [loading, setLoading] = useState(true)

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
        const { data: mapped } = await supabase
          .from('staff_emails')
          .select('staff:staff_id(id, name, role, phone)')
          .eq('email', email)
          .maybeSingle()

        const mappedStaff = mapped?.staff as unknown as StaffInfo | null

        const data =
          mappedStaff ??
          (
            await supabase
              .from('staff')
              .select('id, name, role, phone')
              .eq('email', email)
              .maybeSingle()
          ).data

        if (data) {
          setStaff(data as StaffInfo)
          // staff ID를 localStorage에 저장 (다른 컴포넌트에서 사용)
          localStorage.setItem('dawoo_current_staff_id', data.id)
        }
      } catch {
        // staff 조회 실패해도 로그인은 유지
      }
    },
    [supabase],
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

        const session = result && 'data' in result ? result.data.session : null
        const currentUser = session?.user ?? null
        setUser(currentUser)

        if (currentUser?.email) {
          await fetchStaff(currentUser.email)
        }
      } catch {
        // 세션 확인 실패 → 로그인 안 된 것으로 처리
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser?.email) {
        await fetchStaff(currentUser.email)
      } else {
        setStaff(null)
      }

      setLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase, fetchStaff])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setStaff(null)
    localStorage.removeItem('dawoo_current_staff_id')
    router.push('/login')
  }, [supabase, router])

  return (
    <AuthContext.Provider value={{ user, staff, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
