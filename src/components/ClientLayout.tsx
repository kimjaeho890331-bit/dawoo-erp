'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from "@/components/Sidebar"
import AIAssistant from "@/components/AIAssistant"
import Toaster from "@/components/common/Toaster"
import { AuthProvider, useAuth } from "@/components/AuthProvider"
import { Menu } from 'lucide-react'
import ServiceWorkerRegistrar from "@/components/pwa/ServiceWorkerRegistrar"
import InstallBanner from "@/components/pwa/InstallBanner"

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (pathname === '/login') return <>{children}</>

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-page">
        <div className="text-txt-secondary">로딩 중...</div>
      </div>
    )
  }

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="md:ml-[240px] min-h-screen bg-page">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-border-primary sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-tertiary">
            <Menu size={20} className="text-txt-secondary" />
          </button>
          <span className="text-[14px] font-semibold text-txt-primary">DAWOO ERP</span>
          <div className="w-9" /> {/* spacer */}
        </div>
        <InstallBanner />
        <div className="px-4 py-4 md:px-8 md:py-6">
          {children}
        </div>
      </main>
      <AIAssistant />
      <Toaster />
    </>
  )
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
      {/*
        서비스워커는 로그인 화면과 인증 로딩 중에도 등록되어야 한다.
        AuthenticatedLayout 안에 두면 두 경우의 조기 반환에 걸려 등록이
        늦어지는데, 직원이 처음 보는 화면이 /login이고 크롬은 그 시점에
        설치 가능 여부를 판정한다. 워커가 없으면 조건 미달로 판정하고,
        나중에 등록해봐야 그 페이지 로드에서는 이미 늦다.
      */}
      <ServiceWorkerRegistrar />
    </AuthProvider>
  )
}
