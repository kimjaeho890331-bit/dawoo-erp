'use client'

import type { AreaGroup } from '@/lib/building/areaGroups'

/**
 * 전유면적 (세대별) 묶음 표시.
 * 신규등록 모달과 상세 기본정보가 같은 모양을 쓰도록 한 곳에 둔다.
 */
export default function AreaGroupChips({ groups, emptyText }: {
  groups: AreaGroup[]
  /** 묶음이 없을 때 보여줄 안내. 생략하면 아무것도 그리지 않는다 */
  emptyText?: string
}) {
  if (groups.length === 0) {
    if (!emptyText) return null
    return <p className="text-[10px] text-txt-quaternary">{emptyText}</p>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {groups.map(g => (
        <span
          key={g.area}
          className="px-2 py-0.5 rounded border border-border-tertiary bg-surface-tertiary text-[11px] font-medium text-txt-secondary"
        >
          {g.area}m² x {g.count}세대
        </span>
      ))}
    </div>
  )
}
