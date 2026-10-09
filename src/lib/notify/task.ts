import { shortDate, truncate, withName } from './text'
import { activeIds, type NoticePlan, type NoticeStaff } from './types'

/**
 * 대시보드 「지시」 알림 — 누구에게 무엇을 보낼지.
 *
 * 예전에는 일을 시켜도 받은 사람이 대시보드를 열어 봐야 알았고,
 * 시킨 사람은 끝났는지 알려면 목록에서 사라졌는지 확인해야 했다.
 */

export const TASK_NOTIFY_EVENTS = ['assigned', 'done'] as const
export type TaskNotifyEvent = (typeof TASK_NOTIFY_EVENTS)[number]

export function isTaskNotifyEvent(v: unknown): v is TaskNotifyEvent {
  return (TASK_NOTIFY_EVENTS as readonly unknown[]).includes(v)
}

export interface TaskNoticeRow {
  id: string
  content: string
  assigned_to: string | null
  assigned_by: string | null
  deadline: string | null
  done: boolean | null
}

export function planTaskNotice(event: TaskNotifyEvent, row: TaskNoticeRow, staff: NoticeStaff[]): NoticePlan {
  const nameOf = (id: string | null) => (id ? staff.find(s => s.id === id)?.name : undefined)
  // 내가 나에게 적은 할 일은 알릴 상대가 없다
  const selfTask = !!row.assigned_to && row.assigned_to === row.assigned_by
  const content = truncate(row.content ?? '')

  if (event === 'assigned') {
    if (row.done) return { ok: false, status: 409, error: '이미 끝난 일입니다' }
    const deadline = row.deadline ? ` · 마감 ${shortDate(row.deadline)}` : ''
    return {
      ok: true,
      recipients: selfTask ? [] : activeIds([row.assigned_to], staff),
      payload: {
        title: '새 지시',
        body: withName(nameOf(row.assigned_by), content) + deadline,
        url: '/dashboard',
        tag: `task-${row.id}`,
      },
    }
  }

  if (!row.done) return { ok: false, status: 409, error: '아직 끝나지 않은 일입니다' }
  return {
    ok: true,
    recipients: selfTask ? [] : activeIds([row.assigned_by], staff),
    payload: {
      title: '지시 완료',
      body: withName(nameOf(row.assigned_to), content),
      url: '/dashboard',
      tag: `task-${row.id}`,
    },
  }
}
