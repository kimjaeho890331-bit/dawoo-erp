import { describe, expect, it } from 'vitest'
import { isInConstruction, isNearCompletion, openTaskCount, sortBoardTasks } from './mySitesTasks'

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
