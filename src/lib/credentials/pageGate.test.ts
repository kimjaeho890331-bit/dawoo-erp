import { describe, expect, it } from 'vitest'
import {
  resolveCredentialPageGate,
  resolvePageStaff,
  shouldRevokePageOnListStatus,
} from './pageGate'

describe('resolveCredentialPageGate', () => {
  it('공유 목록은 로그인 staff면 통과한다', () => {
    expect(resolveCredentialPageGate('shared', { role: '직원' })).toBe('ok')
    expect(resolveCredentialPageGate('shared', { role: '경리' })).toBe('ok')
    expect(resolveCredentialPageGate('shared', { role: '관리자' })).toBe('ok')
  })

  it('중요 목록은 관리자만 통과한다', () => {
    expect(resolveCredentialPageGate('private', { role: '관리자' })).toBe('ok')
    expect(resolveCredentialPageGate('private', { role: ' 관리자 ' })).toBe('ok')
    expect(resolveCredentialPageGate('private', { role: '대표' })).toBe('denied')
    expect(resolveCredentialPageGate('private', { role: '경리' })).toBe('denied')
    expect(resolveCredentialPageGate('private', { role: '직원' })).toBe('denied')
  })

  it('staff가 없으면 거부한다', () => {
    expect(resolveCredentialPageGate('shared', null)).toBe('denied')
    expect(resolveCredentialPageGate('private', undefined)).toBe('denied')
  })
})

describe('resolvePageStaff', () => {
  it('화면에서 고른 직원이 있으면 이메일 매핑보다 먼저 쓴다', () => {
    expect(resolvePageStaff({ role: '관리자' }, { role: '직원' })).toEqual({ role: '관리자' })
    expect(resolvePageStaff(null, { role: '직원' })).toEqual({ role: '직원' })
    expect(resolvePageStaff(undefined, null)).toBeNull()
  })
})

describe('shouldRevokePageOnListStatus', () => {
  it('이미 허용된 페이지는 목록 401/403으로 닫지 않는다', () => {
    expect(shouldRevokePageOnListStatus('ok', 401)).toBe(false)
    expect(shouldRevokePageOnListStatus('ok', 403)).toBe(false)
    expect(shouldRevokePageOnListStatus('ok', 500)).toBe(false)
  })

  it('게이트가 아직 안 끝났을 때만 401/403이 deny 후보가 된다', () => {
    expect(shouldRevokePageOnListStatus('checking', 401)).toBe(true)
    expect(shouldRevokePageOnListStatus('checking', 403)).toBe(true)
    expect(shouldRevokePageOnListStatus('denied', 401)).toBe(true)
    expect(shouldRevokePageOnListStatus('checking', 500)).toBe(false)
    expect(shouldRevokePageOnListStatus('checking', 200)).toBe(false)
  })
})
