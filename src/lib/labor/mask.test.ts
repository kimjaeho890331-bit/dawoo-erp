import { describe, it, expect } from 'vitest'
import { maskResidentId } from './mask'

describe('maskResidentId', () => {
  it('뒷자리 첫 숫자만 남기고 가린다', () => {
    expect(maskResidentId('900101-1234567')).toBe('900101-1******')
    expect(maskResidentId('9001011234567')).toBe('900101-1******')
  })
  it('형식이 아니면 그대로 둔다', () => {
    expect(maskResidentId('')).toBe('')
    expect(maskResidentId('900101-12')).toBe('900101-12')
    expect(maskResidentId('외국인')).toBe('외국인')
  })
})
