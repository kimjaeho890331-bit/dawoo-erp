'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { HIDDEN_MENU_PATHS, UI_HIDDEN } from '@/lib/uiHidden'
import { canSeeLedger } from '@/lib/ledgerAccess'
import { isKimJaehoStaffId } from '@/lib/mySitesAccess'
import { canSeePrivateIds, PRIVATE_IDS_PATH } from '@/lib/credentialAccess'
import { MENU_GROUPS, BOTTOM_ITEMS } from '@/lib/menu/menuItems'
import SvgIcon from '@/components/common/SvgIcon'
import { readFavorites, toggleFavorite, subscribeFavorites, MAX_FAVORITES } from '@/lib/menu/favorites'
import { toast } from '@/lib/toast'


/**
 * 메뉴 오른쪽 끝 별. 채워져 있으면 즐겨찾기다.
 * 링크 안이 아니라 옆에 두어, 눌러도 페이지가 바뀌지 않는다.
 *
 * 폰(md 미만)에서만 보인다. 즐겨찾기는 모바일 대시보드 맨 위에만 뜨므로
 * PC에서는 지정해도 쓸 데가 없다 — 사이드바가 두 화면 공용이라 별도로 막는다.
 */
function FavoriteStar({ path, name, on, onToggle }: {
  path: string
  name: string
  on: boolean
  onToggle: (path: string) => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(path) }}
      aria-pressed={on}
      aria-label={`${name} 즐겨찾기 ${on ? '해제' : '추가'}`}
      title={on ? '즐겨찾기 해제' : '즐겨찾기 추가'}
      className="md:hidden shrink-0 mr-1 p-1 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.08)]"
    >
      <svg
        className="w-[15px] h-[15px]"
        viewBox="0 0 24 24"
        fill={on ? '#e2a33f' : 'none'}
        stroke={on ? '#e2a33f' : '#87867f'}
        strokeWidth={1.6}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.56.56 0 011.04 0l2.13 4.32c.08.17.24.28.42.31l4.77.69a.56.56 0 01.31.96l-3.45 3.36a.56.56 0 00-.16.5l.81 4.75a.56.56 0 01-.81.59l-4.27-2.24a.56.56 0 00-.52 0l-4.27 2.24a.56.56 0 01-.81-.59l.81-4.75a.56.56 0 00-.16-.5L3.87 9.78a.56.56 0 01.31-.96l4.77-.69a.56.56 0 00.42-.31L11.48 3.5z" />
      </svg>
    </button>
  )
}

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [ledgerOk, setLedgerOk] = useState(false)
  const [mySitesOk, setMySitesOk] = useState(false)
  const [privateIdsOk, setPrivateIdsOk] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const id = localStorage.getItem('dawoo_current_staff_id')
      if (!id) {
        if (!cancelled) {
          setLedgerOk(false)
          setMySitesOk(false)
          setPrivateIdsOk(false)
        }
        return
      }
      if (!cancelled) setMySitesOk(isKimJaehoStaffId(id))
      const { data } = await supabase.from('staff').select('role').eq('id', id).maybeSingle()
      if (!cancelled) {
        setLedgerOk(canSeeLedger(data?.role))
        setPrivateIdsOk(canSeePrivateIds(data?.role))
      }
    })()
    return () => { cancelled = true }
  }, [pathname])

  // 즐겨찾기는 이 기기에만 저장된다. 서버 렌더에는 값이 없으므로
  // 빈 배열로 시작하고, 화면이 뜬 뒤 읽어온다(다른 탭 변경도 따라간다).
  const [favorites, setFavorites] = useState<string[]>([])
  useEffect(() => {
    const sync = () => setFavorites(readFavorites())
    sync()
    return subscribeFavorites(sync)
  }, [])

  const handleToggleFavorite = (path: string) => {
    const result = toggleFavorite(path)
    if (!result.ok) {
      toast.info(`즐겨찾기는 ${MAX_FAVORITES}개까지입니다. 하나를 빼고 다시 눌러주세요.`)
      return
    }
    setFavorites(result.favorites)
  }

  const hiddenPaths = new Set<string>(HIDDEN_MENU_PATHS)
  const visibleGroups = MENU_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (hiddenPaths.has(item.path)) return false
        if (item.path === '/ledger' && !ledgerOk) return false
        if (item.path === '/my-sites' && !mySitesOk) return false
        if (item.path === PRIVATE_IDS_PATH && !privateIdsOk) return false
        return true
      }),
    }))
    .filter((group) => group.items.length > 0)

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
        ${collapsed ? 'w-16' : 'w-[200px]'}
        bg-sidebar text-txt-inverse flex flex-col
      `}>
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="md:hidden absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[rgba(255,255,255,0.06)] text-[#87867f] hover:text-[#e8e6dc] z-10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 로고 */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/[0.08]">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#c96442] flex items-center justify-center">
                <span className="text-white text-[12px] font-bold">D</span>
              </div>
              <span className="text-[15px] font-semibold tracking-[-0.3px] text-[#e8e6dc]">DAWOO ERP</span>
            </div>
          )}
          {collapsed && (
            <div className="w-7 h-7 rounded-lg bg-[#c96442] flex items-center justify-center mx-auto">
              <span className="text-white text-[12px] font-bold">D</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex w-7 h-7 items-center justify-center rounded-md text-[#87867f] hover:text-[#e8e6dc] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
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
              ? 'bg-[rgba(201,100,66,0.12)] text-[#c96442]'
              : 'text-[#b0aea5] hover:text-[#e8e6dc] hover:bg-[rgba(255,255,255,0.06)]'
          }`}
        >
          <SvgIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          {!collapsed && <span>대시보드</span>}
        </Link>

        {!UI_HIDDEN.aiAssistant && (
          <button
            type="button"
            onClick={() => { onClose(); window.dispatchEvent(new Event('dawoo:open-ai')) }}
            className="flex items-center gap-3 mx-2 mt-1 px-3 py-2 rounded-lg text-[13px] text-left transition-colors text-[#b0aea5] hover:text-[#e8e6dc] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer"
          >
            <SvgIcon d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            {!collapsed && <span>AI 비서</span>}
          </button>
        )}

        {/* 메뉴 그룹 */}
        <nav className="flex-1 overflow-y-auto mt-1 px-2">
          {visibleGroups.map((group) => (
            <div key={group.name || group.items[0]?.path} className="mt-4 first:mt-2">
              {!collapsed && !group.hideHeading && group.name && (
                <div className="px-3 mb-1 text-[11px] font-medium text-[#87867f] uppercase tracking-[0.5px]">
                  {group.name}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.path)
                  const isDot = item.name === '.'
                  return (
                    <div key={item.path} className="relative flex items-center">
                      <Link
                        href={item.path}
                        onClick={onClose}
                        className={`flex flex-1 min-w-0 items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                          active
                            ? 'bg-[rgba(201,100,66,0.12)] text-[#c96442]'
                            : 'text-[#b0aea5] hover:text-[#e8e6dc] hover:bg-[rgba(255,255,255,0.06)]'
                        }`}
                      >
                        {active && (
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-[#c96442] rounded-l" />
                        )}
                        {isDot ? (
                          <span className={active ? 'font-medium' : ''}>.</span>
                        ) : (
                          <>
                            <SvgIcon d={item.icon} className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-[#c96442]' : ''}`} />
                            {!collapsed && <span className={`truncate ${active ? 'font-medium' : ''}`}>{item.name}</span>}
                          </>
                        )}
                      </Link>
                      {/* 별은 링크 바깥에 둔다 — 안에 넣으면 누를 때 페이지까지 이동한다.
                          접은 사이드바와 숨은 '.' 항목에는 달지 않는다. */}
                      {!collapsed && !isDot && (
                        <FavoriteStar
                          path={item.path}
                          name={item.name}
                          on={favorites.includes(item.path)}
                          onToggle={handleToggleFavorite}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* 하단 */}
        <div className="border-t border-white/[0.08] px-2 py-2 space-y-0.5">
          {BOTTOM_ITEMS.map(item => (
            <div key={item.path} className="flex items-center">
              <Link
                href={item.path}
                onClick={onClose}
                className={`flex flex-1 min-w-0 items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  isActive(item.path)
                    ? 'bg-[rgba(201,100,66,0.12)] text-[#c96442]'
                    : 'text-[#b0aea5] hover:text-[#e8e6dc] hover:bg-[rgba(255,255,255,0.06)]'
                }`}
              >
                <SvgIcon d={item.icon} />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </Link>
              {!collapsed && (
                <FavoriteStar
                  path={item.path}
                  name={item.name}
                  on={favorites.includes(item.path)}
                  onToggle={handleToggleFavorite}
                />
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
