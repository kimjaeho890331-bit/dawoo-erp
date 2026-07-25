'use client'

import { useState, useEffect } from 'react'
import { Download, X, HelpCircle } from 'lucide-react'

// beforeinstallprompt는 표준 DOM 타입에 없어 직접 선언한다.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// layout.tsx의 <head> 인라인 스크립트가 채워두는 값.
// React보다 먼저 실행돼 크롬 신호를 놓치지 않는다.
interface InstallState {
  event: BeforeInstallPromptEvent | null
  fired: boolean
  at: number | null
}
declare global {
  interface Window {
    __dawooInstall?: InstallState
  }
}

const DISMISS_KEY = 'dawoo_install_dismissed'

// 크롬이 설치 신호를 안 줄 때, 이 시간이 지나면 수동 설치 안내로 넘어간다.
const FALLBACK_DELAY_MS = 4000

type Mode = 'hidden' | 'prompt' | 'manual'

export default function InstallBanner() {
  const [mode, setMode] = useState<Mode>('hidden')
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    // 이미 설치돼 실행 중이거나 사용자가 닫은 적이 있으면 아무것도 하지 않는다.
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (localStorage.getItem(DISMISS_KEY) === '1') return

    let timer: ReturnType<typeof setTimeout> | undefined

    const sync = () => {
      if (window.__dawooInstall?.event) {
        setMode('prompt')
        if (timer) clearTimeout(timer)
        return true
      }
      return false
    }

    const onDone = () => setMode('hidden')

    window.addEventListener('dawoo:installready', sync)
    window.addEventListener('dawoo:installdone', onDone)

    // 이미 신호가 와 있으면 즉시 반영, 아니면 잠시 기다렸다가 수동 안내로.
    if (!sync()) {
      timer = setTimeout(() => setMode('manual'), FALLBACK_DELAY_MS)
    }

    return () => {
      window.removeEventListener('dawoo:installready', sync)
      window.removeEventListener('dawoo:installdone', onDone)
      if (timer) clearTimeout(timer)
    }
  }, [])

  const install = async () => {
    const e = window.__dawooInstall?.event
    if (!e) return
    await e.prompt()
    await e.userChoice
    if (window.__dawooInstall) window.__dawooInstall.event = null
    setMode('hidden')
  }

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setMode('hidden')
  }

  if (mode === 'hidden') return null

  return (
    <div className="md:hidden mx-4 mt-3 rounded-xl border border-border-accent bg-surface p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-[20px] font-semibold text-white">
          D
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-txt-primary">앱으로 설치</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-txt-secondary">
            홈 화면에 추가하면 주소창 없이 열립니다
          </p>
        </div>
        {mode === 'prompt' ? (
          <button
            onClick={install}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent-hover"
          >
            <Download size={14} />
            설치
          </button>
        ) : (
          <button
            onClick={() => setShowHelp(v => !v)}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border-primary px-3 py-2 text-[12px] font-medium text-txt-secondary hover:bg-surface-tertiary"
          >
            <HelpCircle size={14} />
            방법
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="설치 안내 닫기"
          className="shrink-0 text-txt-quaternary hover:text-txt-secondary"
        >
          <X size={16} />
        </button>
      </div>

      {mode === 'manual' && showHelp && (
        <div className="mt-3 border-t border-border-tertiary pt-3">
          <ol className="space-y-1.5 text-[11.5px] leading-relaxed text-txt-secondary">
            <li>1. 크롬 오른쪽 위 점 세 개(⋮)를 누릅니다</li>
            <li>2. &lsquo;앱 설치&rsquo; 또는 &lsquo;홈 화면에 추가&rsquo;를 선택합니다</li>
            <li>3. 설치를 누르면 앱 서랍에 아이콘이 생깁니다</li>
          </ol>
          <p className="mt-2 text-[10.5px] leading-relaxed text-txt-quaternary">
            메뉴에 해당 항목이 없다면 크롬을 완전히 종료했다가 다시 열어보세요.
          </p>
        </div>
      )}
    </div>
  )
}
