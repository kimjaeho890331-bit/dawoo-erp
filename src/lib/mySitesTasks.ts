import { WEEKLY_UNASSIGNED_TASKS } from './mySitesAccess'

export type SiteTaskRow = {
  id: string
  site_id: string | null
  task_name: string
  is_done: boolean
  created_at: string | null
}

export function sortBoardTasks(tasks: SiteTaskRow[]): SiteTaskRow[] {
  const open = tasks.filter((t) => !t.is_done)
  const done = tasks.filter((t) => t.is_done)
  const byWeeklyThenCreated = (a: SiteTaskRow, b: SiteTaskRow) => {
    const ia = WEEKLY_UNASSIGNED_TASKS.findIndex((n) => n === a.task_name)
    const ib = WEEKLY_UNASSIGNED_TASKS.findIndex((n) => n === b.task_name)
    const ra = ia === -1 ? 100 : ia
    const rb = ib === -1 ? 100 : ib
    if (ra !== rb) return ra - rb
    return (a.created_at || '').localeCompare(b.created_at || '')
  }
  return [...open.sort(byWeeklyThenCreated), ...done.sort(byWeeklyThenCreated)]
}

export function openTaskCount(tasks: SiteTaskRow[]): number {
  return tasks.filter((t) => !t.is_done).length
}

export const ACTIVE_SITE_STATUSES = ['계약', '착공', '공사중', '준공서류'] as const

export function isNearCompletion(status: string): boolean {
  return status === '준공서류'
}

export function isInConstruction(status: string): boolean {
  return status === '계약' || status === '착공' || status === '공사중'
}
