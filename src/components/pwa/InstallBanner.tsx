'use client'

import { useState, useEffect } from 'react'
import { Download, X, ExternalLink, HelpCircle } from 'lucide-react'
import { detectEnvironment, chromeIntentUrl, type PwaEnvironment } from '@/lib/pwa/environment'

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

// 닫기는 영구가 아니라 기한제다. 예전 키(dawoo_install_dismissed)는
// 한 번 닫으면 영영 안 떠서 설치할 방법이 사라졌다. 키 이름을 바꿔
// 기존에 저장된 영구 차단은 자동으로 무효가 된다.
const HIDE_UNTIL_KEY = 'dawoo_install_hide_until'
const HIDE_DAYS = 7

// 크롬이 설치 신호를 안 주면 이 시간 뒤에 대체 안내로 넘어간다.
const FALLBACK_DELAY_MS = 4000

// ready   = 크롬이 신호를 줌. 버튼 한 번으로 바로 설치된다.
// inapp   = 내장 브라우저. 설치가 불가능하니 크롬으로 내보낸다.
// manual  = 설치 가능한 브라우저인데 신호가 없음. 메뉴로 안내한다.
type Mode = 'hidden' | 'ready' | 'inapp' | 'manual'

export default function InstallBanner() {
  const [mode, setMode] = useState<Mode>('hidden')
  const [env, setEnv] = useState<PwaEnvironment | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [swActive, setSwActive] = useState<boolean | null>(null)

  useEffect(() => {
    const environment = detectEnvironment()
    if (environment.isStandalone) return                       // 이미 앱으로 실행 중
    const hideUntil = Number(localStorage.getItem(HIDE_UNTIL_KEY) || 0)
    if (hideUntil > Date.now()) return

    // 진단용 — 워커가 실제로 붙었는지 사용자에게 보여준다.
    navigator.serviceWorker?.getRegistration().then(r => setSwActive(!!r?.active))

    // 상태 변경은 전부 타이머·이벤트 콜백에서 한다.
    // effect 본문에서 동기적으로 setState하면 연쇄 렌더가 된다.
    const decide = () => {
      setEnv(environment)
      if (window.__dawooInstall?.event) setMode('ready')
      else if (environment.browser === 'inapp') setMode('inapp')
      else setMode('manual')
    }

    // 내장 브라우저는 신호가 올 수 없는 환경이라 기다리지 않는다.
    // 그 외에는 늦게 오는 신호를 놓치지 않도록 잠시 기다렸다 판단한다.
    const timer = setTimeout(decide, environment.browser === 'inapp' ? 0 : FALLBACK_DELAY_MS)

    const onReady = () => {
      clearTimeout(timer)
      setEnv(environment)
      setMode('ready')
    }
    const onDone = () => setMode('hidden')

    window.addEventListener('dawoo:installready', onReady)
    window.addEventListener('dawoo:installdone', onDone)

    return () => {
      window.removeEventListener('dawoo:installready', onReady)
      window.removeEventListener('dawoo:installdone', onDone)
      clearTimeout(timer)
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
    localStorage.setItem(HIDE_UNTIL_KEY, String(Date.now() + HIDE_DAYS * 86400000))
    setMode('hidden')
  }

  if (mode === 'hidden' || !env) return null

  const headline = mode === 'inapp' ? '크롬에서 열어주세요' : '앱으로 설치'
  const subline =
    mode === 'inapp'
      ? `${env.inAppName ?? '이 브라우저'}에서는 앱 설치가 안 됩니다`
      : '홈 화면에 추가하면 주소창 없이 열립니다'

  return (
    <div className="md:hidden mx-4 mt-3 rounded-xl border border-border-accent bg-surface p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-[20px] font-semibold text-white">
          D
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-txt-primary">{headline}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-txt-secondary">{subline}</p>
        </div>

        {mode === 'ready' && (
          <button
            onClick={install}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent-hover"
          >
            <Download size={14} />
            설치
          </button>
        )}
        {mode === 'inapp' && (
          <a
            href={chromeIntentUrl(window.location.href)}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent-hover"
          >
            <ExternalLink size={14} />
            크롬으로
          </a>
        )}
        {mode === 'manual' && (
          <button
            onClick={() => setShowDetail(v => !v)}
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

      {mode === 'inapp' && (
        <p className="mt-2.5 border-t border-border-tertiary pt-2.5 text-[11px] leading-relaxed text-txt-secondary">
          위 버튼이 안 되면, 오른쪽 위 메뉴에서 &lsquo;다른 브라우저로 열기&rsquo;를 선택해 크롬을 고르세요.
        </p>
      )}

      {mode === 'manual' && showDetail && (
        <div className="mt-3 border-t border-border-tertiary pt-3">
          <ol className="space-y-1.5 text-[11.5px] leading-relaxed text-txt-secondary">
            <li>1. 오른쪽 위 점 세 개(⋮)를 누릅니다</li>
            <li>2. &lsquo;앱 설치&rsquo; 또는 &lsquo;홈 화면에 추가&rsquo;를 선택합니다</li>
            <li>3. 설치를 누르면 앱 서랍에 아이콘이 생깁니다</li>
          </ol>
          <p className="mt-2.5 text-[10.5px] leading-relaxed text-txt-quaternary">
            상태 · {env.browser === 'samsung' ? '삼성 인터넷' : env.browser === 'chrome' ? '크롬 계열' : '기타 브라우저'}
            {' · '}워커 {swActive === null ? '확인 중' : swActive ? '정상' : '없음'}
            {' · '}설치신호 {window.__dawooInstall?.fired ? '수신' : '없음'}
          </p>
        </div>
      )}
    </div>
  )
}
