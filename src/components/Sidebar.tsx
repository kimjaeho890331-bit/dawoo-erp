'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const menuGroups = [
  {
    name: '지원사업',
    items: [
      { name: '소규모 접수대장', path: '/register/small', icon: '📋' },
      { name: '수도공사 접수대장', path: '/register/water', icon: '📋' },
    ]
  },
  {
    name: '현장',
    items: [
      { name: '현장관리', path: '/sites', icon: '🏗️' },
    ]
  },
  {
    name: '업무',
    items: [
      { name: '업무 캘린더', path: '/calendar/work', icon: '📅' },
      { name: '지출결의서', path: '/expenses', icon: '💳' },
      { name: '연차신청', path: '/leave', icon: '🏖️' },
    ]
  },
  {
    name: '데이터',
    items: [
      { name: '거래처 DB', path: '/vendors', icon: '🤝' },
      { name: 'A/S 관리', path: '/as', icon: '🔧' },
    ]
  },
  {
    name: '세무/회계',
    items: [
      { name: '카드지출 분석', path: '/card-analysis', icon: '💰' },
      { name: '고정지출 관리', path: '/fixed-expenses', icon: '📊' },
    ]
  },
  {
    name: '관리',
    items: [
      { name: '서류함', path: '/documents', icon: '📁' },
      { name: '직원관리', path: '/staff', icon: '👥' },
      { name: '회계달력', path: '/accounting-cal', icon: '🗓️' },
    ]
  },
  {
    name: '분석',
    items: [
      { name: '보고서', path: '/reports', icon: '📈' },
      { name: 'KPI', path: '/kpi', icon: '🎯' },
    ]
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-60'} h-screen bg-gray-900 text-white flex flex-col transition-all duration-200 fixed left-0 top-0 z-30`}>
      {/* 로고 */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        {!collapsed && <span className="font-bold text-lg">DAWOO ERP</span>}
        <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-white text-sm">
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {/* 대시보드 */}
      <Link href="/dashboard" className={`flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-800 ${pathname === '/dashboard' ? 'bg-gray-800 text-white' : 'text-gray-300'}`}>
        <span>🏠</span>
        {!collapsed && <span>대시보드</span>}
      </Link>

      {/* 메뉴 그룹 */}
      <nav className="flex-1 overflow-y-auto">
        {menuGroups.map((group) => (
          <div key={group.name} className="mt-2">
            {!collapsed && (
              <div className="px-4 py-1 text-xs text-gray-500 uppercase tracking-wider">
                {group.name}
              </div>
            )}
            {group.items.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-800 transition-colors ${
                  pathname === item.path || pathname?.startsWith(item.path + '/')
                    ? 'bg-gray-800 text-white border-r-2 border-blue-500'
                    : 'text-gray-300'
                }`}
              >
                <span>{item.icon}</span>
                {!collapsed && <span>{item.name}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* 하단 */}
      <div className="border-t border-gray-700">
        <Link href="/notice" className={`flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-800 ${pathname === '/notice' ? 'bg-gray-800 text-white' : 'text-gray-300'}`}>
          <span>📢</span>
          {!collapsed && <span>공지사항</span>}
        </Link>
        <Link href="/settings" className={`flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-800 ${pathname === '/settings' ? 'bg-gray-800 text-white' : 'text-gray-300'}`}>
          <span>⚙️</span>
          {!collapsed && <span>설정</span>}
        </Link>
      </div>
    </aside>
  )
}