import { describe, it, expect } from 'vitest'
import { sortStaffForApprovalLine } from './staffOrder'

describe('sortStaffForApprovalLine', () => {
  it('지정한 5명을 정해진 순서로 앞세운다', () => {
    const input = [
      { name: '김지선' }, { name: '김재호' }, { name: '김용이' },
      { name: '송승란' }, { name: '조혜진' },
    ]
    expect(sortStaffForApprovalLine(input).map(s => s.name))
      .toEqual(['조혜진', '송승란', '김용이', '김재호', '김지선'])
  })

  it('목록에 없는 직원은 뒤에 이름순으로 붙인다', () => {
    const input = [
      { name: '한유빈' }, { name: '조혜진' }, { name: '고상준' }, { name: '김지선' },
    ]
    expect(sortStaffForApprovalLine(input).map(s => s.name))
      .toEqual(['조혜진', '김지선', '고상준', '한유빈'])
  })

  it('지정 목록이 하나도 없으면 이름순으로만 돌려준다', () => {
    const input = [{ name: '한유빈' }, { name: '고상준' }, { name: '임대진' }]
    expect(sortStaffForApprovalLine(input).map(s => s.name))
      .toEqual(['고상준', '임대진', '한유빈'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const input = [{ name: '한유빈' }, { name: '조혜진' }]
    sortStaffForApprovalLine(input)
    expect(input.map(s => s.name)).toEqual(['한유빈', '조혜진'])
  })
})
