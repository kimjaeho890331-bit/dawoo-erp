'use client'

import { useState, useEffect } from 'react'
import { X, Search, ChevronUp, ChevronDown, Trash2 } from 'lucide-react'
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

  const add = (staffId: string, role: LineRole) => {
    const s = staffList.find(x => x.id === staffId)
    if (!s) return
    setDraft([...draft, { staff_id: s.id, name: s.name, role }])
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
    // 모바일에서는 아래에서 올라오는 시트. 고정폭 가운데 모달은 폰에서 화면 밖으로 나간다.
    // 높이 단위로 dvh를 쓰는 이유는 모바일 브라우저 주소창이 접혔다 펴질 때 vh가 튀기 때문이다.
    <div className="fixed inset-0 bg-black/45 flex items-end justify-center z-50 md:items-center md:p-4">
      <div className="bg-surface w-full max-w-3xl max-h-[85dvh] overflow-y-auto rounded-t-xl border border-border-primary md:max-h-none md:overflow-hidden md:rounded-xl">
        <div className="flex items-center justify-between px-4 py-4 border-b border-border-primary md:px-5">
          <span className="text-base font-medium">결재선 설정</span>
          <button onClick={onClose} aria-label="닫기" className="-mr-2 w-11 h-11 flex items-center justify-center md:w-auto md:h-auto md:mr-0">
            <X size={18} className="text-txt-tertiary" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 md:p-5">
          <div>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary" />
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="이름 검색"
                className="w-full h-11 pl-9 pr-3 text-base border border-border-primary rounded-lg md:h-auto md:py-2 md:text-sm"
              />
            </div>
            <div className="border border-border-primary rounded-lg h-52 overflow-y-auto md:h-64">
              {candidates.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 px-3 py-1.5 border-b border-border-primary last:border-0 md:py-2"
                >
                  <span className="text-sm flex-1 truncate">{s.name}</span>
                  <button
                    onClick={() => add(s.id, 'approval')}
                    className="shrink-0 min-h-9 px-3 text-xs border border-border-primary rounded-lg text-txt-secondary hover:bg-surface-secondary md:min-h-0 md:px-2 md:py-1"
                  >
                    결재
                  </button>
                  <button
                    onClick={() => add(s.id, 'cooperation')}
                    className="shrink-0 min-h-9 px-3 text-xs border border-border-primary rounded-lg text-txt-secondary hover:bg-surface-secondary md:min-h-0 md:px-2 md:py-1"
                  >
                    협조
                  </button>
                </div>
              ))}
              {candidates.length === 0 && (
                <div className="px-3 py-4 text-sm text-txt-tertiary">선택할 직원이 없습니다</div>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm mb-3 text-txt-secondary">
              아래로 갈수록 상위 결재자입니다. 마지막은 결재 역할이어야 합니다.
            </div>
            <div className="border border-border-primary rounded-lg h-52 overflow-y-auto md:h-64">
              {draft.map((d, i) => (
                <div key={d.staff_id} className="flex items-center gap-2 px-3 py-1.5 border-b border-border-primary last:border-0 md:py-2">
                  <div className="flex flex-col">
                    <button
                      onClick={() => move(i, i - 1)}
                      disabled={i === 0}
                      aria-label="위로"
                      className="w-8 h-6 flex items-center justify-center disabled:opacity-30 md:w-auto md:h-auto"
                    >
                      <ChevronUp size={14} className="text-txt-tertiary" />
                    </button>
                    <button
                      onClick={() => move(i, i + 1)}
                      disabled={i === draft.length - 1}
                      aria-label="아래로"
                      className="w-8 h-6 flex items-center justify-center disabled:opacity-30 md:w-auto md:h-auto"
                    >
                      <ChevronDown size={14} className="text-txt-tertiary" />
                    </button>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-surface-secondary text-txt-secondary">
                    {d.role === 'approval' ? '결재' : '협조'}
                  </span>
                  <span className="text-sm flex-1">{d.name}</span>
                  <button onClick={() => remove(d.staff_id)} aria-label="삭제" className="w-10 h-10 flex items-center justify-center -mr-2 md:w-auto md:h-auto md:mr-0">
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

        <div className="flex gap-2 px-4 py-4 border-t border-border-primary pb-[calc(1rem+env(safe-area-inset-bottom))] md:justify-end md:px-5 md:pb-4">
          <button onClick={onClose} className="flex-1 min-h-11 text-sm border border-border-primary rounded-lg md:flex-none md:min-h-0 md:px-5 md:py-2">취소</button>
          <button onClick={apply} className="flex-1 min-h-11 text-sm rounded-lg bg-accent text-txt-inverse md:flex-none md:min-h-0 md:px-5 md:py-2">적용</button>
        </div>
      </div>
    </div>
  )
}
