'use client'

import { useState } from 'react'
import { Sparkles, ArrowRight, RefreshCw, ChevronDown, FileBarChart } from 'lucide-react'
import BriefingItem from './BriefingItem'
import { openAI } from '@/lib/openAI'
import type { BriefingItem as BriefingItemType, BriefingCategory, BriefingAction, WeeklyReport } from '@/types'

interface Props {
  items: BriefingItemType[]
  summary: string
  narrative?: string
  actions?: BriefingAction[]
  loading: boolean
  onRefresh?: () => void
  weeklyReport?: WeeklyReport | null
  weeklyOpenDefault?: boolean
}

// 칸막이를 없애고 상황 우선순위순으로 한 칸에 흐르게 정렬
const CATEGORY_WEIGHT: Record<BriefingCategory, number> = { now: 0, today: 1, week: 2 }

export default function AIBriefingCard({ items, summary, narrative, actions, loading, onRefresh, weeklyReport, weeklyOpenDefault }: Props) {
  const sorted = [...items].sort((a, b) => {
    const w = (CATEGORY_WEIGHT[a.category] ?? 9) - (CATEGORY_WEIGHT[b.category] ?? 9)
    return w !== 0 ? w : a.priority - b.priority
  })
  const headline = narrative || summary

  return (
    <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden h-full flex flex-col">
      {/* 헤더 — AI 서술 브리핑 */}
      <div className="px-5 py-4 border-b border-border-tertiary bg-gradient-to-r from-accent-light to-transparent">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">AI 브리핑</h2>
          {onRefresh && (
            <button onClick={onRefresh} disabled={loading} className="ml-auto text-txt-quaternary hover:text-accent transition-colors cursor-pointer disabled:opacity-40" title="브리핑 새로고침" aria-label="브리핑 새로고침">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
        <p className="text-[13px] text-txt-secondary mt-1 leading-relaxed whitespace-pre-line">
          {loading ? 'AI가 오늘 상황을 정리하는 중...' : headline}
        </p>
        {/* 오늘 챙길 일 — 클릭하면 AI 비서가 처리 */}
        {!loading && actions && actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={() => openAI(a.query)}
                className="group inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface border border-border-secondary text-[12px] text-txt-primary font-medium hover:border-border-accent hover:text-accent transition-colors cursor-pointer"
                title={a.query}
              >
                {a.label}
                <ArrowRight size={12} className="text-txt-quaternary group-hover:text-accent" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 상황별 제안 — 한 칸 자유 흐름 (+ 월요일 주간 보고서) */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {weeklyReport && <WeeklyReportPanel report={weeklyReport} defaultOpen={weeklyOpenDefault} />}
        {loading ? (
          <div className="text-center py-8 text-txt-quaternary text-[13px]">상황 분석 중...</div>
        ) : sorted.length === 0 ? (
          !weeklyReport && <div className="text-center py-8 text-txt-quaternary text-[13px]">지금 챙길 일이 없습니다</div>
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

// ===== 주간 보고서 패널 (지난주 vs 지지난주) =====
function fmtWon(w: number): string {
  if (!w) return '0'
  if (w >= 100000000) { const e = w / 100000000; return `${e % 1 === 0 ? e : e.toFixed(1)}억` }
  return `${Math.round(w / 10000).toLocaleString()}만`
}

function DeltaTag({ n }: { n: number }) {
  if (n > 0) return <span className="text-[11px]" style={{ color: '#1a7f4b' }}>▲{n}</span>
  if (n < 0) return <span className="text-[11px] text-txt-tertiary">▽{Math.abs(n)}</span>
  return <span className="text-[11px] text-txt-tertiary">—</span>
}

function ReportSection({ title, color, items }: { title: string; color: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <span className="text-[12px] font-semibold text-txt-secondary">{title}</span>
      </div>
      <ul className="space-y-0.5 pl-3">
        {items.map((t, i) => (
          <li key={i} className="text-[12px] text-txt-primary leading-snug flex gap-1.5">
            <span className="text-txt-quaternary">·</span><span className="flex-1">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WeeklyReportPanel({ report, defaultOpen }: { report: WeeklyReport; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const { lw, wb } = report
  const hasDetail = report.goodPoints.length + report.problems.length + report.improvements.length > 0

  return (
    <div className="rounded-lg border border-border-secondary bg-surface-secondary overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-surface-tertiary transition-colors cursor-pointer"
      >
        <FileBarChart size={14} className="text-accent shrink-0" />
        <span className="text-[13px] font-semibold text-txt-primary">주간 보고서</span>
        <span className="text-[11px] text-txt-tertiary">지난주 vs 지지난주</span>
        <ChevronDown size={15} className={`ml-auto text-txt-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-border-tertiary">
          {/* 총평 */}
          <p className="text-[12.5px] text-txt-secondary leading-relaxed mt-2">{report.summary}</p>

          {/* 숫자 비교 */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-txt-secondary">
            <span>접수 <b className="text-txt-primary">{lw.intake}</b> <span className="text-txt-tertiary">vs {wb.intake}</span> <DeltaTag n={lw.intake - wb.intake} /></span>
            <span>수주액 <b className="text-txt-primary">{fmtWon(lw.amount)}</b> <span className="text-txt-tertiary">vs {fmtWon(wb.amount)}</span></span>
            <span>입금 <b className="text-txt-primary">{lw.paid}</b> <span className="text-txt-tertiary">vs {wb.paid}</span> <DeltaTag n={lw.paid - wb.paid} /></span>
          </div>

          {/* 잘한 점 / 문제점 / 보완점 */}
          {hasDetail ? (
            <div className="space-y-2">
              <ReportSection title="잘한 점" color="#1a7f4b" items={report.goodPoints} />
              <ReportSection title="문제점" color="#d97706" items={report.problems} />
              <ReportSection title="보완점" color="#2563eb" items={report.improvements} />
            </div>
          ) : (
            <p className="text-[11px] text-txt-quaternary">상세 분석 생성 실패 — 숫자만 표시</p>
          )}
        </div>
      )}
    </div>
  )
}
