import { describe, expect, it } from 'vitest'
import { canSeeMySites, isExecRole, WEEKLY_UNASSIGNED_TASKS } from './mySitesAccess'

describe('canSeeMySites', () => {
  it('김재호만 보고 다른 임원·직원은 못 본다', () => {
    expect(canSeeMySites({ name: '김재호', role: '관리자' })).toBe(true)
    expect(canSeeMySites({ name: '김재호', role: '직원' })).toBe(true)
    expect(canSeeMySites({ name: '김지선', role: '관리자' })).toBe(false)
    expect(canSeeMySites({ name: '조혜진', role: '관리자' })).toBe(false)
    expect(canSeeMySites({ name: '김용이', role: '관리자' })).toBe(false)
    expect(canSeeMySites({ name: '고상준', role: '직원' })).toBe(false)
    expect(canSeeMySites({ role: '대표' })).toBe(false)
    expect(canSeeMySites({ role: '경리' })).toBe(false)
    expect(canSeeMySites(null)).toBe(false)
  })

  it('이미 있는 김재호 이메일만 이름 없이 통과한다', () => {
    expect(canSeeMySites({ email: 'kimjaeho890331@gmail.com' })).toBe(true)
    expect(canSeeMySites({ email: 'KIMJAEHO890331@gmail.com' })).toBe(true)
    expect(canSeeMySites({ email: 'other@gmail.com' })).toBe(false)
  })

  it('김재호가 여럿이면 임원/이사 행만 통과한다', () => {
    const twins = [
      { id: 'a', name: '김재호', role: '직원' },
      { id: 'b', name: '김재호', role: '관리자' },
    ]
    expect(canSeeMySites({ id: 'b', name: '김재호', role: '관리자' }, twins)).toBe(true)
    expect(canSeeMySites({ id: 'a', name: '김재호', role: '직원' }, twins)).toBe(false)
    expect(isExecRole('이사')).toBe(true)
    expect(isExecRole('임원')).toBe(true)
    expect(isExecRole('직원')).toBe(false)
  })
})

describe('WEEKLY_UNASSIGNED_TASKS', () => {
  it('이번 주 세 줄만 고정한다', () => {
    expect([...WEEKLY_UNASSIGNED_TASKS]).toEqual([
      '영등포 주말',
      '농협 견적 금액만',
      '철도 착공 날짜',
    ])
  })
})
