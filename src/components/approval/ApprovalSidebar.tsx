'use client'

import Link from 'next/link'
import { PenLine } from 'lucide-react'
import ActorPicker, { type ActorStaff } from './ActorPicker'

export type BoxKey =
  | 'draft' | 'submitted' | 'completed'
  | 'toApprove' | 'inProgress' | 'myRejected' | 'myCompleted'
  | 'ledger'

export const BOXES: { group: string; items: { key: BoxKey; label: string }[] }[] = [
  { group: '기안함', items: [
    { key: 'draft', label: '작성중' },
    { key: 'submitted', label: '상신' },
    { key: 'completed', label: '완료' },
  ]},
  { group: '결재함', items: [
    { key: 'toApprove', label: '결재전' },
    { key: 'inProgress', label: '진행중' },
    { key: 'myRejected', label: '반려된' },
    { key: 'myCompleted', label: '완료된' },
  ]},
  { group: '문서대장', items: [{ key: 'ledger', label: '전체' }] },
]

export const BOX_META = BOXES.flatMap(g => g.items.map(it => ({ ...it, group: g.group })))

interface Props {
  actorId: string | null
  staffList: ActorStaff[]
  onActorChange: (id: string) => void
  actorLoading: boolean
  pendingCount: number
  /**
   * 목록 화면에서만 넘긴다. 넘기면 항목이 버튼이 되어 그 자리에서 문서함을 바꾼다.
   * 넘기지 않으면(기안작성 등 다른 화면) 링크가 되어 목록으로 이동한다 —
   * 그 화면에는 바꿀 목록이 없기 때문이다.
   */
  box?: BoxKey
  onSelectBox?: (key: BoxKey) => void
}

// 문서함 이름은 매일 훑는 글자라 흐리면 눈이 피로하다. 기본도 진한 회색으로 둔다.
const itemCls = (active: boolean) =>
  `flex w-full items-center px-4 py-2.5 text-[13px] ${
    active
      ? 'bg-surface-secondary font-semibold text-txt-primary'
      : 'text-txt-primary/85 hover:bg-surface-tertiary'
  }`

/**
 * 지출결의서 왼쪽 문서함 사이드바.
 *
 * 목록 화면과 기안작성 화면이 함께 쓴다 — 기안작성으로 들어갔을 때 문서함 목록이
 * 사라지면 어디에 있었는지 잃어버리고, 돌아가려면 뒤로가기밖에 없다.
 */
export default function ApprovalSidebar({
  actorId, staffList, onActorChange, actorLoading, pendingCount, box, onSelectBox,
}: Props) {
  const badge = (key: BoxKey) =>
    key === 'toApprove' && pendingCount > 0 ? (
      <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] leading-none text-txt-inverse">
        {pendingCount}
      </span>
    ) : null

  return (
    <aside className="hidden w-44 shrink-0 border-r border-border-primary bg-surface py-8 md:block">
      <div className="mx-4 mb-5">
        <ActorPicker
          actorId={actorId}
          staffList={staffList}
          onChange={onActorChange}
          loading={actorLoading}
          compact
        />
      </div>
      <Link
        href="/approval/new"
        className="mx-4 mb-8 flex h-9 items-center justify-center gap-2 rounded-lg border border-border-primary text-sm text-txt-primary hover:bg-surface-secondary"
      >
        <PenLine size={14} className="text-txt-tertiary" /> 기안작성
      </Link>
      {BOXES.map((g, gi) => (
        // 기안함·결재함·문서대장은 성격이 다른 묶음이라 경계가 보여야 한다.
        // 그룹 이름을 진하게 쓰고, 두 번째 묶음부터 위에 구분선을 둔다.
        <div key={g.group} className={gi === 0 ? 'mb-5' : 'mt-5 mb-5 border-t border-border-primary pt-5'}>
          <div className="mb-2 px-4 text-[11px] font-semibold tracking-[0.3px] text-txt-secondary">
            {g.group}
          </div>
          {g.items.map(it =>
            onSelectBox ? (
              <button key={it.key} onClick={() => onSelectBox(it.key)} className={itemCls(box === it.key)}>
                {it.label}
                {badge(it.key)}
              </button>
            ) : (
              <Link key={it.key} href={`/approval?box=${it.key}`} className={itemCls(false)}>
                {it.label}
                {badge(it.key)}
              </Link>
            ),
          )}
        </div>
      ))}
    </aside>
  )
}
