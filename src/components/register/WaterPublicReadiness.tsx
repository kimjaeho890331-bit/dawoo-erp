'use client'

import { Check, Square } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  HUMAN_READINESS_ITEMS,
  SYSTEM_READINESS_ITEMS,
  buildApplicationReadyPatch,
  buildSmsConsentPatch,
  canLightApplicationReady,
  isApplicationReadyFlagged,
  isSmsConsentGiven,
  type ReadinessKey,
  type WaterPublicReadinessChecks,
} from '@/lib/register/waterPublicReadiness'

const READINESS_ITEMS = [...HUMAN_READINESS_ITEMS, ...SYSTEM_READINESS_ITEMS]
const SYSTEM_KEYS = new Set<ReadinessKey>(SYSTEM_READINESS_ITEMS.map((item) => item.key))

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

function ReadinessTick({
  checked,
  label,
  system,
}: {
  checked: boolean
  label: string
  system?: boolean
}) {
  const Icon = checked ? Check : Square
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium tracking-[0.3px]"
      title={system ? '시스템 확인 (직접 체크하지 않음)' : undefined}
    >
      <span
        className={`inline-flex w-3.5 h-3.5 items-center justify-center rounded-[3px] border ${
          checked
            ? 'bg-accent border-accent text-txt-inverse'
            : 'bg-surface border-border-secondary text-txt-quaternary'
        }`}
      >
        <Icon size={10} strokeWidth={2.5} className="text-inherit" />
      </span>
      <span className={checked ? 'text-txt-secondary' : 'text-txt-tertiary'}>{label}</span>
    </span>
  )
}

/** 목록 행용. 사람 칸이 비었을 때만 「빈 N」. */
export function WaterPublicEmptyCount({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">빈 {count}</span>
  )
}

/** 접수 탭 한 단계의 채워짐 + 5단계에서만 「신청서 만들자」. */
export function WaterPublicStepReadiness({
  stepKeys,
  checks,
  extraFields,
  showApplicationReady = false,
  onMarkReady,
  markingReady = false,
}: {
  stepKeys: readonly ReadinessKey[]
  checks: WaterPublicReadinessChecks
  extraFields?: unknown
  showApplicationReady?: boolean
  onMarkReady?: () => void
  markingReady?: boolean
}) {
  const keySet = new Set<ReadinessKey>(stepKeys)
  const items = READINESS_ITEMS.filter((item) => keySet.has(item.key))
  const lit = canLightApplicationReady(checks)
  const flagged = isApplicationReadyFlagged(extraFields)

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {items.map((item) => (
        <ReadinessTick
          key={item.key}
          checked={checks[item.key]}
          label={item.label}
          system={SYSTEM_KEYS.has(item.key)}
        />
      ))}
      {showApplicationReady && lit && onMarkReady && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMarkReady() }}
          disabled={markingReady}
          className={`badge ${
            flagged
              ? 'bg-status-approved-bg text-status-approved-text'
              : 'bg-accent text-txt-inverse'
          } disabled:opacity-50`}
        >
          {markingReady ? '저장 중...' : flagged ? '신청서 만들자 · 신호됨' : '신청서 만들자'}
        </button>
      )}
    </div>
  )
}
