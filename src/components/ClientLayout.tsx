'use client'
import Sidebar from "@/components/Sidebar"
import AISidebar from "@/components/AISidebar"

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main className="ml-60 min-h-screen p-6">
        {children}
      </main>
      <AISidebar />
    </>
  )
}