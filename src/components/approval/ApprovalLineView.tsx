'use client'

import { CheckCircle2, Circle, XCircle } from 'lucide-react'
import { LINE_ROLE_LABEL, LINE_STATE_LABEL, type LineRole, type LineState } from '@/types/approval'
import { shortDateTime } from '@/lib/approval/statusStyle'

export interface LineCard {
  staff_id: string
  name: string
  role: LineRole
  state?: LineState
  acted_at?: string | null
}

interface Props {
  drafterName: string
  drafterActedAt?: string | null
  lines: LineCard[]
  /**
   * 기안 작성 화면의 기안정보 표 안에 들어갈 때 쓴다. 카드를 작게 줄인다 —
   * 결재선은 이름만 확인하면 되는 정보라 자리를 많이 차지할 이유가 없다.
   * 문서 상세 화면은 결재 이력(시각·상태)을 보는 곳이라 기본 크기를 그대로 쓴다.
   */
  compact?: boolean
}

const STATE_COLOR: Record<LineState, string> = {
  waiting: 'text-txt-tertiary',
  approved: 'text-accent-text',
  rejected: 'text-danger',
}

/** 모바일 결재선의 상태 아이콘. 가로 카드를 세로 목록으로 바꾸면 색만으로는 구분이 약하다. */
function StateIcon({ state }: { state: LineState }) {
  if (state === 'approved') return <CheckCircle2 size={18} className="text-accent-text shrink-0" />
  if (state === 'rejected') return <XCircle size={18} className="text-danger shrink-0" />
  return <Circle size={18} className="text-txt-tertiary shrink-0" />
}

export default function ApprovalLineView({ drafterName, drafterActedAt, lines, compact }: Props) {
  const cardCls = compact
    ? 'w-24 overflow-hidden rounded-lg border border-border-primary bg-surface'
    : 'w-32 overflow-hidden rounded-lg border border-border-primary bg-surface'
  const headCls = compact
    ? 'border-b border-border-primary bg-surface-secondary py-1 text-center text-label'
    : 'border-b border-border-primary bg-surface-secondary py-2 text-center text-label'
  const bodyCls = compact ? 'px-2 py-2 text-center' : 'px-3 py-4 text-center'

  return (
    <>
      {/*
        모바일 결재선 — 가로로 늘어놓은 112px 카드는 폰에서 두세 개마다 줄이 바뀌어
        결재 순서가 눈에 들어오지 않는다. 위에서 아래로 흐르는 목록이 순서를 그대로 보여준다.
      */}
      <div className="flex flex-col rounded-lg border border-border-primary bg-surface px-5 py-2 md:hidden">
        <div className="flex items-center gap-3 border-b border-border-primary py-3">
          <CheckCircle2 size={18} className="shrink-0 text-accent-text" />
          <span className="text-[13px] font-medium text-txt-primary">{drafterName}</span>
          <span className="ml-auto text-[12px] text-txt-secondary">
            기안 {drafterActedAt ? `· ${shortDateTime(drafterActedAt)}` : ''}
          </span>
        </div>
        {lines.map(l => (
          <div key={l.staff_id} className="flex items-center gap-3 border-b border-border-primary py-3 last:border-b-0">
            <StateIcon state={l.state ?? 'waiting'} />
            <span className="text-[13px] font-medium text-txt-primary">{l.name}</span>
            <span className="ml-auto text-[12px] text-txt-secondary">
              {LINE_ROLE_LABEL[l.role]} · {LINE_STATE_LABEL[l.state ?? 'waiting']}
              {l.acted_at ? ` · ${shortDateTime(l.acted_at)}` : ''}
            </span>
          </div>
        ))}
      </div>

      <div className={`hidden flex-wrap md:flex ${compact ? 'gap-2' : 'gap-3'}`}>
      <div className={cardCls}>
        <div className={headCls}>
          기안
        </div>
        <div className={bodyCls}>
          <div className="text-[13px] font-medium">{drafterName}</div>
          {/* 작게 쓸 때는 기안 시각을 접는다 — 아직 저장 전이라 늘 비어 있다. */}
          {!compact && (
            <div className="mt-1.5 text-[12px] text-txt-tertiary">
              {drafterActedAt ? new Date(drafterActedAt).toLocaleString('ko-KR') : ' '}
            </div>
          )}
        </div>
      </div>

      {lines.map(l => (
        <div key={l.staff_id} className={cardCls}>
          <div className={headCls}>
            {LINE_ROLE_LABEL[l.role]}
          </div>
          <div className={bodyCls}>
            <div className="text-[13px] font-medium">{l.name}</div>
            {!compact && (
              <div className={`mt-1.5 text-[12px] ${STATE_COLOR[l.state ?? 'waiting']}`}>
                {LINE_STATE_LABEL[l.state ?? 'waiting']}
              </div>
            )}
          </div>
        </div>
      ))}
      </div>
    </>
  )
}
