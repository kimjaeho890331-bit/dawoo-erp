'use client'
import Sidebar from "@/components/Sidebar"
import AISidebar from "@/components/AISidebar"

export default function ClientLayout({ children }: { children: React.ReactNode }) {
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
