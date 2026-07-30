import { describe, it, expect } from 'vitest'
import { buildTemplate, parseWorkbook, normalizeDate, toAmount } from './excel'

describe('normalizeDate', () => {
  it('Date를 YYYY-MM-DD로 바꾼다', () => {
    expect(normalizeDate(new Date('2026-07-24T00:00:00Z'))).toBe('2026-07-24')
  })

  it('2026.07.24 형식을 받아준다', () => {
    expect(normalizeDate('2026.07.24')).toBe('2026-07-24')
  })

  it('2026/7/4 형식을 받아준다', () => {
    expect(normalizeDate('2026/7/4')).toBe('2026-07-04')
  })

  it('알 수 없는 값은 null', () => {
    expect(normalizeDate('내일')).toBeNull()
    expect(normalizeDate(null)).toBeNull()
  })
})

describe('toAmount', () => {
  it('숫자를 그대로 돌려준다', () => {
    expect(toAmount(9900000)).toBe(9900000)
  })

  it('9,900,000 같은 문자열에서 숫자만 뽑는다', () => {
    expect(toAmount('9,900,000')).toBe(9900000)
  })

  it('숫자가 없으면 null', () => {
    expect(toAmount('없음')).toBeNull()
    expect(toAmount(null)).toBeNull()
  })
})

describe('buildTemplate + parseWorkbook 왕복', () => {
  it('빈 양식을 만들고 다시 읽으면 행이 0건이다', async () => {
    const buf = await buildTemplate()
    const out = await parseWorkbook(buf)
    expect(out.payments).toEqual([])
    expect(out.details).toEqual([])
    expect(out.errors).toEqual([])
  })
})
