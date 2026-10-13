import { describe, it, expect } from 'vitest'
import { computeLeaveBalance } from './balance'

describe('computeLeaveBalance — 1년 미만(적립 중)', () => {
  it('월 1일 적립, 이월 없음, 잔여 = 적립 − 사용', () => {
    const b = computeLeaveBalance({
      joinDate: '2026-01-01',
      approved: [{ start_date: '2026-05-10', days: 2, status: '승인' }],
      carryoverMonths: 2,
      today: new Date('2026-09-13'), // 입사 후 약 8.4개월
    })
    expect(b.periodIndex).toBe(0)
    expect(b.isAccruing).toBe(true)
    expect(b.grant).toBe(8) // 1/1 → 9/1 = 8개월 적립 (최대 11)
    expect(b.carryIn).toBe(0)
    expect(b.carryStatus).toBe('none')
    expect(b.used).toBe(2)
    expect(b.usable).toBe(6)
  })
})

describe('computeLeaveBalance — 1년차 이월(유효)', () => {
  it('직전 구간 잔여가 이월되고, 만료 전이면 유효 + 선입선출 차감', () => {
    const b = computeLeaveBalance({
      joinDate: '2025-09-01',
      approved: [
        { start_date: '2026-01-10', days: 4, status: '승인' }, // 0년차(2025-09~2026-09) 사용
        { start_date: '2026-10-05', days: 2, status: '승인' }, // 1년차, 만료(11/1) 전 사용
      ],
      carryoverMonths: 2,
      today: new Date('2026-10-13'),
    })
    expect(b.periodIndex).toBe(1)
    expect(b.grant).toBe(15)
    expect(b.carryIn).toBe(7) // 11 - 4
    expect(b.carryExpiry).toBe('2026-11-01') // 2026-09-01 + 2개월
    expect(b.carryStatus).toBe('valid')
    expect(b.carryRemaining).toBe(5) // 7 - 2(선입선출로 이월 먼저)
    expect(b.grantRemaining).toBe(15)
    expect(b.usable).toBe(20) // 5 + 15
    expect(b.pendingForfeit).toBe(0)
  })
})

describe('computeLeaveBalance — 이월 만료(소멸 대기)', () => {
  it('만료일이 지나면 소멸 대기, 만료 후 사용은 당해에서 차감(이월 그대로)', () => {
    const b = computeLeaveBalance({
      joinDate: '2025-06-10',
      approved: [
        { start_date: '2025-08-01', days: 9, status: '승인' }, // 0년차 사용
        { start_date: '2026-09-20', days: 3, status: '승인' }, // 1년차, 만료(8/10) 후 사용
      ],
      carryoverMonths: 2,
      today: new Date('2026-10-13'),
    })
    expect(b.carryIn).toBe(2) // 11 - 9
    expect(b.carryExpiry).toBe('2026-08-10')
    expect(b.carryStatus).toBe('pending')
    expect(b.carryRemaining).toBe(2) // 만료 후 사용은 당해에서 빠져 이월은 그대로
    expect(b.grantRemaining).toBe(12) // 15 - 3
    expect(b.usable).toBe(12) // 이월(소멸 대기)은 잔여에서 제외
    expect(b.pendingForfeit).toBe(2)
  })
})

describe('computeLeaveBalance — 이월 소멸(기록됨)', () => {
  it('소멸 기록이 있으면 forfeited, 이월은 잔여에서 빠지고 소멸량 표시', () => {
    const b = computeLeaveBalance({
      joinDate: '2024-04-16',
      approved: [
        { start_date: '2024-07-01', days: 11, status: '승인' }, // 0년차 11 전부 사용 → 이월 0
        { start_date: '2025-07-01', days: 11, status: '승인' }, // 1년차 15중 11 → 2년차로 이월 4
        { start_date: '2026-09-01', days: 5, status: '승인' }, // 2년차(만료 6/16 후) 사용
      ],
      carryoverMonths: 2,
      forfeits: [{ period_start: '2026-04-16', days: 4 }],
      today: new Date('2026-10-13'),
    })
    expect(b.periodIndex).toBe(2)
    expect(b.carryIn).toBe(4)
    expect(b.carryStatus).toBe('forfeited')
    expect(b.forfeited).toBe(4)
    expect(b.carryRemaining).toBe(0)
    expect(b.grantRemaining).toBe(10) // 15 - 5
    expect(b.usable).toBe(10)
    expect(b.pendingForfeit).toBe(0)
  })
})

describe('computeLeaveBalance — 경계 케이스', () => {
  it('직전 구간을 다 썼으면 이월 없음', () => {
    const b = computeLeaveBalance({
      joinDate: '2025-01-10',
      approved: [{ start_date: '2025-05-01', days: 11, status: '승인' }],
      carryoverMonths: 2,
      today: new Date('2026-10-13'),
    })
    expect(b.periodIndex).toBe(1)
    expect(b.carryIn).toBe(0)
    expect(b.carryStatus).toBe('none')
    expect(b.carryExpiry).toBe(null)
  })

  it('3년차는 당해 부여가 16일(근속 가산)', () => {
    const b = computeLeaveBalance({
      joinDate: '2023-05-01',
      approved: [],
      carryoverMonths: 2,
      today: new Date('2026-10-13'), // 약 3.4년 → 3년차
    })
    expect(b.periodIndex).toBe(3)
    expect(b.grant).toBe(16)
  })

  it('반려·대기 연차는 사용으로 치지 않는다', () => {
    const b = computeLeaveBalance({
      joinDate: '2025-09-01',
      approved: [
        { start_date: '2026-01-10', days: 4, status: '반려' },
        { start_date: '2026-02-10', days: 3, status: '대기' },
      ],
      carryoverMonths: 2,
      today: new Date('2026-10-13'),
    })
    expect(b.carryIn).toBe(11) // 0년차 사용 0 (반려·대기 제외)
    expect(b.used).toBe(0)
  })
})
