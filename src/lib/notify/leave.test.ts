import { describe, it, expect } from 'vitest'
import { isLeaveNotifyEvent, leaveSummary, planLeaveNotice, type LeaveNoticeRow } from './leave'

const staff = [
  { id: 'ceo', name: '김재호', role: '대표' },
  { id: 'mgr', name: '박관리', role: '관리자' },
  { id: 'acc', name: '이경리', role: '경리' },
  { id: 'emp', name: '김태정', role: '직원' },
  { id: 'site', name: '최소장', role: '현장소장' },
  { id: 'old', name: '정퇴사', role: '관리자', resign_date: '2026-08-31' },
]

const row = (over: Partial<LeaveNoticeRow> = {}): LeaveNoticeRow => ({
  id: 'L1',
  staff_id: 'emp',
  leave_type: '연차',
  start_date: '2026-10-20',
  end_date: '2026-10-20',
  days: 1,
  status: '대기',
  approved_by: null,
  ...over,
})

describe('isLeaveNotifyEvent', () => {
  it('requested·decided만 받는다', () => {
    expect(isLeaveNotifyEvent('requested')).toBe(true)
    expect(isLeaveNotifyEvent('decided')).toBe(true)
    expect(isLeaveNotifyEvent('approved')).toBe(false)
    expect(isLeaveNotifyEvent(undefined)).toBe(false)
  })
})

describe('leaveSummary', () => {
  it('종류·날짜·일수를 한 줄로', () => {
    expect(leaveSummary(row())).toBe('연차 10/20 (1일)')
    expect(leaveSummary(row({ end_date: '2026-10-22', days: 3 }))).toBe('연차 10/20~10/22 (3일)')
    expect(leaveSummary(row({ leave_type: '반차(오전)', days: 0.5 }))).toBe('반차(오전) 10/20 (0.5일)')
  })
  it('일수가 문자열로 와도 숫자로 읽는다', () => {
    expect(leaveSummary(row({ days: '2' }))).toBe('연차 10/20 (2일)')
  })
  it('일수를 모르면 생략한다', () => {
    expect(leaveSummary(row({ days: null }))).toBe('연차 10/20')
  })
})

describe('planLeaveNotice — requested', () => {
  it('승인자(대표·관리자·경리)에게 보내고 신청자·일반 직원·퇴사자는 뺀다', () => {
    const plan = planLeaveNotice('requested', row(), staff)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.recipients.sort()).toEqual(['acc', 'ceo', 'mgr'])
    expect(plan.payload).toEqual({
      title: '연차 신청',
      body: '김태정 · 연차 10/20 (1일)',
      url: '/leave',
      tag: 'leave-L1',
    })
  })

  it('관리자가 신청하면 본인은 빼고 대표·경리에게만', () => {
    const plan = planLeaveNotice('requested', row({ staff_id: 'mgr' }), staff)
    expect(plan.ok && plan.recipients.sort()).toEqual(['acc', 'ceo'])
  })

  it('대표가 신청하면 대표 본인에게는 보내지 않는다', () => {
    const plan = planLeaveNotice('requested', row({ staff_id: 'ceo' }), staff)
    expect(plan.ok && plan.recipients.sort()).toEqual(['acc', 'mgr'])
  })

  it('이미 처리된 신청이면 409', () => {
    const plan = planLeaveNotice('requested', row({ status: '승인' }), staff)
    expect(plan).toEqual({ ok: false, status: 409, error: expect.any(String) })
  })
})

describe('planLeaveNotice — decided', () => {
  it('승인되면 신청자에게 "연차 승인"', () => {
    const plan = planLeaveNotice('decided', row({ status: '승인', approved_by: 'mgr' }), staff)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.recipients).toEqual(['emp'])
    expect(plan.payload.title).toBe('연차 승인')
    expect(plan.payload.body).toBe('연차 10/20 (1일)')
    expect(plan.payload.url).toBe('/leave')
  })

  it('반려되면 신청자에게 "연차 반려"', () => {
    const plan = planLeaveNotice('decided', row({ status: '반려', approved_by: 'ceo' }), staff)
    expect(plan.ok && plan.payload.title).toBe('연차 반려')
    expect(plan.ok && plan.recipients).toEqual(['emp'])
  })

  it('대표가 자기 연차를 직접 승인했으면 보낼 사람이 없다', () => {
    const plan = planLeaveNotice('decided', row({ staff_id: 'ceo', status: '승인', approved_by: 'ceo' }), staff)
    expect(plan.ok && plan.recipients).toEqual([])
  })

  it('퇴사자의 신청이면 보내지 않는다', () => {
    const plan = planLeaveNotice('decided', row({ staff_id: 'old', status: '승인', approved_by: 'ceo' }), staff)
    expect(plan.ok && plan.recipients).toEqual([])
  })

  it('아직 대기 중이면 409', () => {
    const plan = planLeaveNotice('decided', row(), staff)
    expect(plan.ok).toBe(false)
    expect(!plan.ok && plan.status).toBe(409)
  })
})
