'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { TOAST_EVENT, type ToastPayload } from '@/lib/toast'

/**
 * 글로벌 토스트 컨테이너 — RootLayout에 1번만 마운트
 * 우측 상단 스택 배치
 */
export default function Toaster() {
  const [toasts, setToasts] = useState<ToastPayload[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ToastPayload>).detail
      setToasts(prev => [...prev, detail])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== detail.id))
      }, detail.duration || 5000)
    }
    window.addEventListener(TOAST_EVENT, handler)
    return () => window.removeEventListener(TOAST_EVENT, handler)
  }, [])

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-[400px]">
      {toasts.map(t => {
        const styles =
          t.type === 'success'
            ? 'bg-[#ecfdf5] border-[#a7f3d0] text-[#065f46]'
            : t.type === 'error'
            ? 'bg-[#fef2f2] border-[#fecaca] text-[#991b1b]'
            : 'bg-[#eff6ff] border-[#bfdbfe] text-[#1e40af]'
        const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? AlertCircle : Info
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2 px-4 py-3 rounded-lg border shadow-md animate-slide-in ${styles}`}
            style={{ animation: 'slideInRight 0.2s ease-out' }}
          >
            <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="flex-1 text-[13px] leading-5 whitespace-pre-wrap break-words">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="flex-shrink-0 opacity-60 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
