'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import SvgIcon from '@/components/common/SvgIcon'
import { findMenuItem } from '@/lib/menu/menuItems'
import { readFavorites, subscribeFavorites, MAX_FAVORITES } from '@/lib/menu/favorites'

/**
 * 모바일 대시보드 맨 위 즐겨찾기 바로가기.
 *
 * 왼쪽 메뉴에서 별을 누른 항목이 여기 올라온다(최대 4개).
 * 지정한 게 없으면 자리만 차지하므로 아무것도 그리지 않는다.
 */
export default function FavoriteShortcuts() {
  // 서버 렌더에는 값이 없다(기기 저장). 화면이 뜬 뒤 읽는다.
  const [paths, setPaths] = useState<string[]>([])

  useEffect(() => {
    const sync = () => setPaths(readFavorites())
    sync()
    return subscribeFavorites(sync)
  }, [])

  // 메뉴에서 사라진 경로(이름이 바뀌었거나 숨겨진 메뉴)는 건너뛴다.
  const items = paths.map(findMenuItem).filter(Boolean).slice(0, MAX_FAVORITES)
  if (items.length === 0) return null

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(item => item && (
        <Link
          key={item.path}
          href={item.path}
          className="bg-surface border border-border-primary rounded-xl px-1.5 py-2.5 flex flex-col items-center gap-1.5 active:bg-surface-secondary transition-colors"
        >
          <SvgIcon d={item.icon} className="w-[18px] h-[18px] text-accent shrink-0" />
          <span className="text-[10.5px] leading-tight text-txt-secondary text-center line-clamp-2">
            {item.name}
          </span>
        </Link>
      ))}
    </div>
  )
}
