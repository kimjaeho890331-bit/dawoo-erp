import { describe, expect, it } from 'vitest'
import { canSeeLedger } from './ledgerAccess'

describe('canSeeLedger', () => {
  it('임원/경리만 경리 칸을 본다', () => {
    expect(canSeeLedger('관리자')).toBe(true)
    expect(canSeeLedger('대표')).toBe(true)
    expect(canSeeLedger('경리')).toBe(true)
    expect(canSeeLedger('직원')).toBe(false)
    expect(canSeeLedger('현장소장')).toBe(false)
    expect(canSeeLedger(null)).toBe(false)
  })
})
