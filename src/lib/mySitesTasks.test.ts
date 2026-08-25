import { describe, expect, it } from 'vitest'
import {
  boardOpenTaskCount,
  calendarDaysBetween,
  formatDayDelta,
  formatMonthDay,
  formatNextLine,
  formatSeoulDateHeading,
  isInConstruction,
  isNearCompletion,
  openTaskCount,
  partitionSitesByOpenTasks,
  seoulTodayYmd,
  siteNextMilestone,
  siteStallDays,
  sortBoardTasks,
  telHref,
} from './mySitesTasks'

describe('sortBoardTasks', () => {
  it('열린 일을 위에 두고 완료는 아래로 보낸다', () => {
    const rows = sortBoardTasks([
      { id: '3', site_id: null, task_name: '철도 착공 날짜', is_done: false, created_at: 'c' },
      { id: '1', site_id: null, task_name: '영등포 주말', is_done: true, created_at: 'a' },
      { id: '2', site_id: null, task_name: '농협 견적 금액만', is_done: false, created_at: 'b' },
    ])
    expect(rows.map((r) => r.task_name)).toEqual([
      '농협 견적 금액만',
      '철도 착공 날짜',
      '영등포 주말',
    ])
    expect(openTaskCount(rows)).toBe(2)
  })
})

describe('site groups', () => {
  it('준공서류만 준공 앞이고 정산완료는 공사 중이 아니다', () => {
    expect(isNearCompletion('준공서류')).toBe(true)
    expect(isNearCompletion('착공')).toBe(false)
    expect(isInConstruction('착공')).toBe(true)
    expect(isInConstruction('공사중')).toBe(true)
    expect(isInConstruction('계약')).toBe(true)
    expect(isInConstruction('정산완료')).toBe(false)
    expect(isInConstruction('준공서류')).toBe(false)
  })
})

describe('seoul dates', () => {
  it('서울 날짜와 요일 제목을 만든다', () => {
    const noonUtc = new Date('2026-08-25T03:00:00.000Z')
    expect(seoulTodayYmd(noonUtc)).toBe('2026-08-25')
    expect(formatSeoulDateHeading(noonUtc)).toBe('8월 25일 화요일')
  })

  it('달력 일수만 센다', () => {
    expect(calendarDaysBetween('2026-08-07', '2026-08-25')).toBe(18)
    expect(calendarDaysBetween('2026-08-25', '2026-08-25')).toBe(0)
    expect(calendarDaysBetween('bad', '2026-08-25')).toBeNull()
  })
})

describe('siteStallDays', () => {
  const today = '2026-08-25'

  it('착공인데 준공예정일이 지났으면 늦은 일수를 준다', () => {
    expect(
      siteStallDays({ status: '착공', start_date: '2026-08-03', end_date: '2026-08-07' }, today),
    ).toBe(18)
  })

  it('계약인데 착공예정일이 지났으면 멈춤이다', () => {
    expect(
      siteStallDays({ status: '계약', start_date: '2026-08-20', end_date: '2026-09-01' }, today),
    ).toBe(5)
  })

  it('준공서류는 날짜가 지나도 멈춤으로 세지 않는다', () => {
    expect(
      siteStallDays({ status: '준공서류', start_date: '2026-07-24', end_date: '2026-08-02' }, today),
    ).toBeNull()
  })

  it('날짜가 없거나 아직이면 멈춤을 만들지 않는다', () => {
    expect(siteStallDays({ status: '착공', start_date: null, end_date: null }, today)).toBeNull()
    expect(
      siteStallDays({ status: '착공', start_date: '2026-07-22', end_date: '2026-12-18' }, today),
    ).toBeNull()
  })
})

describe('siteNextMilestone', () => {
  const today = '2026-08-25'

  it('날짜가 둘 다 없으면 다음을 생략한다', () => {
    expect(siteNextMilestone({ status: '착공', start_date: null, end_date: null }, today)).toBeNull()
  })

  it('착공예정일이 남았으면 그걸 다음으로 쓴다', () => {
    expect(
      siteNextMilestone({ status: '계약', start_date: '2026-08-28', end_date: '2026-09-10' }, today),
    ).toEqual({ ymd: '2026-08-28', source: 'start_date', daysFromToday: 3 })
    expect(formatNextLine({ ymd: '2026-08-28', source: 'start_date', daysFromToday: 3 })).toBe(
      '착공예정 8/28 · 3일 남음',
    )
  })

  it('착공이 지났으면 준공예정일을 다음으로 쓴다', () => {
    expect(
      siteNextMilestone({ status: '착공', start_date: '2026-07-22', end_date: '2026-12-18' }, today),
    ).toEqual({ ymd: '2026-12-18', source: 'end_date', daysFromToday: 115 })
    expect(formatMonthDay('2026-12-18')).toBe('12/18')
    expect(formatDayDelta(-23)).toBe('23일 지남')
    expect(formatDayDelta(0)).toBe('오늘')
  })
})

describe('board lists', () => {
  it('주간 일 + 보이는 현장 연 일만 센다', () => {
    const tasks = [
      { id: 'w', site_id: null, task_name: '영등포 주말', is_done: false, created_at: 'a' },
      { id: 's', site_id: 'site-1', task_name: '서류', is_done: false, created_at: 'b' },
      { id: 'h', site_id: 'hidden', task_name: '숨김', is_done: false, created_at: 'c' },
      { id: 'd', site_id: 'site-1', task_name: '끝난 일', is_done: true, created_at: 'd' },
    ]
    expect(boardOpenTaskCount(tasks, new Set(['site-1']))).toBe(2)
  })

  it('연 일이 있는 현장과 없는 현장을 나눈다', () => {
    const { withOpen, withoutOpen } = partitionSitesByOpenTasks(
      [{ id: 'a' }, { id: 'b' }],
      [
        { id: '1', site_id: 'a', task_name: '할 일', is_done: false, created_at: 'a' },
        { id: '2', site_id: 'b', task_name: '끝난 일', is_done: true, created_at: 'b' },
      ],
    )
    expect(withOpen.map((s) => s.id)).toEqual(['a'])
    expect(withoutOpen.map((s) => s.id)).toEqual(['b'])
  })

  it('전화는 숫자가 충분할 때만 tel 링크를 만든다', () => {
    expect(telHref('010-6543-7740 김동욱주무관')).toBe('tel:01065437740')
    expect(telHref('0')).toBeNull()
    expect(telHref(null)).toBeNull()
  })
})
