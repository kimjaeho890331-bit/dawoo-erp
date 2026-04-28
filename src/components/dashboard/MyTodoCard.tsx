'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckSquare, Check, Plus } from 'lucide-react'

// 통합 TodoItem: schedule과 task를 한 리스트로 표시
export interface TodoItem {
  id: string
  source: 'schedule' | 'task'
  title: string
  date: string | null        // schedule.start_date 또는 task.deadline
  href: string
  projectId: string | null
  assignerName: string | null  // task의 경우 지시자 이름
  scheduleType?: string        // schedule인 경우
  rawId: string                // schedule.id 또는 task.id (done 처리용)
}

interface Props {
  todos: TodoItem[]
  staffSelected: boolean
  tasksTableMissing: boolean
  onCompleteTask: (taskId: string) => Promise<void>
  onAdd: (content: string, deadline: string | null) => Promise<void>
  onOpenDetail: (taskId: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  project: '#3B82F6', personal: '#8B5CF6', promo: '#F59E0B', ai: '#06B6D4', task: '#059669',
}

function dayDelta(date: string | null) {
  if (!date) return null
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - t.getTime()) / 86400000)
}

function badgeInfo(date: string | null): { label: string; color: string } {
  const diff = dayDelta(date)
  if (diff === null) return { label: '상시', color: 'text-txt-tertiary' }
  if (diff === 0) return { label: '오늘', color: 'text-[#dc2626] font-semibold' }
  if (diff < 0) return { label: `${Math.abs(diff)}일 지남`, color: 'text-[#dc2626] font-semibold' }
  if (diff <= 2) return { label: `D-${diff}`, color: 'text-[#9a3412] font-medium' }
  return { label: `D-${diff}`, color: 'text-txt-tertiary' }
}

export default function MyTodoCard({ todos, staffSelected, tasksTableMissing, onCompleteTask, onAdd, onOpenDetail }: Props) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [content, setContent] = useState('')
  const [deadline, setDeadline] = useState('')

  const submit = async () => {
    if (!content.trim()) return
    await onAdd(content.trim(), deadline || null)
    setContent(''); setDeadline(''); setAdding(false)
  }

  // 클릭 vs 더블클릭: 단일 클릭은 220ms 지연 후 라우팅, 더블클릭이면 cancel + 모달
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleTaskClick = (t: TodoItem) => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => {
      router.push(t.href)
      clickTimer.current = null
    }, 220)
  }
  const handleTaskDoubleClick = (t: TodoItem) => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
    onOpenDetail(t.rawId)
  }

  return (
    <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden flex flex-col flex-1 min-h-0">
      <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare size={14} className="text-[#2563eb]" />
          <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">내 할 일</h2>
          <span className="text-[11px] min-w-[18px] h-[18px] flex items-center justify-center bg-surface-tertiary text-txt-secondary rounded-full font-medium">
            {todos.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAdding(v => !v)}
            disabled={!staffSelected || tasksTableMissing}
            className="flex items-center gap-0.5 text-[11px] text-link hover:underline disabled:text-txt-quaternary disabled:no-underline"
          >
            <Plus size={12} /> 내 할 일
          </button>
          <Link href="/calendar/work" className="text-[11px] text-link hover:underline">캘린더 →</Link>
        </div>
      </div>
      <div className="px-3 py-3 flex-1 overflow-y-auto">
        {!staffSelected ? (
          <div className="text-center py-8 text-txt-quaternary text-[12px]">
            이름 선택 필요
          </div>
        ) : (
          <>
            {adding && (
              <div className="mb-2 p-2 bg-surface-tertiary rounded-lg space-y-1.5">
                <input
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder="할 일 (예: 견적서 검토)"
                  className="w-full text-[12px] border border-border-primary rounded px-2 py-1 bg-surface"
                />
                <div className="flex gap-1">
                  <input
                    type="date"
                    value={deadline}
                    onChange={e => setDeadline(e.target.value)}
                    className="flex-1 text-[12px] border border-border-primary rounded px-1 py-1 bg-surface"
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

            {todos.length === 0 ? (
              <div className="text-center py-8 text-txt-quaternary text-[13px]">
                할 일 없음{tasksTableMissing ? '' : ' · 여유 있음 🎉'}
              </div>
            ) : (
              <div className="space-y-0.5">
                {todos.slice(0, 10).map(t => {
                  const bd = badgeInfo(t.date)
                  const color = t.source === 'task'
                    ? TYPE_COLORS.task
                    : TYPE_COLORS[t.scheduleType || ''] || '#3B82F6'
                  return (
                    <div key={t.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-surface-tertiary group">
                      {t.source === 'task' && (
                        <button
                          onClick={() => onCompleteTask(t.rawId)}
                          className="shrink-0 text-txt-tertiary hover:text-[#059669]"
                          title="완료 처리"
                        >
                          <Check size={13} />
                        </button>
                      )}
                      <span className={`text-[11px] tabular-nums w-14 shrink-0 ${bd.color}`}>
                        {bd.label}
                      </span>
                      <div className="w-1 h-5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      {t.source === 'task' ? (
                        <button
                          onClick={() => handleTaskClick(t)}
                          onDoubleClick={() => handleTaskDoubleClick(t)}
                          className="flex-1 min-w-0 text-[12px] text-txt-primary truncate text-left cursor-pointer"
                          title="클릭: 접수대장 / 더블클릭: 상세"
                        >
                          {t.title}
                          {t.assignerName && (
                            <span className="text-[10px] text-txt-tertiary ml-1">
                              ← {t.assignerName}
                            </span>
                          )}
                        </button>
                      ) : (
                        <Link
                          href={t.href}
                          className="flex-1 min-w-0 text-[12px] text-txt-primary truncate"
                        >
                          {t.title}
                        </Link>
                      )}
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
