import { describe, expect, it } from 'vitest'
import {
  SHARED_MEMO_REJECT_ERROR,
  isSharedMemoSecretLine,
  sanitizeSharedMemo,
  sharedMemoRejectError,
  visibleCredentialMemo,
} from './sharedMemo'

describe('isSharedMemoSecretLine / sanitizeSharedMemo', () => {
  it('이체 비번 숫자 줄을 뺀다', () => {
    expect(isSharedMemoSecretLine('이체 비번 1234')).toBe(true)
    expect(sanitizeSharedMemo('이체 비번 1234')).toBeNull()
    expect(sanitizeSharedMemo('현장 공용\n이체 비번 1234')).toBe('현장 공용')
  })

  it('OTP 숫자 줄을 뺀다', () => {
    expect(isSharedMemoSecretLine('OTP 567890')).toBe(true)
    expect(sanitizeSharedMemo('OTP 567890')).toBeNull()
    expect(sanitizeSharedMemo('만료 확인\nOTP 567890')).toBe('만료 확인')
  })

  it('통장비밀번호 숫자 줄을 뺀다', () => {
    expect(isSharedMemoSecretLine('통장비밀번호: 0000')).toBe(true)
    expect(sanitizeSharedMemo('통장비밀번호: 0000')).toBeNull()
  })

  it('일반 메모는 남긴다', () => {
    expect(sanitizeSharedMemo('현장 공용, 만료 26년')).toBe('현장 공용, 만료 26년')
  })

  it('전화번호는 비번 라벨이 없으면 남긴다', () => {
    expect(sanitizeSharedMemo('연락 010-1234-5678')).toBe('연락 010-1234-5678')
    expect(sanitizeSharedMemo('비번 010-1234-5678')).toBeNull()
  })

  it('비밀 줄만 있으면 빈 메모가 된다', () => {
    expect(sanitizeSharedMemo('이체 비번 1234\nOTP 567890')).toBeNull()
  })

  it('비밀번호 안내만 있고 숫자가 없으면 남긴다', () => {
    expect(sanitizeSharedMemo('비밀번호 변경 필요')).toBe('비밀번호 변경 필요')
  })
})

describe('visibleCredentialMemo', () => {
  it('private 종류는 메모를 그대로 둔다', () => {
    expect(visibleCredentialMemo('private', '이체 비번 1234')).toBe('이체 비번 1234')
    expect(visibleCredentialMemo('private', 'OTP 567890')).toBe('OTP 567890')
  })

  it('shared 종류만 비밀 줄을 뺀다', () => {
    expect(visibleCredentialMemo('shared', '현장 공용\n이체 비번 1234')).toBe('현장 공용')
    expect(visibleCredentialMemo('shared', null)).toBeNull()
  })
})

describe('sharedMemoRejectError', () => {
  it('공유 메모에 비밀 줄이 있으면 거절하고 비밀번호로 옮기지 않는다', () => {
    expect(sharedMemoRejectError('이체 비번 1234')).toBe(SHARED_MEMO_REJECT_ERROR)
    expect(sharedMemoRejectError('현장 공용')).toBeNull()
    expect(sharedMemoRejectError(null)).toBeNull()
  })
})
