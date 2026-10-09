'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from "@/components/Sidebar"
import dynamic from 'next/dynamic'
// AI 비서는 지금 꺼져 있다(UI_HIDDEN). 예전에는 꺼져 있어도 모든 화면이 그 코드를 함께 내려받았다.
// 켤 때만 따로 받아 오게 한다.
const AIAssistant = dynamic(() => import("@/components/AIAssistant"), { ssr: false })
import Toaster from "@/components/common/Toaster"
import { UI_HIDDEN } from "@/lib/uiHidden"
import { AuthProvider, useAuth } from "@/components/AuthProvider"
import { Menu } from 'lucide-react'
import { findMenuItem } from '@/lib/menu/menuItems'
import ServiceWorkerRegistrar from "@/components/pwa/ServiceWorkerRegistrar"
import InstallBanner from "@/components/pwa/InstallBanner"

const SIDEBAR_KEY = 'dawoo_sidebar_collapsed'

/** 폰 상단바 제목. 메뉴에 있는 화면은 메뉴 이름, 하위 화면은 가장 가까운 메뉴 이름. */
function pageTitle(pathname: string | null): string {
  if (!pathname) return 'DAWOO ERP'
  if (pathname === '/dashboard') return '대시보드'
  const parts = pathname.split('/').filter(Boolean)
  for (let n = parts.length; n > 0; n--) {
    const item = findMenuItem('/' + parts.slice(0, n).join('/'))
    if (item) return item.name
  }
  return 'DAWOO ERP'
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  /**
   * PC 사이드바 접힘. 예전에는 접어도 본문이 200px 밀린 채라 빈 띠가 생겼고,
   * 새로고침하면 다시 펼쳐졌다. 이 기기에 기억하고 본문 여백도 함께 바꾼다.
   * (첫 화면은 로그인 확인 중 화면이라 서버 렌더와 어긋나지 않는다)
   */
  const [collapsed, setCollapsed] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem(SIDEBAR_KEY) === '1' } catch { return false }
  })
  const toggleCollapsed = () => setCollapsed(prev => {
    const next = !prev
    try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0') } catch { /* 저장 못 해도 이번 화면은 바뀐다 */ }
    return next
  })

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
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <main className={`${collapsed ? 'md:ml-16' : 'md:ml-[200px]'} min-h-screen bg-page`}>
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-border-primary sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-tertiary">
            <Menu size={20} className="text-txt-secondary" />
          </button>
          {/* 지금 어느 화면인지 — 예전에는 늘 "DAWOO ERP"만 보였다 */}
          <span className="text-[14px] font-semibold text-txt-primary">{pageTitle(pathname)}</span>
          <div className="w-9" /> {/* spacer */}
        </div>
        <InstallBanner />
        <div className="px-4 py-4 md:px-8 md:py-6">
          {children}
        </div>
      </main>
      {!UI_HIDDEN.aiAssistant && <AIAssistant />}
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
