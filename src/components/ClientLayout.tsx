'use client'
import { usePathname } from 'next/navigation'
import Sidebar from "@/components/Sidebar"
import AISidebar from "@/components/AISidebar"
import { AuthProvider, useAuth } from "@/components/AuthProvider"

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth()
  const pathname = usePathname()

  // 로그인 페이지는 사이드바/인증 로딩 없이 바로 렌더
  if (pathname === '/login') {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-page">
        <div className="text-txt-secondary">로딩 중...</div>
      </div>
    )
  }

  return (
    <>
      <Sidebar />
      <main className="ml-[240px] min-h-screen bg-page px-8 py-6">
        {children}
      </main>
      <AISidebar />
    </>
  )
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
    </AuthProvider>
  )
}
