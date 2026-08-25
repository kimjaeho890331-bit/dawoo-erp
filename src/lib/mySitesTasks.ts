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

const SEOUL = 'Asia/Seoul'
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/
const END_OVERDUE_STATUSES = new Set(['계약', '착공', '공사중'])

export type BoardSiteDates = {
  status: string | null
  start_date: string | null
  end_date: string | null
}

export type NextMilestone = {
  ymd: string
  source: 'start_date' | 'end_date'
  daysFromToday: number
}

export function hasDisplayText(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0
}

export function parseYmd(value: string | null | undefined): string | null {
  if (!value) return null
  const m = YMD.exec(value.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null
  }
  return `${m[1]}-${m[2]}-${m[3]}`
}

export function seoulTodayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function formatSeoulDateHeading(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: SEOUL,
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).formatToParts(now)
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  const day = (parts.find((p) => p.type === 'day')?.value ?? '').replace(/일/g, '')
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  return `${month} ${day}일 ${weekday}`.replace(/\s+/g, ' ').trim()
}

export function calendarDaysBetween(fromYmd: string, toYmd: string): number | null {
  const from = parseYmd(fromYmd)
  const to = parseYmd(toYmd)
  if (!from || !to) return null
  const [, fy, fm, fd] = YMD.exec(from)!
  const [, ty, tm, td] = YMD.exec(to)!
  const a = Date.UTC(Number(fy), Number(fm) - 1, Number(fd))
  const b = Date.UTC(Number(ty), Number(tm) - 1, Number(td))
  return Math.round((b - a) / 86_400_000)
}

/** 멈춤: 실제 날짜가 오늘(서울)보다 지난 경우만. 계산 못 하면 null. */
export function siteStallDays(site: BoardSiteDates, todayYmd: string): number | null {
  const today = parseYmd(todayYmd)
  if (!today) return null
  const status = (site.status ?? '').trim()
  const start = parseYmd(site.start_date)
  const end = parseYmd(site.end_date)
  let late: number | null = null

  if (start && start < today && status === '계약') {
    late = calendarDaysBetween(start, today)
  }
  if (end && end < today && END_OVERDUE_STATUSES.has(status)) {
    const endLate = calendarDaysBetween(end, today)
    if (endLate != null) late = late == null ? endLate : Math.max(late, endLate)
  }
  return late != null && late > 0 ? late : null
}

/**
 * 다음: start_date / end_date 중 있는 값만.
 * 착공예정일이 오늘 이후면 그 날짜, 아니면 준공예정일, 둘 다 없으면 생략.
 */
export function siteNextMilestone(site: BoardSiteDates, todayYmd: string): NextMilestone | null {
  const today = parseYmd(todayYmd)
  const start = parseYmd(site.start_date)
  const end = parseYmd(site.end_date)
  if (!today) return null

  let ymd: string | null = null
  let source: NextMilestone['source'] | null = null
  if (start && start >= today) {
    ymd = start
    source = 'start_date'
  } else if (end) {
    ymd = end
    source = 'end_date'
  } else if (start) {
    ymd = start
    source = 'start_date'
  }
  if (!ymd || !source) return null
  const days = calendarDaysBetween(today, ymd)
  if (days == null) return null
  return { ymd, source, daysFromToday: days }
}

export function formatMonthDay(ymd: string): string {
  const parsed = parseYmd(ymd)
  if (!parsed) return ''
  const [, , m, d] = YMD.exec(parsed)!
  return `${Number(m)}/${Number(d)}`
}

export function formatDayDelta(daysFromToday: number): string {
  if (daysFromToday === 0) return '오늘'
  if (daysFromToday > 0) return `${daysFromToday}일 남음`
  return `${Math.abs(daysFromToday)}일 지남`
}

export function formatNextLine(info: NextMilestone): string {
  const kind = info.source === 'start_date' ? '착공예정' : '준공예정'
  return `${kind} ${formatMonthDay(info.ymd)} · ${formatDayDelta(info.daysFromToday)}`
}

export function telHref(phone: string | null | undefined): string | null {
  if (!hasDisplayText(phone)) return null
  const digits = phone!.replace(/\D/g, '')
  if (digits.length < 8) return null
  return `tel:${digits}`
}

export function boardOpenTaskCount(tasks: SiteTaskRow[], visibleSiteIds: Set<string>): number {
  return tasks.filter((t) => !t.is_done && (t.site_id === null || visibleSiteIds.has(t.site_id))).length
}

export function partitionSitesByOpenTasks<T extends { id: string }>(
  sites: T[],
  tasks: SiteTaskRow[],
): { withOpen: T[]; withoutOpen: T[] } {
  const openBySite = new Set(
    tasks.filter((t) => t.site_id && !t.is_done).map((t) => t.site_id as string),
  )
  const withOpen: T[] = []
  const withoutOpen: T[] = []
  for (const site of sites) {
    if (openBySite.has(site.id)) withOpen.push(site)
    else withoutOpen.push(site)
  }
  return { withOpen, withoutOpen }
}
