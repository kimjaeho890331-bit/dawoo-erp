'use client'

import { LINE_ROLE_LABEL, LINE_STATE_LABEL, type LineRole, type LineState } from '@/types/approval'

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
  approved: 'text-blue-600',
  rejected: 'text-red-600',
}

export default function ApprovalLineView({ drafterName, drafterActedAt, lines }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
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
  )
}
