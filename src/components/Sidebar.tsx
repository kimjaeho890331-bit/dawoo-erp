'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const menuGroups = [
  {
    name: '지원사업',
    items: [
      { name: '소규모 접수대장', path: '/register/small', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      { name: '수도공사 접수대장', path: '/register/water', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    ]
  },
  {
    name: '현장',
    items: [
      { name: '현장관리', path: '/sites', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    ]
  },
  {
    name: '업무',
    items: [
      { name: '업무 캘린더', path: '/calendar/work', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
      { name: '지출결의서', path: '/expenses', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
      { name: '연차신청', path: '/leave', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    ]
  },
  {
    name: '데이터',
    items: [
      { name: '거래처 DB', path: '/vendors', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      { name: 'A/S 관리', path: '/as', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    ]
  },
  {
    name: '세무/회계',
    items: [
      { name: '회계달력', path: '/accounting-cal', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    ]
  },
  {
    name: '관리',
    items: [
      { name: '서류함', path: '/documents', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
      { name: '직원관리', path: '/staff', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    ]
  },
  {
    name: '분석',
    items: [
      { name: '보고서', path: '/reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { name: 'KPI', path: '/kpi', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
    ]
  },
]

const bottomItems = [
  { name: '공지사항', path: '/notice', icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z' },
  { name: '설정', path: '/settings', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
]

function SvgIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className || 'w-[18px] h-[18px]'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + '/')

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      )}

      <aside className={`
        fixed top-0 left-0 h-full z-50
        transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
        ${collapsed ? 'w-16' : 'w-[240px]'}
        bg-sidebar text-txt-inverse flex flex-col
      `}>
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="md:hidden absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 z-10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 로고 */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/[0.08]">
          {!collapsed && (
            <span className="text-[15px] font-semibold tracking-[-0.3px] text-white">DAWOO ERP</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex w-7 h-7 items-center justify-center rounded-md text-txt-quaternary hover:text-white hover:bg-sidebar-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              {collapsed
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              }
            </svg>
          </button>
        </div>

        {/* 대시보드 */}
        <Link
          href="/dashboard"
          onClick={onClose}
          className={`flex items-center gap-3 mx-2 mt-2 px-3 py-2 rounded-lg text-[13px] transition-colors ${
            isActive('/dashboard')
              ? 'bg-sidebar-hover text-white'
              : 'text-txt-quaternary hover:text-white hover:bg-sidebar-hover'
          }`}
        >
          <SvgIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          {!collapsed && <span>대시보드</span>}
        </Link>

        {/* 메뉴 그룹 */}
        <nav className="flex-1 overflow-y-auto mt-1 px-2">
          {menuGroups.map((group) => (
            <div key={group.name} className="mt-4 first:mt-2">
              {!collapsed && (
                <div className="px-3 mb-1 text-[11px] font-medium text-txt-quaternary uppercase tracking-[0.5px]">
                  {group.name}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.path)
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={onClose}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors relative ${
                        active
                          ? 'bg-sidebar-hover text-white'
                          : 'text-txt-quaternary hover:text-white hover:bg-sidebar-hover'
                      }`}
                    >
                      {active && (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-accent rounded-l" />
                      )}
                      <SvgIcon d={item.icon} className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-white' : ''}`} />
                      {!collapsed && <span className={active ? 'font-medium' : ''}>{item.name}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* 하단 */}
        <div className="border-t border-white/[0.08] px-2 py-2 space-y-0.5">
          {bottomItems.map(item => (
            <Link
              key={item.path}
              href={item.path}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                isActive(item.path)
                  ? 'bg-sidebar-hover text-white'
                  : 'text-txt-quaternary hover:text-white hover:bg-sidebar-hover'
              }`}
            >
              <SvgIcon d={item.icon} />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          ))}
        </div>
      </aside>
    </>
  )
}
