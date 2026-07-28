'use client'

import { useState, useEffect } from 'react'
import { X, Search, GripVertical, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { validateApprovalLine } from '@/lib/approval/status'
import type { LineRole } from '@/types/approval'

export interface LineDraft {
  staff_id: string
  name: string
  role: LineRole
}

interface StaffRow { id: string; name: string }

interface Props {
  open: boolean
  drafterStaffId: string
  value: LineDraft[]
  onChange: (lines: LineDraft[]) => void
  onClose: () => void
}

export default function ApprovalLineModal({ open, drafterStaffId, value, onChange, onClose }: Props) {
  const [staffList, setStaffList] = useState<StaffRow[]>([])
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<LineDraft[]>(value)
  const [error, setError] = useState<string | null>(null)
  const [syncedValue, setSyncedValue] = useState(value)
  const [syncedOpen, setSyncedOpen] = useState(open)

  // 팝업이 열리거나 부모의 value가 바뀌면 내부 draft를 다시 맞춘다.
  // (렌더링 중 상태 조정 — effect에서 동기적으로 setState하지 않도록)
  if (value !== syncedValue || open !== syncedOpen) {
    setSyncedValue(value)
    setSyncedOpen(open)
    setDraft(value)
  }

  useEffect(() => {
    if (!open) return
    supabase.from('staff').select('id, name').order('name').then(({ data }) => {
      setStaffList((data ?? []) as StaffRow[])
    })
  }, [open])

  if (!open) return null

  const candidates = staffList.filter(
    s => s.id !== drafterStaffId && s.name.includes(keyword) && !draft.some(d => d.staff_id === s.id),
  )

  const add = (role: LineRole) => {
    const s = staffList.find(x => x.id === selected)
    if (!s) return
    setDraft([...draft, { staff_id: s.id, name: s.name, role }])
    setSelected(null)
    setError(null)
  }

  const remove = (staffId: string) => setDraft(draft.filter(d => d.staff_id !== staffId))

  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.length) return
    const next = [...draft]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setDraft(next)
  }

  const apply = () => {
    const err = validateApprovalLine(
      draft.map((d, i) => ({ ...d, seq: i, state: 'waiting' as const })),
      drafterStaffId,
    )
    if (err) { setError(err); return }
    onChange(draft)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <div className="bg-surface w-full max-w-3xl rounded-xl border border-border-primary overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary">
          <span className="text-base font-medium">결재선 설정</span>
          <button onClick={onClose} aria-label="닫기"><X size={18} className="text-txt-tertiary" /></button>
        </div>

        <div className="grid grid-cols-2 gap-4 p-5">
          <div>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary" />
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="이름 검색"
                className="w-full pl-9 pr-3 py-2 text-sm border border-border-primary rounded-lg"
              />
            </div>
            <div className="border border-border-primary rounded-lg h-64 overflow-y-auto">
              {candidates.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className={`w-full text-left px-3 py-2 text-sm ${selected === s.id ? 'bg-surface-secondary' : ''}`}
                >
                  {s.name}
                </button>
              ))}
              {candidates.length === 0 && (
                <div className="px-3 py-4 text-sm text-txt-tertiary">선택할 직원이 없습니다</div>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => add('approval')} disabled={!selected}
                className="flex-1 py-2 text-sm border border-border-primary rounded-lg disabled:opacity-40">결재</button>
              <button onClick={() => add('cooperation')} disabled={!selected}
                className="flex-1 py-2 text-sm border border-border-primary rounded-lg disabled:opacity-40">협조</button>
            </div>
          </div>

          <div>
            <div className="text-sm mb-3 text-txt-secondary">
              아래로 갈수록 상위 결재자입니다. 마지막은 결재 역할이어야 합니다.
            </div>
            <div className="border border-border-primary rounded-lg h-64 overflow-y-auto">
              {draft.map((d, i) => (
                <div key={d.staff_id} className="flex items-center gap-2 px-3 py-2 border-b border-border-primary last:border-0">
                  <button onClick={() => move(i, i - 1)} aria-label="위로">
                    <GripVertical size={14} className="text-txt-tertiary" />
                  </button>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-surface-secondary text-txt-secondary">
                    {d.role === 'approval' ? '결재' : '협조'}
                  </span>
                  <span className="text-sm flex-1">{d.name}</span>
                  <button onClick={() => remove(d.staff_id)} aria-label="삭제">
                    <Trash2 size={14} className="text-txt-tertiary" />
                  </button>
                </div>
              ))}
              {draft.length === 0 && (
                <div className="px-3 py-4 text-sm text-txt-tertiary">왼쪽에서 직원을 골라 추가하세요</div>
              )}
            </div>
            {error && <div className="mt-2 text-sm text-danger">{error}</div>}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border-primary">
          <button onClick={onClose} className="px-5 py-2 text-sm border border-border-primary rounded-lg">취소</button>
          <button onClick={apply} className="px-5 py-2 text-sm rounded-lg bg-accent text-txt-inverse">적용</button>
        </div>
      </div>
    </div>
  )
}
