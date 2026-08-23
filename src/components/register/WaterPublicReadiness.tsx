'use client'

import { useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import FileDropZone from '@/components/common/FileDropZone'
import {
  ATTACHMENT_PILL_ITEMS,
  BANKBOOK_FILE_TYPE,
  ESTIMATE_FILE_TYPE,
  ID_CARD_FILE_TYPE,
  LEDGER_FILE_TYPE,
  WRITE_PILL_ITEMS,
  areRequiredPillsReady,
  buildApplicationReadyPatch,
  buildSmsConsentPatch,
  formatReadinessSummary,
  formatRemainingLine,
  isApplicationReadyFlagged,
  isAttachmentPillKey,
  isSmsConsentGiven,
  summarizeReadiness,
  type AttachmentPillKey,
  type ReadinessKey,
  type ReadinessPillKey,
  type WaterPublicEvidence,
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
  meeting: '접수',
  smsConsent: '접수',
  applicationDate: '접수',
  estimate: '접수',
}

const ATTACH_FILE_TYPE: Record<AttachmentPillKey, string> = {
  bankbook: BANKBOOK_FILE_TYPE,
  idCard: ID_CARD_FILE_TYPE,
  ledger: LEDGER_FILE_TYPE,
  estimate: ESTIMATE_FILE_TYPE,
}

const ATTACH_ACCEPT: Record<AttachmentPillKey, string> = {
  bankbook: 'image/*,application/pdf',
  idCard: 'image/*,application/pdf',
  ledger: 'image/*,application/pdf',
  estimate: 'image/*,application/pdf',
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
  selected,
  onClick,
}: {
  label: string
  filled: boolean
  selected?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex items-center h-[22px] px-2.5 rounded-full text-[11px] font-medium tracking-[0.3px] border ${
        filled
          ? 'bg-accent text-txt-inverse border-accent'
          : 'bg-status-construction-bg text-status-construction-text border-status-construction-text/35'
      } ${selected ? 'ring-2 ring-accent/30' : ''}`}
    >
      {label}
    </button>
  )
}

function BankTextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const filled = value.trim() !== ''
  return (
    <div>
      <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || label}
        className={`w-full h-[36px] px-3 border rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 hover:border-border-secondary transition-colors ${
          filled ? 'bg-surface-secondary border-border-secondary' : 'bg-surface border-border-primary'
        }`}
      />
    </div>
  )
}

function ReadinessAttachSlot({
  projectId,
  slot,
  evidence,
  bankName,
  accountHolder,
  accountNumber,
  onBankChange,
}: {
  projectId: string
  slot: AttachmentPillKey
  evidence?: WaterPublicEvidence
  bankName?: string | null
  accountHolder?: string | null
  accountNumber?: string | null
  onBankChange?: (field: 'bank_name' | 'account_holder' | 'account_number', value: string | null) => void
}) {
  const label = ATTACHMENT_PILL_ITEMS.find((item) => item.key === slot)?.label ?? slot
  const hasEstimateRow = evidence?.hasEstimateRow === true
  const ledgerPreviewUrl = evidence?.ledgerPreviewUrl
  const ledgerIssued = (evidence?.ledgerStatuses ?? []).some((status) => status === 'issued' || status === 'confirmed')
  const showLedgerIssued = Boolean(
    evidence?.hasLedgerAttachment || evidence?.hasLedgerDriveFile || ledgerIssued
  )

  return (
    <div className="rounded-lg border border-border-primary bg-surface-secondary/40 p-2.5 space-y-2" data-ready-anchor={slot === 'bankbook' ? 'bankbook' : undefined}>
      <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">{label}</p>

      {slot === 'estimate' && hasEstimateRow && (
        <p className="text-[11px] font-medium tracking-[0.3px] text-txt-secondary">ERP 견적 있음</p>
      )}

      {slot === 'ledger' && ledgerPreviewUrl && (
        <a
          href={ledgerPreviewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium tracking-[0.3px] text-txt-secondary hover:text-txt-primary"
        >
          <ExternalLink size={12} className="text-txt-tertiary" />
          대장 미리보기
        </a>
      )}

      {slot === 'ledger' && !ledgerPreviewUrl && showLedgerIssued && (
        <p className="text-[11px] font-medium tracking-[0.3px] text-txt-secondary">대장 발급됨</p>
      )}

      {slot === 'bankbook' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          <FileDropZone
            projectId={projectId}
            fileType={ATTACH_FILE_TYPE[slot]}
            accept={ATTACH_ACCEPT[slot]}
            label={`${label} 파일을 드래그하거나 클릭`}
            compact
          />
          <div className="grid grid-cols-3 sm:grid-cols-1 gap-2">
            <BankTextInput
              label="은행"
              value={bankName ?? ''}
              placeholder="국민은행"
              onChange={(v) => onBankChange?.('bank_name', v || null)}
            />
            <BankTextInput
              label="예금주"
              value={accountHolder ?? ''}
              onChange={(v) => onBankChange?.('account_holder', v || null)}
            />
            <BankTextInput
              label="계좌번호"
              value={accountNumber ?? ''}
              onChange={(v) => onBankChange?.('account_number', v || null)}
            />
          </div>
        </div>
      ) : (
        <FileDropZone
          projectId={projectId}
          fileType={ATTACH_FILE_TYPE[slot]}
          accept={ATTACH_ACCEPT[slot]}
          label={`${label} 파일을 드래그하거나 클릭`}
          compact
        />
      )}
    </div>
  )
}

/** 오른쪽 패널 준비 블록. 첨부(업로드) + 작성(스크롤). */
export function WaterPublicReadyBlock({
  projectId,
  checks,
  evidence,
  extraFields,
  bankName,
  accountHolder,
  accountNumber,
  onBankChange,
  onMarkReady,
  markingReady = false,
  onPillClick,
}: {
  projectId: string
  checks: WaterPublicReadinessChecks
  evidence?: WaterPublicEvidence
  extraFields?: unknown
  bankName?: string | null
  accountHolder?: string | null
  accountNumber?: string | null
  onBankChange?: (field: 'bank_name' | 'account_holder' | 'account_number', value: string | null) => void
  onMarkReady?: () => void
  markingReady?: boolean
  onPillClick?: (key: ReadinessPillKey) => void
}) {
  const [openSlot, setOpenSlot] = useState<AttachmentPillKey | null>(
    checks?.bankbook ? null : 'bankbook'
  )
  const summary = summarizeReadiness(checks)
  const ready = areRequiredPillsReady(checks)
  const flagged = isApplicationReadyFlagged(extraFields)
  const remainingLine = formatRemainingLine(summary.remainingLabels)

  const handlePillClick = (key: ReadinessPillKey) => {
    if (isAttachmentPillKey(key)) {
      setOpenSlot((prev) => (prev === key ? null : key))
      if (key === 'estimate' && evidence?.hasEstimateRow) {
        onPillClick?.(key)
      }
      return
    }
    setOpenSlot(null)
    onPillClick?.(key)
  }

  return (
    <div className="rounded-[10px] border border-border-primary bg-surface px-4 py-3 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold tracking-[-0.2px] text-txt-primary">준비</h3>
        <p className="text-[13px] font-medium text-txt-secondary tabular-nums">
          {formatReadinessSummary(summary)}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1.5">첨부</p>
          <div className="flex flex-wrap gap-1.5">
            {ATTACHMENT_PILL_ITEMS.map((item) => (
              <ReadyPill
                key={item.key}
                label={item.label}
                filled={checks?.[item.key] === true}
                selected={openSlot === item.key}
                onClick={() => handlePillClick(item.key)}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1.5">작성</p>
          <div className="flex flex-wrap gap-1.5">
            {WRITE_PILL_ITEMS.map((item) => (
              <ReadyPill
                key={item.key}
                label={item.label}
                filled={checks?.[item.key] === true}
                onClick={() => handlePillClick(item.key)}
              />
            ))}
          </div>
        </div>
      </div>

      {openSlot && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenSlot(null)}
            className="absolute top-2 right-2 z-10 w-6 h-6 inline-flex items-center justify-center rounded-md text-txt-tertiary hover:text-txt-secondary hover:bg-surface-tertiary"
            aria-label="닫기"
          >
            <X size={14} className="text-txt-tertiary" />
          </button>
          <ReadinessAttachSlot
            projectId={projectId}
            slot={openSlot}
            evidence={evidence}
            bankName={bankName}
            accountHolder={accountHolder}
            accountNumber={accountNumber}
            onBankChange={onBankChange}
          />
        </div>
      )}

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
      {ready && remainingLine && (
        <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">
          {remainingLine}
        </p>
      )}
    </div>
  )
}
