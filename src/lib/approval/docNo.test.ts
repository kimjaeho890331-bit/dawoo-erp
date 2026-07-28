import { describe, it, expect } from 'vitest'
import { formatDocNo } from './docNo'

describe('formatDocNo', () => {
  it('양식약어-년2자리-순번6자리로 만든다', () => {
    expect(formatDocNo('CDV', 2026, 158)).toBe('CDV-26-000158')
  })

  it('순번을 6자리로 채운다', () => {
    expect(formatDocNo('CDV', 2026, 1)).toBe('CDV-26-000001')
  })

  it('연도가 2자리 미만이면 0을 채운다', () => {
    expect(formatDocNo('CDV', 2100, 7)).toBe('CDV-00-000007')
  })

  it('6자리를 넘으면 자르지 않는다', () => {
    expect(formatDocNo('CDV', 2026, 1234567)).toBe('CDV-26-1234567')
  })
})
