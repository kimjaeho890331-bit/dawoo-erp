'use client'

import { useState } from 'react'
import Link from 'next/link'
import { HelpCircle, ArrowRight } from 'lucide-react'
import type { BriefingItem as BriefingItemType } from '@/types'

interface Props {
  item: BriefingItemType
}

const CATEGORY_STYLES: Record<string, { bar: string; bg: string }> = {
  now: { bar: 'bg-[#dc2626]', bg: 'hover:bg-[#fef2f2]' },
  today: { bar: 'bg-[#d97706]', bg: 'hover:bg-[#fffbeb]' },
  week: { bar: 'bg-[#059669]', bg: 'hover:bg-[#ecfdf5]' },
}

export default function BriefingItem({ item }: Props) {
  const [showReason, setShowReason] = useState(false)
  const style = CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES.week
  const content = (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg transition-colors ${style.bg}`}>
      <div className={`w-1 self-stretch rounded-full shrink-0 ${style.bar}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-txt-primary leading-snug">{item.title}</div>
        {showReason && (
          <div className="mt-1.5 text-[11px] text-txt-tertiary leading-relaxed border-l border-border-tertiary pl-2">
            {item.reason}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setShowReason(v => !v)
        }}
        className="shrink-0 mt-0.5 text-txt-quaternary hover:text-txt-secondary"
        aria-label="근거 보기"
      >
        <HelpCircle size={14} />
      </button>
      {item.actionHref && (
        <ArrowRight size={14} className="shrink-0 mt-0.5 text-txt-quaternary" />
      )}
    </div>
  )

  if (item.actionHref) {
    return (
      <Link href={item.actionHref} className="block">
        {content}
      </Link>
    )
  }
  return content
}
