import { describe, it, expect } from 'vitest'
import { dateRange, isUuid, shortDate, truncate, withName } from './text'
import { activeIds } from './types'

describe('isUuid', () => {
  it('uuid 모양만 통과시킨다', () => {
    expect(isUuid('0b6f3c1e-8a2d-4c7e-9f10-1234567890ab')).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(123)).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })
})

describe('shortDate / dateRange', () => {
  it('YYYY-MM-DD를 M/D로 바꾼다', () => {
    expect(shortDate('2026-10-20')).toBe('10/20')
    expect(shortDate('2026-01-05')).toBe('1/5')
  })
  it('형식이 아니면 그대로 둔다', () => {
    expect(shortDate('내일')).toBe('내일')
  })
  it('같은 날이면 하루만, 아니면 범위로', () => {
    expect(dateRange('2026-10-20', '2026-10-20')).toBe('10/20')
    expect(dateRange('2026-10-20', '2026-10-22')).toBe('10/20~10/22')
  })
})

describe('truncate', () => {
  it('짧으면 그대로', () => {
    expect(truncate('도면 출력')).toBe('도면 출력')
  })
  it('길면 잘라서 말줄임표를 붙인다', () => {
    const out = truncate('가'.repeat(50))
    expect(out).toBe(`${'가'.repeat(40)}…`)
  })
  it('줄바꿈과 연속 공백을 한 칸으로 줄인다', () => {
    expect(truncate('  현장 사진\n\n올려 주세요  ')).toBe('현장 사진 올려 주세요')
  })
})

describe('withName', () => {
  it('이름이 있으면 앞에 붙이고, 없으면 내용만', () => {
    expect(withName('김재호', '도면 출력')).toBe('김재호: 도면 출력')
    expect(withName(undefined, '도면 출력')).toBe('도면 출력')
  })
})

describe('activeIds', () => {
  const staff = [
    { id: 'a', name: '갑' },
    { id: 'b', name: '을', resign_date: '2026-09-01' },
  ]
  it('퇴사자·없는 직원·빈 값을 빼고 중복을 없앤다', () => {
    expect(activeIds(['a', 'a', 'b', 'x', null, undefined], staff)).toEqual(['a'])
  })
})
