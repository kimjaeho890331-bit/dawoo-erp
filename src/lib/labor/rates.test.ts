import { describe, it, expect } from 'vitest'
import { DEFAULT_RATES, pickRates } from './rates'

const rows = [
  { year: 2026, month: 8, rates: { ...DEFAULT_RATES, pension: 0, health: 0 } },
  { year: 2026, month: 7, rates: { ...DEFAULT_RATES, pension: 1 } },
]

describe('pickRates', () => {
  it('적용 시작월 당월에는 그 줄을 쓴다', () => {
    expect(pickRates(rows, 2026, 7).pension).toBe(1)
    expect(pickRates(rows, 2026, 8).pension).toBe(0)
  })

  it('다음 줄이 나오기 전까지 이후 달에도 계속 쓴다', () => {
    expect(pickRates(rows, 2026, 10).health).toBe(0)
    expect(pickRates(rows, 2027, 1).health).toBe(0)
  })

  it('가장 이른 시작월보다 앞선 달은 기본값이다', () => {
    expect(pickRates(rows, 2025, 12)).toEqual(DEFAULT_RATES)
    expect(pickRates(rows, 2026, 6)).toEqual(DEFAULT_RATES)
  })

  it('등록된 줄이 없으면 기본값이다', () => {
    expect(pickRates([], 2026, 10)).toEqual(DEFAULT_RATES)
  })

  it('줄에 빠진 항목은 기본값으로 채운다', () => {
    expect(pickRates([{ year: 2026, month: 1, rates: { income: 3 } }], 2026, 2)).toEqual({ ...DEFAULT_RATES, income: 3 })
  })
})
