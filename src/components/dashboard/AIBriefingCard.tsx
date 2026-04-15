'use client'

import { Sparkles, AlertTriangle, Clock, Lightbulb } from 'lucide-react'
import BriefingItem from './BriefingItem'
import type { BriefingItem as BriefingItemType, BriefingCategory } from '@/types'

interface Props {
  items: BriefingItemType[]
  summary: string
  loading: boolean
}

const CATEGORIES: { key: BriefingCategory; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'now', label: '지금 당장', icon: <AlertTriangle size={14} />, color: 'text-[#dc2626]' },
  { key: 'today', label: '오늘 안에', icon: <Clock size={14} />, color: 'text-[#d97706]' },
  { key: 'week', label: '이번 주', icon: <Lightbulb size={14} />, color: 'text-[#059669]' },
]

export default function AIBriefingCard({ items, summary, loading }: Props) {
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

      {/* 카테고리별 리스트 */}
      <div className="divide-y divide-border-tertiary flex-1 overflow-y-auto">
        {CATEGORIES.map(cat => {
          const catItems = items.filter(i => i.category === cat.key)
          return (
            <div key={cat.key} className="px-4 py-3">
              <div className="flex items-center gap-1.5 px-1 mb-1.5">
                <span className={cat.color}>{cat.icon}</span>
                <span className="text-[12px] font-semibold text-txt-secondary">{cat.label}</span>
                <span className="text-[11px] text-txt-tertiary">({catItems.length})</span>
              </div>
              {catItems.length === 0 ? (
                <div className="text-center py-4 text-txt-quaternary text-[12px]">
                  {cat.key === 'now' && '긴급 항목 없음'}
                  {cat.key === 'today' && '오늘 안에 처리할 항목 없음'}
                  {cat.key === 'week' && '이번 주 예정 없음'}
                </div>
              ) : (
                <div className="space-y-1">
                  {catItems.slice(0, 5).map(item => (
                    <BriefingItem key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
