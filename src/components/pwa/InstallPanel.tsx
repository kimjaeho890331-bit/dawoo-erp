'use client'

import { useState, useEffect } from 'react'
import { Download, ExternalLink, Check, RefreshCw } from 'lucide-react'
import { detectEnvironment, chromeIntentUrl, type PwaEnvironment } from '@/lib/pwa/environment'

// window.__dawooInstall 타입은 InstallBanner.tsx에서 전역 선언한다.

// 배너를 닫아도 여기서는 항상 설치할 수 있어야 한다.
// 배너 하나에만 의존하면 한 번 닫았을 때 설치 경로가 사라진다.
export default function InstallPanel() {
  const [env, setEnv] = useState<PwaEnvironment | null>(null)
  const [ready, setReady] = useState(false)
  const [swActive, setSwActive] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const environment = detectEnvironment()

    navigator.serviceWorker?.getRegistration().then(r => setSwActive(!!r?.active))

    const settle = () => {
      setEnv(environment)
      setReady(!!window.__dawooInstall?.event)
      setChecking(false)
    }
    const onReady = () => {
      setEnv(environment)
      setReady(true)
      setChecking(false)
    }

    // 신호가 늦게 올 수 있으니 잠시 기다렸다 판단한다.
    const timer = setTimeout(settle, environment.browser === 'inapp' ? 0 : 3000)
    window.addEventListener('dawoo:installready', onReady)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('dawoo:installready', onReady)
    }
  }, [])

  const install = async () => {
    const e = window.__dawooInstall?.event
    if (!e) return
    await e.prompt()
    await e.userChoice
    if (window.__dawooInstall) window.__dawooInstall.event = null
    setReady(false)
  }

  if (!env) {
    return (
      <div className="bg-surface rounded-[10px] border border-border-primary px-6 py-5 text-[13px] text-txt-tertiary">
        확인 중...
      </div>
    )
  }

  if (env.isStandalone) {
    return (
      <div className="bg-surface rounded-[10px] border border-border-primary px-6 py-5 flex items-center gap-3">
        <Check size={18} className="text-txt-tertiary shrink-0" />
        <div>
          <p className="text-[14px] font-medium text-txt-primary">이미 앱으로 실행 중입니다</p>
          <p className="text-[12px] text-txt-tertiary mt-0.5">추가로 설치할 것이 없습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
      <div className="px-6 py-4 border-b border-border-tertiary">
        <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">앱 설치</h2>
        <p className="text-[12px] text-txt-tertiary mt-0.5">
          홈 화면에 추가하면 주소창 없이 전체화면으로 열립니다
        </p>
      </div>

      <div className="px-6 py-5 space-y-4">
        {env.browser === 'inapp' && (
          <>
            <p className="text-[13px] leading-relaxed text-txt-secondary">
              지금 {env.inAppName ?? '내장 브라우저'}로 보고 계십니다. 이 브라우저는 앱 설치를 지원하지
              않습니다. 크롬으로 열어야 설치할 수 있습니다.
            </p>
            <a
              href={chromeIntentUrl(typeof window !== 'undefined' ? window.location.origin + '/settings' : '')}
              className="inline-flex items-center gap-1.5 h-[36px] px-5 bg-accent hover:bg-accent-hover text-white rounded-lg text-[13px] font-medium transition"
            >
              <ExternalLink size={14} />
              크롬으로 열기
            </a>
            <p className="text-[12px] leading-relaxed text-txt-tertiary">
              버튼이 안 되면 오른쪽 위 메뉴에서 &lsquo;다른 브라우저로 열기&rsquo;를 선택하세요.
            </p>
          </>
        )}

        {env.browser !== 'inapp' && ready && (
          <>
            <p className="text-[13px] leading-relaxed text-txt-secondary">
              설치 준비가 됐습니다. 아래 버튼을 누르면 바로 설치됩니다.
            </p>
            <button
              onClick={install}
              className="inline-flex items-center gap-1.5 h-[36px] px-5 bg-accent hover:bg-accent-hover text-white rounded-lg text-[13px] font-medium transition"
            >
              <Download size={14} />
              지금 설치
            </button>
          </>
        )}

        {env.browser !== 'inapp' && !ready && (
          <>
            <p className="text-[13px] leading-relaxed text-txt-secondary">
              {checking
                ? '설치 가능 여부를 확인하는 중입니다...'
                : '브라우저가 아직 설치 준비를 마치지 않았습니다. 아래 방법으로 직접 설치할 수 있습니다.'}
            </p>
            {!checking && (
              <ol className="space-y-1.5 text-[13px] leading-relaxed text-txt-secondary">
                <li>1. 브라우저 오른쪽 위 점 세 개(⋮)를 누릅니다</li>
                <li>2. &lsquo;앱 설치&rsquo; 또는 &lsquo;홈 화면에 추가&rsquo;를 선택합니다</li>
                <li>3. 설치를 누르면 앱 서랍에 아이콘이 생깁니다</li>
              </ol>
            )}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 h-[36px] px-4 border border-border-primary rounded-lg text-[13px] text-txt-secondary hover:bg-surface-tertiary transition"
            >
              <RefreshCw size={14} />
              다시 확인
            </button>
          </>
        )}

        <div className="pt-3 border-t border-border-tertiary">
          <p className="text-[11.5px] leading-relaxed text-txt-quaternary">
            브라우저 {env.browser === 'samsung' ? '삼성 인터넷' : env.browser === 'inapp' ? (env.inAppName ?? '내장') : env.browser === 'chrome' ? '크롬 계열' : '기타'}
            {' · '}워커 {swActive === null ? '확인 중' : swActive ? '정상' : '없음'}
            {' · '}설치신호 {ready ? '수신' : '없음'}
          </p>
        </div>
      </div>
    </div>
  )
}
