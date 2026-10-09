import { canDecideLeave } from '@/lib/leave/permissions'
import { dateRange } from './text'
import { activeIds, type NoticePlan, type NoticeStaff } from './types'

/**
 * 연차 알림 — 누구에게 무엇을 보낼지.
 *
 * 예전에는 연차를 신청해도 승인자가 연차 화면을 직접 열어 보기 전엔 몰랐고,
 * 신청자도 승인·반려됐는지 알 길이 없었다.
 */

export const LEAVE_NOTIFY_EVENTS = ['requested', 'decided'] as const
export type LeaveNotifyEvent = (typeof LEAVE_NOTIFY_EVENTS)[number]

export function isLeaveNotifyEvent(v: unknown): v is LeaveNotifyEvent {
  return (LEAVE_NOTIFY_EVENTS as readonly unknown[]).includes(v)
}

export interface LeaveNoticeRow {
  id: string
  staff_id: string
  leave_type: string
  start_date: string
  end_date: string
  days: number | string | null
  status: string
  approved_by?: string | null
}

/** '연차 10/20 (1일)', '연차 10/20~10/22 (3일)', '반차(오전) 10/20 (0.5일)' */
export function leaveSummary(row: Pick<LeaveNoticeRow, 'leave_type' | 'start_date' | 'end_date' | 'days'>): string {
  const days = Number(row.days)
  const dayText = Number.isFinite(days) && days > 0 ? ` (${days}일)` : ''
  return `${row.leave_type} ${dateRange(row.start_date, row.end_date)}${dayText}`
}

export function planLeaveNotice(event: LeaveNotifyEvent, row: LeaveNoticeRow, staff: NoticeStaff[]): NoticePlan {
  const summary = leaveSummary(row)
  const requesterName = staff.find(s => s.id === row.staff_id)?.name

  if (event === 'requested') {
    if (row.status !== '대기') {
      return { ok: false, status: 409, error: '대기 중인 신청이 아닙니다' }
    }
    // 승인 버튼을 누를 수 있는 사람에게만 보낸다 — 화면의 승인 권한과 같은 규칙(canDecideLeave).
    // 신청자 본인은 뺀다(대표가 자기 연차를 낸 경우에도 본인에게 "신청 들어옴"은 군더더기다).
    const deciders = staff
      .filter(s => s.id !== row.staff_id && canDecideLeave({ id: s.id, role: s.role }, row.staff_id))
      .map(s => s.id)
    return {
      ok: true,
      recipients: activeIds(deciders, staff),
      payload: {
        title: '연차 신청',
        body: requesterName ? `${requesterName} · ${summary}` : summary,
        url: '/leave',
        tag: `leave-${row.id}`,
      },
    }
  }

  if (row.status !== '승인' && row.status !== '반려') {
    return { ok: false, status: 409, error: '아직 승인·반려되지 않은 신청입니다' }
  }
  // 대표가 자기 연차를 직접 처리했으면 본인에게 다시 알릴 필요가 없다.
  const selfDecided = !!row.approved_by && row.approved_by === row.staff_id
  return {
    ok: true,
    recipients: selfDecided ? [] : activeIds([row.staff_id], staff),
    payload: {
      title: row.status === '승인' ? '연차 승인' : '연차 반려',
      body: summary,
      url: '/leave',
      tag: `leave-${row.id}`,
    },
  }
}
