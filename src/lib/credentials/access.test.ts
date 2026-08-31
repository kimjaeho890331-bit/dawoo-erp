import { describe, expect, it } from 'vitest'
import { credentialAccessDeny, credentialDenyBody, pickCredentialStaff } from './access'

describe('credentialAccessDeny', () => {
  it('공유 목록은 역할과 무관하게 통과한다', () => {
    expect(credentialAccessDeny('shared', '직원')).toBeNull()
    expect(credentialAccessDeny('shared', '현장소장')).toBeNull()
    expect(credentialAccessDeny('shared', '경리')).toBeNull()
    expect(credentialAccessDeny('shared', '관리자')).toBeNull()
  })

  it('중요 목록은 관리자가 아니면 권한없음이다', () => {
    expect(credentialAccessDeny('private', '직원')).toEqual({ error: '권한없음', status: 403 })
    expect(credentialAccessDeny('private', '현장소장')).toEqual({ error: '권한없음', status: 403 })
    expect(credentialAccessDeny('private', '경리')).toEqual({ error: '권한없음', status: 403 })
    expect(credentialAccessDeny('private', '대표')).toEqual({ error: '권한없음', status: 403 })
    expect(credentialAccessDeny('private', null)).toEqual({ error: '권한없음', status: 403 })
    expect(credentialAccessDeny('private', '관리자')).toBeNull()
    expect(credentialAccessDeny('private', ' 관리자 ')).toBeNull()
  })

  it('거부 JSON은 권한없음과 빈 목록이다', () => {
    const denied = credentialAccessDeny('private', '직원')
    expect(denied).not.toBeNull()
    expect(credentialDenyBody(denied!.error)).toEqual({ error: '권한없음', items: [] })
  })
})

describe('pickCredentialStaff', () => {
  it('이메일 매핑이 있으면 화면 staff id보다 우선한다', () => {
    expect(pickCredentialStaff({ id: 'email' }, { id: 'actor' })).toEqual({ id: 'email' })
  })

  it('이메일 매핑이 없으면 화면에서 고른 staff id를 쓴다', () => {
    expect(pickCredentialStaff(null, { id: 'actor' })).toEqual({ id: 'actor' })
    expect(pickCredentialStaff(undefined, null)).toBeNull()
  })
})
