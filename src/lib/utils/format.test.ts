import { describe, expect, it } from 'vitest'
import { safeMoney } from './format'

describe('safeMoney', () => {
  it('유한한 숫자만 통과하고 null·undefined 는 0이다', () => {
    expect(safeMoney(1500000)).toBe(1500000)
    expect(safeMoney(0)).toBe(0)
    expect(safeMoney(null)).toBe(0)
    expect(safeMoney(undefined)).toBe(0)
    expect(safeMoney(Number.NaN)).toBe(0)
    expect(safeMoney('1,200')).toBe(0)
  })
})
