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

export default function ApprovalLineView({ drafterName, drafterActedAt, lines }: Props) {
  return (
    <>
      {/*
        모바일 결재선 — 가로로 늘어놓은 112px 카드는 폰에서 두세 개마다 줄이 바뀌어
        결재 순서가 눈에 들어오지 않는다. 위에서 아래로 흐르는 목록이 순서를 그대로 보여준다.
      */}
      <div className="md:hidden flex flex-col">
        <div className="flex items-center gap-2.5 py-2 border-b border-border-primary">
          <CheckCircle2 size={18} className="text-accent-text shrink-0" />
          <span className="text-sm text-txt-primary">{drafterName}</span>
          <span className="text-xs text-txt-secondary ml-auto">
            기안 {drafterActedAt ? `· ${shortDateTime(drafterActedAt)}` : ''}
          </span>
        </div>
        {lines.map(l => (
          <div key={l.staff_id} className="flex items-center gap-2.5 py-2 border-b border-border-primary last:border-b-0">
            <StateIcon state={l.state ?? 'waiting'} />
            <span className="text-sm text-txt-primary">{l.name}</span>
            <span className="text-xs text-txt-secondary ml-auto">
              {LINE_ROLE_LABEL[l.role]} · {LINE_STATE_LABEL[l.state ?? 'waiting']}
              {l.acted_at ? ` · ${shortDateTime(l.acted_at)}` : ''}
            </span>
          </div>
        ))}
      </div>

      <div className="hidden md:flex flex-wrap gap-2">
      <div className="w-28 border border-border-primary rounded-lg overflow-hidden">
        <div className="bg-surface-secondary text-xs text-center py-1.5 text-txt-secondary border-b border-border-primary">
          기안
        </div>
        <div className="py-3 px-2 text-center">
          <div className="text-sm">{drafterName}</div>
          <div className="text-xs text-txt-tertiary mt-1">
            {drafterActedAt ? new Date(drafterActedAt).toLocaleString('ko-KR') : ' '}
          </div>
        </div>
      </div>

      {lines.map(l => (
        <div key={l.staff_id} className="w-28 border border-border-primary rounded-lg overflow-hidden">
          <div className="bg-surface-secondary text-xs text-center py-1.5 text-txt-secondary border-b border-border-primary">
            {LINE_ROLE_LABEL[l.role]}
          </div>
          <div className="py-3 px-2 text-center">
            <div className="text-sm">{l.name}</div>
            <div className={`text-xs mt-1 ${STATE_COLOR[l.state ?? 'waiting']}`}>
              {LINE_STATE_LABEL[l.state ?? 'waiting']}
            </div>
          </div>
        </div>
      ))}
      </div>
    </>
  )
}
