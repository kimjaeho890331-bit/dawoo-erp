'use client'

import { useState } from 'react'
import { Bell, Smartphone, UserRound } from 'lucide-react'
import InstallPanel from '@/components/pwa/InstallPanel'
import PushToggle from '@/components/settings/PushToggle'
import AccountLink from '@/components/settings/AccountLink'

/**
 * 설정 — 실제로 동작하는 것만 둔다.
 *
 * 예전에는 회사 정보, 알림 스위치 8개, 기본 연도·페이지당 건수·보고서 시각 칸과
 * "저장" 버튼이 있었다. 하지만 그 값은 이 브라우저에만 저장되고 어디서도 읽지 않아서,
 * 바꿔도 아무 일도 일어나지 않았다. 직원이 켜고 끈 줄 알고 기다리게 되므로 뺐다.
 * 남은 셋(내 계정 연결·알림·앱 설치)은 각자 누르는 즉시 저장된다.
 *
 * 「알림」 탭은 예전 이름이 「결재 알림」이었다. 연차·대시보드 지시 알림도 같은 구독으로
 * 오게 되면서 이름을 넓혔다.
 *
 * 「내 계정 연결」을 맨 앞에 둔다. 직원관리 화면이 "설정 > 내 계정 연결"로 안내하는데
 * 예전에는 「시스템」 탭 안쪽에 숨어 있었다.
 */
const TABS = [
  { key: 'account', label: '내 계정 연결', icon: UserRound },
  { key: 'notification', label: '알림', icon: Bell },
  { key: 'app', label: '앱 설치', icon: Smartphone },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>('account')

  return (
    <div className="max-w-[900px] mx-auto space-y-5">
      <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">설정</h1>

      {/* 폰에서는 탭이 위로 가로로 놓인다. 예전에는 왼쪽 탭이 200px 고정이라 폰에서 내용 폭이 100px 남짓이었다. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-5">
        <div className="flex gap-1 overflow-x-auto md:w-[200px] md:shrink-0 md:flex-col md:space-y-1 md:gap-0">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-4 text-[13px] transition text-left md:min-h-10 md:w-full ${
                  tab === t.key
                    ? 'bg-accent-light text-accent-text font-semibold'
                    : 'text-txt-secondary hover:bg-surface-tertiary'
                }`}>
                <Icon size={16} className={tab === t.key ? 'text-accent-text' : 'text-txt-tertiary'} />
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="min-w-0 flex-1">
          {tab === 'account' && (
            <section>
              <h2 className="text-sm font-medium mb-2 text-txt-primary">내 계정 연결</h2>
              <AccountLink />
            </section>
          )}
          {tab === 'notification' && (
            <section>
              <h2 className="text-sm font-medium mb-2 text-txt-primary">휴대폰 알림</h2>
              <PushToggle />
            </section>
          )}
          {/* 앱 설치 — 배너를 닫았더라도 여기서는 항상 설치할 수 있다 */}
          {tab === 'app' && <InstallPanel />}
        </div>
      </div>
    </div>
  )
}
