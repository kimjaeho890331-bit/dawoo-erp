'use client'

import { Check, Square } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  HUMAN_READINESS_ITEMS,
  SYSTEM_READINESS_ITEMS,
  WATER_PUBLIC_JUNGGONG_LABEL,
  WATER_PUBLIC_STATUS_FLOW,
  buildApplicationReadyPatch,
  buildSmsConsentPatch,
  canLightApplicationReady,
  isApplicationReadyFlagged,
  isSmsConsentGiven,
  mapWaterPublicStatus,
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

function ReadinessTick({
  checked,
  label,
  system,
  onToggle,
}: {
  checked: boolean
  label: string
  system?: boolean
  onToggle?: () => void
}) {
  const Icon = checked ? Check : Square
  const body = (
    <>
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
    </>
  )

  if (onToggle) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        className="inline-flex items-center gap-1 text-[11px] font-medium tracking-[0.3px]"
      >
        {body}
      </button>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium tracking-[0.3px]"
      title={system ? '시스템 확인 (직접 체크하지 않음)' : undefined}
    >
      {body}
    </span>
  )
}

export function WaterPublicStatusFlow({
  status,
  compact = false,
}: {
  status: string | null | undefined
  compact?: boolean
}) {
  const mapped = mapWaterPublicStatus(status)
  if (!mapped.inFlow) {
    return null
  }

  const steps: string[] = [...WATER_PUBLIC_STATUS_FLOW]
  if (mapped.showJunggong) steps.push(WATER_PUBLIC_JUNGGONG_LABEL)

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-0.5' : 'gap-1'}`}>
      {steps.map((step, idx) => {
        const isJunggong = step === WATER_PUBLIC_JUNGGONG_LABEL
        const reached = isJunggong ? mapped.showJunggong : idx <= mapped.flowIndex
        const current = isJunggong ? mapped.showJunggong : idx === mapped.flowIndex
        return (
          <span key={step} className="inline-flex items-center gap-0.5">
            <span
              className={`badge ${
                current
                  ? 'bg-accent-light text-accent'
                  : reached
                    ? 'bg-status-approved-bg text-status-approved-text'
                    : 'bg-surface-secondary text-txt-tertiary'
              }`}
            >
              {step}
            </span>
            {idx < steps.length - 1 && (
              <span className="text-[10px] text-txt-quaternary">-</span>
            )}
          </span>
        )
      })}
    </div>
  )
}

export function WaterPublicReadinessBar({
  checks,
  extraFields,
  compact = false,
  onMarkReady,
  markingReady = false,
  onToggleSmsConsent,
}: {
  checks: WaterPublicReadinessChecks
  extraFields?: unknown
  compact?: boolean
  onMarkReady?: () => void
  markingReady?: boolean
  onToggleSmsConsent?: () => void
}) {
  const lit = canLightApplicationReady(checks)
  const flagged = isApplicationReadyFlagged(extraFields)

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-x-2 gap-y-1' : 'gap-x-2.5 gap-y-1.5'}`}>
      {HUMAN_READINESS_ITEMS.map((item) => (
        <ReadinessTick
          key={item.key}
          checked={checks[item.key]}
          label={item.label}
          onToggle={item.key === 'smsConsent' ? onToggleSmsConsent : undefined}
        />
      ))}
      <span className="w-px h-3 bg-border-primary" />
      {SYSTEM_READINESS_ITEMS.map((item) => (
        <ReadinessTick key={item.key} checked={checks[item.key]} label={item.label} system />
      ))}
      {lit && onMarkReady && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMarkReady() }}
          disabled={markingReady}
          className={`ml-1 badge ${
            flagged
              ? 'bg-status-approved-bg text-status-approved-text'
              : 'bg-accent text-txt-inverse'
          } disabled:opacity-50`}
        >
          {markingReady ? '저장 중...' : flagged ? '신청서 만들자 · 신호됨' : '신청서 만들자'}
        </button>
      )}
      {lit && !onMarkReady && (
        <span className={`ml-1 badge ${flagged ? 'bg-status-approved-bg text-status-approved-text' : 'bg-accent text-txt-inverse'}`}>
          {flagged ? '신청서 만들자 · 신호됨' : '신청서 만들자'}
        </span>
      )}
    </div>
  )
}
