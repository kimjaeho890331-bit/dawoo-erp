'use client'

import { useState, useEffect } from 'react'
import { X, Trash2, Check } from 'lucide-react'
import type { Task } from '@/types'

interface StaffLite {
  id: string
  name: string
}

interface Props {
  task: Task
  staffList: StaffLite[]
  mode: 'received' | 'assigned' | 'self'
  getStaffName: (id: string | null) => string
  onClose: () => void
  onSave: (patch: Partial<Task>) => Promise<void>
  onDelete: () => Promise<void>
  onComplete: () => Promise<void>
}

export default function TaskDetailModal({
  task, staffList, mode, getStaffName, onClose, onSave, onDelete, onComplete,
}: Props) {
  const [content, setContent] = useState(task.content)
  const [deadline, setDeadline] = useState(task.deadline ?? '')
  const [note, setNote] = useState(task.note ?? '')
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dirty =
    content !== task.content ||
    (deadline || null) !== (task.deadline || null) ||
    (note || null) !== (task.note || null) ||
    (mode === 'assigned' && assignedTo !== (task.assigned_to ?? ''))

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    const patch: Partial<Task> = {
      content: content.trim(),
      deadline: deadline || null,
      note: note.trim() || null,
    }
    if (mode === 'assigned') patch.assigned_to = assignedTo || null
    await onSave(patch)
    setSaving(false)
    onClose()
  }

  const handleDelete = async () => {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return
    await onDelete()
    onClose()
  }

  const handleComplete = async () => {
    await onComplete()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-[10px] border border-border-primary shadow-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-txt-primary text-sm">
            {mode === 'self' ? '내 할 일' : mode === 'assigned' ? '시킨 일' : '받은 일'} 상세
          </h3>
          <button onClick={onClose} className="text-txt-tertiary hover:text-txt-secondary">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className="text-[11px] text-txt-tertiary block mb-1">내용</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={2}
              className="w-full text-[13px] border border-border-primary rounded-lg px-2.5 py-1.5 bg-surface text-txt-primary focus:ring-1 focus:ring-accent focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-[11px] text-txt-tertiary block mb-1">마감일</label>
            <input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="text-[13px] border border-border-primary rounded-lg px-2.5 py-1.5 bg-surface text-txt-primary focus:ring-1 focus:ring-accent focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-txt-tertiary block mb-1">수행자</label>
              {mode === 'assigned' ? (
                <select
                  value={assignedTo}
                  onChange={e => setAssignedTo(e.target.value)}
                  className="w-full text-[13px] border border-border-primary rounded-lg px-2.5 py-1.5 bg-surface text-txt-primary"
                >
                  <option value="">선택</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <div className="text-[13px] text-txt-primary py-1.5">{getStaffName(task.assigned_to) || '-'}</div>
              )}
            </div>
            <div>
              <label className="text-[11px] text-txt-tertiary block mb-1">지시자</label>
              <div className="text-[13px] text-txt-primary py-1.5">{getStaffName(task.assigned_by) || '-'}</div>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-txt-tertiary block mb-1">메모</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={4}
              placeholder="메모 / 진행 상황 / 참고"
              className="w-full text-[13px] border border-border-primary rounded-lg px-2.5 py-1.5 bg-surface text-txt-primary focus:ring-1 focus:ring-accent focus:outline-none resize-none"
            />
          </div>

          {task.project_id && (
            <a
              href={`/register/small?project=${task.project_id}`}
              className="inline-block text-[12px] text-link hover:underline"
            >
              연결된 접수대장 열기 →
            </a>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border-tertiary flex items-center justify-between shrink-0">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1 text-[12px] text-txt-tertiary hover:text-[#dc2626]"
          >
            <Trash2 size={13} /> 삭제
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleComplete}
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium text-[#059669] border border-[#059669]/30 rounded-lg hover:bg-[#059669]/5"
            >
              <Check size={13} /> 완료
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving || !content.trim()}
              className="px-3 py-1.5 text-[12px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:bg-surface-tertiary disabled:text-txt-quaternary"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
