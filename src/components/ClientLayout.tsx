'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import Sidebar from "@/components/Sidebar"
import Toaster from "@/components/common/Toaster"
import { AuthProvider, useAuth } from "@/components/AuthProvider"
import { Menu } from 'lucide-react'

const AISidebar = dynamic(() => import("@/components/AISidebar"), { ssr: false })

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (pathname === '/login') return <>{children}</>

  return (
    <>
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-page">
          <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
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
        <div className="px-4 py-4 md:px-8 md:py-6">
          {children}
        </div>
      </main>
      <AISidebar />
      <Toaster />
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
