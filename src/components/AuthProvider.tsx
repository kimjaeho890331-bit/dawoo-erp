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

interface StaffListItem {
  id: string
  name: string
}

interface AuthContextType {
  user: User | null
  staff: StaffInfo | null
  staffList: StaffListItem[]
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  staff: null,
  staffList: [],
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
  const [staffList, setStaffList] = useState<StaffListItem[]>([])
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
        const { data } = await supabase
          .from('staff')
          .select('id, name, role, phone')
          .eq('email', email)
          .maybeSingle()

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
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise<null>(resolve =>
          setTimeout(() => resolve(null), 2000),
        )

        const [result] = await Promise.all([
          Promise.race([sessionPromise, timeoutPromise]),
          supabase.from('staff').select('id, name').order('name').then(({ data }) => {
            if (data && !cancelled) setStaffList(data as StaffListItem[])
          }),
        ])

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
    <AuthContext.Provider value={{ user, staff, staffList, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
