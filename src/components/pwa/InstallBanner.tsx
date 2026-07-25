'use client'

import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

// beforeinstallprompt는 표준 DOM 타입에 없어 직접 선언한다.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'dawoo_install_dismissed'

export default function InstallBanner() {
  // 이벤트가 오기 전에는 null이라 아무것도 렌더되지 않는다.
  // 별도의 dismissed 상태가 필요 없는 이유.
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // 이미 설치돼 실행 중이거나 사용자가 닫은 적이 있으면 구독하지 않는다.
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (localStorage.getItem(DISMISS_KEY) === '1') return

    const onPrompt = (e: Event) => {
      e.preventDefault()  // 크롬 기본 배너를 막고 우리 배너를 쓴다
      setPromptEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setPromptEvent(null)

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    await promptEvent.userChoice
    setPromptEvent(null)
  }

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setPromptEvent(null)
  }

  // 이벤트가 오지 않으면(설치 불가 환경) 아무것도 렌더하지 않는다.
  if (!promptEvent) return null

  return (
    <div className="md:hidden mx-4 mt-3 flex items-center gap-3 rounded-xl border border-border-accent bg-surface p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-[20px] font-semibold text-white">
        D
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-txt-primary">앱으로 설치</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-txt-secondary">
          홈 화면에 추가하면 주소창 없이 열립니다
        </p>
      </div>
      <button
        onClick={install}
        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent-hover"
      >
        <Download size={14} />
        설치
      </button>
      <button
        onClick={dismiss}
        aria-label="설치 안내 닫기"
        className="shrink-0 text-txt-quaternary hover:text-txt-secondary"
      >
        <X size={16} />
      </button>
    </div>
  )
}
