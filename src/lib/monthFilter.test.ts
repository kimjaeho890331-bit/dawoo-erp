import { describe, expect, it } from 'vitest'
import { ALL_MONTHS, inMonth, matchesQuery, monthLabel, monthOf, monthOptions } from './monthFilter'

describe('monthOf', () => {
  it('날짜에서 연-월만 뗀다', () => {
    expect(monthOf('2026-10-09')).toBe('2026-10')
    expect(monthOf('2026-01-31T12:00:00+09:00')).toBe('2026-01')
  })

  it('날짜 꼴이 아니면 null', () => {
    expect(monthOf(null)).toBeNull()
    expect(monthOf(undefined)).toBeNull()
    expect(monthOf('')).toBeNull()
    expect(monthOf('2026.10.09')).toBeNull()
    expect(monthOf('2026-13-01')).toBeNull()
  })
})

describe('monthOptions', () => {
  it('있는 달만 겹치지 않게 최신순으로', () => {
    expect(monthOptions(['2026-08-01', '2026-10-02', '2026-08-30', '2025-12-31'])).toEqual([
      '2026-10', '2026-08', '2025-12',
    ])
  })

  it('빈 값·깨진 값은 빼고, 자료가 없으면 빈 목록', () => {
    expect(monthOptions([null, '', 'abc'])).toEqual([])
    expect(monthOptions([])).toEqual([])
  })

  it('기본으로 고를 달은 자료가 없어도 넣는다', () => {
    expect(monthOptions(['2026-08-01'], ['2026-10'])).toEqual(['2026-10', '2026-08'])
    expect(monthOptions(['2026-10-05'], ['2026-10'])).toEqual(['2026-10'])
  })
})

describe('inMonth', () => {
  it('전체면 다 들고, 아니면 그 달만', () => {
    expect(inMonth('2026-10-09', ALL_MONTHS)).toBe(true)
    expect(inMonth(null, ALL_MONTHS)).toBe(true)
    expect(inMonth('2026-10-09', '2026-10')).toBe(true)
    expect(inMonth('2026-09-30', '2026-10')).toBe(false)
    expect(inMonth(null, '2026-10')).toBe(false)
  })
})

describe('monthLabel', () => {
  it('읽기 쉬운 이름으로', () => {
    expect(monthLabel('2026-10')).toBe('2026년 10월')
    expect(monthLabel('2026-03')).toBe('2026년 3월')
  })
})

describe('matchesQuery', () => {
  it('빈 검색어는 다 통과', () => {
    expect(matchesQuery(['아무거나'], '')).toBe(true)
    expect(matchesQuery([null], '   ')).toBe(true)
  })

  it('어느 칸에든 들어 있으면, 대소문자 무시', () => {
    expect(matchesQuery(['철물 구입', null, '정자동 현장'], '정자')).toBe(true)
    expect(matchesQuery(['GS25 간식'], 'gs25')).toBe(true)
    expect(matchesQuery(['철물 구입', '메모'], '레미콘')).toBe(false)
  })

  it('띄어 쓴 낱말은 모두 있어야 한다(칸은 달라도 된다)', () => {
    expect(matchesQuery(['철물 구입', '', '수원 현장'], '철물 수원')).toBe(true)
    expect(matchesQuery(['철물 구입', '', '수원 현장'], '철물 성남')).toBe(false)
  })
})
