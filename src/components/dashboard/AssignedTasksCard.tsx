'use client'

import { useState } from 'react'
import { Send, Plus, Check, X } from 'lucide-react'
import type { Task } from '@/types'

interface StaffLite {
  id: string
  name: string
}

interface Props {
  tasks: Task[]
  staffList: StaffLite[]
  currentStaffId: string | null
  staffSelected: boolean
  tableMissing: boolean
  onAdd: (content: string, assigneeId: string, deadline: string | null) => Promise<void>
  onToggleDone: (taskId: string, done: boolean) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
  getStaffName: (id: string | null) => string
}

function dayDelta(deadline: string | null) {
  if (!deadline) return null
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const d = new Date(deadline); d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - t.getTime()) / 86400000)
}

function deadlineBadge(deadline: string | null) {
  const diff = dayDelta(deadline)
  if (diff === null) return { label: '', color: 'text-txt-tertiary' }
  if (diff === 0) return { label: '오늘', color: 'text-[#dc2626] font-semibold' }
  if (diff < 0) return { label: `${Math.abs(diff)}일 지남`, color: 'text-[#dc2626] font-semibold' }
  if (diff <= 2) return { label: `D-${diff}`, color: 'text-[#9a3412] font-medium' }
  return { label: `D-${diff}`, color: 'text-txt-tertiary' }
}

export default function AssignedTasksCard({
  tasks, staffList, currentStaffId, staffSelected, tableMissing, onAdd, onToggleDone, onDelete, getStaffName,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [content, setContent] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [deadline, setDeadline] = useState('')

  const assignableStaff = staffList.filter(s => s.id !== currentStaffId)

  const submit = async () => {
    if (!content.trim() || !assigneeId) return
    await onAdd(content.trim(), assigneeId, deadline || null)
    setContent(''); setAssigneeId(''); setDeadline(''); setAdding(false)
  }

  return (
    <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden flex flex-col flex-1 min-h-0">
      <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send size={14} className="text-[#059669]" />
          <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">내 시킨 일</h2>
          <span className="text-[11px] min-w-[18px] h-[18px] flex items-center justify-center bg-surface-tertiary text-txt-secondary rounded-full font-medium">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => setAdding(v => !v)}
          disabled={!staffSelected || tableMissing}
          className="flex items-center gap-0.5 text-[11px] text-link hover:underline disabled:text-txt-quaternary disabled:no-underline"
        >
          <Plus size={12} /> 지시
        </button>
      </div>

      <div className="px-3 py-3 flex-1 overflow-y-auto">
        {tableMissing ? (
          <div className="text-center py-4 text-[11px] text-txt-quaternary leading-relaxed">
            <div className="font-medium text-[12px] text-txt-tertiary mb-1">DB 준비 필요</div>
            <div>Supabase SQL Editor에서</div>
            <code className="inline-block px-1 py-0.5 bg-surface-tertiary rounded text-[10px] my-0.5">sql/migration_tasks.sql</code>
            <div>한 번 실행해주세요.</div>
          </div>
        ) : !staffSelected ? (
          <div className="text-center py-8 text-txt-quaternary text-[12px]">
            상단에서 담당자를 선택하세요
          </div>
        ) : (
          <>
            {adding && (
              <div className="mb-2 p-2 bg-surface-tertiary rounded-lg space-y-1.5">
                <input
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="내용 (예: 수원 견적서 뽑아오기)"
                  className="w-full text-[12px] border border-border-primary rounded px-2 py-1 bg-surface"
                />
                <div className="flex gap-1">
                  <select
                    value={assigneeId}
                    onChange={e => setAssigneeId(e.target.value)}
                    className="flex-1 text-[12px] border border-border-primary rounded px-1.5 py-1 bg-surface"
                  >
                    <option value="">수행자 선택</option>
                    {assignableStaff.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={deadline}
                    onChange={e => setDeadline(e.target.value)}
                    className="text-[12px] border border-border-primary rounded px-1 py-1 bg-surface"
                  />
                  <button
                    onClick={submit}
                    className="px-2 py-1 text-[11px] font-medium bg-accent text-white rounded hover:bg-accent-hover shrink-0"
                  >
                    등록
                  </button>
                </div>
              </div>
            )}

            {tasks.length === 0 ? (
              <div className="text-center py-8 text-txt-quaternary text-[13px]">시킨 일 없음</div>
            ) : (
              <div className="space-y-0.5">
                {tasks.slice(0, 8).map(t => {
                  const bd = deadlineBadge(t.deadline)
                  return (
                    <div key={t.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-surface-tertiary group">
                      <button
                        onClick={() => onToggleDone(t.id, !t.done)}
                        className="shrink-0 text-txt-tertiary hover:text-[#059669]"
                        title="완료 처리"
                      >
                        <Check size={13} />
                      </button>
                      <span className={`text-[11px] tabular-nums w-14 shrink-0 ${bd.color}`}>
                        {bd.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-txt-primary truncate">{t.content}</div>
                        <div className="text-[10px] text-txt-tertiary">→ {getStaffName(t.assigned_to)}</div>
                      </div>
                      <button
                        onClick={() => onDelete(t.id)}
                        className="opacity-0 group-hover:opacity-100 shrink-0 text-txt-quaternary hover:text-[#dc2626]"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
