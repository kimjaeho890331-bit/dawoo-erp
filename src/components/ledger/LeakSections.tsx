'use client'

// 「새는 돈 찾기」 목록 조각들 — 정기지출 줄(필요/해지/줄이기/해지함 + 메모), 접는 상자, 금액 표기.
// 폰에서는 한 항목이 카드처럼 위아래로 쌓이고, PC(md 이상)에서는 표처럼 칸이 맞춰진다.

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { SpendDecision } from '@/types'
import { SOURCE_LABEL, type RecurringItem, type SpendSource } from '@/lib/ledger/leaks'

export function won(n: number): string {
  return `${Math.round(n).toLocaleString()}원`
}

/** '매달 25일쯤' / '3개월마다' */
export function cadenceText(item: Pick<RecurringItem, 'cadence' | 'typicalDay'>): string {
  if (item.cadence > 1) return `${item.cadence}개월마다`
  return item.typicalDay ? `매달 ${item.typicalDay}일쯤` : '매달'
}

/** '2026-10-08' → '26.10.08' (폰에서 한 줄에 들어가게) */
export function shortDate(d: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}` : d
}

export function SourceBadge({ source }: { source: SpendSource }) {
  return (
    <span className="badge shrink-0 bg-surface-secondary text-txt-secondary">{SOURCE_LABEL[source]}</span>
  )
}

/** 접고 펼 수 있는 상자. 제목 줄에 건수·합계를 같이 보여 펼치지 않아도 크기를 안다 */
export function Section({
  title, icon, count, total, hint, defaultOpen = true, children,
}: {
  title: string
  icon: ReactNode
  count?: number
  total?: string
  hint?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="overflow-hidden rounded-[10px] border border-border-primary bg-surface">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-surface-secondary"
      >
        <span className="mt-0.5 text-txt-tertiary">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className="mt-0.5 text-txt-tertiary">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">{title}</span>
            {count !== undefined && <span className="text-[12px] text-txt-tertiary tabular-nums">{count}건</span>}
            {total && <span className="text-[12px] font-medium text-txt-secondary tabular-nums">{total}</span>}
          </span>
          {hint && <span className="mt-0.5 block text-[12px] text-txt-tertiary">{hint}</span>}
        </span>
      </button>
      {open && <div className="border-t border-border-tertiary">{children}</div>}
    </section>
  )
}

/** 비었을 때 상자 안 안내 */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 text-center text-[13px] text-txt-tertiary">{children}</div>
}

/** 긴 목록은 처음 몇 개만 — 「더 보기」로 전부 */
export function useShowMore(limit: number) {
  const [all, setAll] = useState(false)
  return {
    slice: <T,>(xs: T[]) => (all ? xs : xs.slice(0, limit)),
    button: (total: number) => total > limit && (
      <button
        type="button"
        onClick={() => setAll(a => !a)}
        className="w-full border-t border-border-tertiary py-2.5 text-[12px] text-txt-secondary hover:bg-surface-secondary"
      >
        {all ? '접기' : `${total - limit}건 더 보기`}
      </button>
    ),
  }
}

// ---------------- 결정 버튼 ----------------

type Decided = Exclude<SpendDecision, 'unknown'>

export const DECISION_LABEL: Record<SpendDecision, string> = {
  unknown: '검토 전', keep: '필요', cancel: '해지', reduce: '줄이기', cancelled: '해지함',
}

// 결정은 진행 상태라 색을 쓴다(종류가 아니라 상태에만 색 — 디자인 원칙). 모두 기존 색 토큰.
const DECISION_ON: Record<Decided, string> = {
  keep: 'bg-accent-light text-accent-text border-accent',
  cancel: 'bg-danger-bg text-danger border-danger-border',
  reduce: 'bg-caution-bg text-txt-primary border-caution-text',
  cancelled: 'bg-surface-tertiary text-txt-primary border-border-secondary',
}
const DECISION_ORDER: Decided[] = ['keep', 'cancel', 'reduce', 'cancelled']
const DECISION_TITLE: Record<Decided, string> = {
  keep: '꼭 필요한 지출 — 고정지출 목록에 남깁니다',
  cancel: '해지할 것 — 아직 나가고 있음',
  reduce: '요금제·횟수를 줄일 것',
  cancelled: '이미 해지했음 — 월 합계에서 뺍니다',
}

export function DecisionButtons({
  value, onChange, disabled,
}: {
  value: SpendDecision
  onChange: (d: SpendDecision) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-4 gap-1 md:flex md:gap-1" role="group" aria-label="검토 결정">
      {DECISION_ORDER.map(d => {
        const on = value === d
        return (
          <button
            key={d}
            type="button"
            disabled={disabled}
            title={DECISION_TITLE[d]}
            aria-pressed={on}
            // 이미 고른 것을 다시 누르면 「검토 전」으로 되돌린다(잘못 누른 것 취소)
            onClick={() => onChange(on ? 'unknown' : d)}
            className={`min-h-[34px] whitespace-nowrap rounded-md border px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${
              on ? DECISION_ON[d] : 'border-border-primary bg-surface text-txt-secondary hover:bg-surface-secondary'
            }`}
          >
            {DECISION_LABEL[d]}
          </button>
        )
      })}
    </div>
  )
}

// ---------------- 메모 ----------------

/** 평소에는 글자, 누르면 입력칸(입력칸을 늘어놓지 않는다 — 공통 UI 규칙). Enter·바깥 누르면 저장, Esc 취소 */
export function NoteCell({ note, onSave, disabled }: { note: string | null; onSave: (note: string | null) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setDraft(note ?? ''); setEditing(true) }}
        className={`max-w-full truncate text-left text-[12px] ${note ? 'text-txt-secondary' : 'text-txt-quaternary'} hover:text-accent-text disabled:opacity-50`}
      >
        {note || '메모 쓰기'}
      </button>
    )
  }
  const commit = () => {
    setEditing(false)
    const next = draft.trim() || null
    if (next !== (note ?? null)) onSave(next)
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditing(false)
      }}
      placeholder="예: 3월에 해지 전화함"
      aria-label="메모"
      className="input-field w-full text-[12px]"
    />
  )
}

// ---------------- 정기지출 한 줄 ----------------

export interface ReviewState {
  decision: SpendDecision
  note: string | null
}

/** PC 표 머리 — 아래 RecurringRow의 칸과 같은 폭 */
export function RecurringHeader({ amountLabel = '한 달' }: { amountLabel?: string }) {
  return (
    <div className="hidden bg-surface-secondary px-4 py-2 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary md:grid md:grid-cols-[minmax(0,1fr)_120px_130px_268px] md:gap-4">
      <span>어디로 · 언제</span>
      <span className="text-right">{amountLabel}</span>
      <span className="text-right">1년</span>
      <span>결정</span>
    </div>
  )
}

export function RecurringRow({
  item, review, onDecide, onNote, readOnly, extra,
}: {
  item: RecurringItem
  review: ReviewState
  onDecide: (d: SpendDecision) => void
  onNote: (note: string | null) => void
  readOnly?: boolean
  /** 이름 아래 덧붙일 한 줄(금액 오름·끊김 안내 등) */
  extra?: ReactNode
}) {
  return (
    <div className="border-t border-border-tertiary px-4 py-3 first:border-t-0 md:grid md:grid-cols-[minmax(0,1fr)_120px_130px_268px] md:items-center md:gap-4">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <SourceBadge source={item.source} />
          <span className="truncate text-[14px] font-medium text-txt-primary" title={item.label}>{item.label}</span>
        </div>
        <div className="mt-0.5 text-[12px] text-txt-tertiary">
          {cadenceText(item)} · {item.monthsSeen}번 나감 · 최근 {shortDate(item.lastSeen)} {won(item.lastAmount)}
          <span className="hidden sm:inline"> · {item.via.join(', ')}</span>
        </div>
        {extra && <div className="mt-0.5 text-[12px]">{extra}</div>}
        <div className="mt-1 min-w-0">
          {readOnly ? (review.note && <span className="text-[12px] text-txt-secondary">{review.note}</span>) : (
            <NoteCell note={review.note} onSave={onNote} />
          )}
        </div>
      </div>
      <div className="mt-2 flex items-baseline justify-between md:mt-0 md:block md:text-right">
        <span className="text-[12px] text-txt-tertiary md:hidden">한 달</span>
        <span className="text-[14px] font-semibold text-txt-primary tabular-nums">{won(item.monthlyAvg)}</span>
      </div>
      <div className="flex items-baseline justify-between md:block md:text-right">
        <span className="text-[12px] text-txt-tertiary md:hidden">1년</span>
        <span className="text-[13px] text-txt-secondary tabular-nums">{won(item.yearly)}</span>
      </div>
      <div className="mt-2 md:mt-0">
        {readOnly ? (
          <span className="text-[12px] text-txt-secondary">{DECISION_LABEL[review.decision]}</span>
        ) : (
          <DecisionButtons value={review.decision} onChange={onDecide} />
        )}
      </div>
    </div>
  )
}
