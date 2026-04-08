'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
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

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const fetchStaff = useCallback(async (email: string) => {
    const { data } = await supabase
      .from('staff')
      .select('id, name, role, phone')
      .eq('email', email)
      .single()

    if (data) {
      setStaff(data as StaffInfo)
    }
  }, [supabase])

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser?.email) {
        await fetchStaff(currentUser.email)
      }

      setLoading(false)
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)

        if (currentUser?.email) {
          await fetchStaff(currentUser.email)
        } else {
          setStaff(null)
        }

        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, fetchStaff])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setStaff(null)
    router.push('/login')
  }, [supabase, router])

  return (
    <AuthContext.Provider value={{ user, staff, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
