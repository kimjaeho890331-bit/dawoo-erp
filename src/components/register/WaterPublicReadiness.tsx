'use client'

import { supabase } from '@/lib/supabase'
import {
  READINESS_PILL_ITEMS,
  buildApplicationReadyPatch,
  buildSmsConsentPatch,
  formatReadinessSummary,
  formatRemainingLine,
  isApplicationReadyFlagged,
  isSmsConsentGiven,
  summarizeReadiness,
  type ReadinessKey,
  type ReadinessPillKey,
  type WaterPublicReadinessChecks,
} from '@/lib/register/waterPublicReadiness'

export async function persistApplicationReady(projectId: string, extraFields: unknown) {
  const extra_fields = buildApplicationReadyPatch(extraFields, new Date().toISOString())
  const { error } = await supabase.from('projects').update({ extra_fields }).eq('id', projectId)
  if (error) throw error
}

export async function persistSmsConsent(projectId: string, extraFields: unknown, consented: boolean) {
  const extra_fields = buildSmsConsentPatch(extraFields, consented)
  const { error } = await supabase.from('projects').update({ extra_fields }).eq('id', projectId)
  if (error) throw error
}

export async function toggleSmsConsent(projectId: string, extraFields: unknown) {
  await persistSmsConsent(projectId, extraFields, !isSmsConsentGiven(extraFields))
}

export const READINESS_PILL_TAB: Partial<Record<ReadinessKey, '접수' | '승인(시공)'>> = {
  bank: '접수',
  bankbook: '접수',
  estimate: '접수',
  meeting: '접수',
  smsConsent: '접수',
  applicationDate: '접수',
}

export function scrollToReadinessAnchor(key: ReadinessKey) {
  const el = document.querySelector<HTMLElement>(`[data-ready-anchor="${key}"]`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.setAttribute('data-ready-flash', '1')
  window.setTimeout(() => {
    el.removeAttribute('data-ready-flash')
  }, 1200)
}

/** 목록 행용. 남은 칸이 있을 때만 「남 N」. */
export function WaterPublicEmptyCount({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="text-[11px] font-medium tracking-[0.3px] text-status-construction-text">
      남 {count}
    </span>
  )
}

function ReadyPill({
  label,
  filled,
  onClick,
}: {
  label: string
  filled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center h-[22px] px-2.5 rounded-full text-[11px] font-medium tracking-[0.3px] border ${
        filled
          ? 'bg-accent text-txt-inverse border-accent'
          : 'bg-status-construction-bg text-status-construction-text border-[#fdba74]'
      }`}
    >
      {label}
    </button>
  )
}

/** 오른쪽 패널 준비 블록. 필 + 요약이 유일한 준비도 UI. */
export function WaterPublicReadyBlock({
  checks,
  extraFields,
  onMarkReady,
  markingReady = false,
  onPillClick,
}: {
  checks: WaterPublicReadinessChecks
  extraFields?: unknown
  onMarkReady?: () => void
  markingReady?: boolean
  onPillClick?: (key: ReadinessPillKey) => void
}) {
  const summary = summarizeReadiness(checks)
  const ready = summary.remaining === 0
  const flagged = isApplicationReadyFlagged(extraFields)
  const remainingLine = formatRemainingLine(summary.remainingLabels)

  return (
    <div className="rounded-[10px] border border-border-primary bg-surface px-4 py-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold tracking-[-0.2px] text-txt-primary">준비</h3>
        <p className="text-[13px] font-medium text-txt-secondary tabular-nums">
          {formatReadinessSummary(summary)}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {READINESS_PILL_ITEMS.map((item) => (
          <ReadyPill
            key={item.key}
            label={item.label}
            filled={checks[item.key]}
            onClick={() => onPillClick?.(item.key)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (ready) onMarkReady?.() }}
        disabled={!ready || !onMarkReady || markingReady}
        className={`badge ${
          !ready
            ? 'bg-surface-secondary text-txt-tertiary border border-border-primary opacity-60 cursor-not-allowed'
            : flagged
              ? 'bg-status-approved-bg text-status-approved-text'
              : 'bg-accent text-txt-inverse'
        }`}
      >
        {markingReady ? '저장 중...' : flagged && ready ? '신청서 만들자 · 신호됨' : '신청서 만들자'}
      </button>
      {!ready && remainingLine && (
        <p className="text-[11px] font-medium tracking-[0.3px] text-status-construction-text">
          {remainingLine}
        </p>
      )}
    </div>
  )
}
