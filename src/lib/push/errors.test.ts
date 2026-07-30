import { describe, it, expect } from 'vitest'
import { isExpiredSubscriptionError } from './errors'

describe('isExpiredSubscriptionError', () => {
  it('410 Gone은 만료된 구독으로 판단한다', () => {
    expect(isExpiredSubscriptionError({ statusCode: 410 })).toBe(true)
  })

  it('404 Not Found도 만료된 구독으로 판단한다', () => {
    expect(isExpiredSubscriptionError({ statusCode: 404 })).toBe(true)
  })

  it('그 외 상태코드(예: 429, 500)는 만료로 보지 않는다', () => {
    expect(isExpiredSubscriptionError({ statusCode: 429 })).toBe(false)
    expect(isExpiredSubscriptionError({ statusCode: 500 })).toBe(false)
  })

  it('statusCode가 없는 오류는 만료로 보지 않는다', () => {
    expect(isExpiredSubscriptionError(new Error('network down'))).toBe(false)
  })

  it('null/undefined 입력에도 던지지 않는다', () => {
    expect(isExpiredSubscriptionError(null)).toBe(false)
    expect(isExpiredSubscriptionError(undefined)).toBe(false)
  })
})
