'use client'

import { Sparkles } from 'lucide-react'
import BriefingItem from './BriefingItem'
import type { BriefingItem as BriefingItemType, BriefingCategory } from '@/types'

interface Props {
  items: BriefingItemType[]
  summary: string
  loading: boolean
}

// 칸막이를 없애고 상황 우선순위순으로 한 칸에 흐르게 정렬
const CATEGORY_WEIGHT: Record<BriefingCategory, number> = { now: 0, today: 1, week: 2 }

export default function AIBriefingCard({ items, summary, loading }: Props) {
  const sorted = [...items].sort((a, b) => {
    const w = (CATEGORY_WEIGHT[a.category] ?? 9) - (CATEGORY_WEIGHT[b.category] ?? 9)
    return w !== 0 ? w : a.priority - b.priority
  })

  return (
    <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden h-full flex flex-col">
      {/* 헤더 */}
      <div className="px-5 py-4 border-b border-border-tertiary bg-gradient-to-r from-[#eff6ff] to-transparent">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#2563eb]" />
          <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">AI 브리핑</h2>
        </div>
        <p className="text-[13px] text-txt-secondary mt-1 leading-snug">
          {loading ? '분석 중...' : summary}
        </p>
      </div>

      {/* 상황별 제안 — 한 칸 자유 흐름 */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="text-center py-10 text-txt-quaternary text-[13px]">상황 분석 중...</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-10 text-txt-quaternary text-[13px]">지금 챙길 일이 없습니다</div>
        ) : (
          <div className="space-y-1">
            {sorted.map(item => (
              <BriefingItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
