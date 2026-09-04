import { describe, expect, it, vi } from 'vitest'
import { pickEmailMappedStaff, resolveCredentialActor, type CredentialStaff } from './resolveStaff'

const adminStaff: CredentialStaff = { id: 's-admin', name: '관리자', role: '관리자' }
const workerStaff: CredentialStaff = { id: 's-worker', name: '직원', role: '직원' }

describe('resolveCredentialActor', () => {
  it('x-actor-staff-id로 staff를 찾으면 이메일 조회를 생략한다', async () => {
    const byId = vi.fn().mockResolvedValue(adminStaff)
    const byEmail = vi.fn()

    await expect(
      resolveCredentialActor('shared', {
        user: { email: 'kakao@example.com' },
        actorStaffId: 's-admin',
        lookup: { byId, byEmail },
      }),
    ).resolves.toEqual({ ok: true, staff: adminStaff, authEmail: 'kakao@example.com' })

    expect(byId).toHaveBeenCalledWith('s-admin')
    expect(byEmail).not.toHaveBeenCalled()
  })

  it('헤더 staff 조회가 실패하면 이메일 경로로 폴백한다', async () => {
    const byId = vi.fn().mockResolvedValue(null)
    const byEmail = vi.fn().mockResolvedValue(workerStaff)

    await expect(
      resolveCredentialActor('shared', {
        user: { email: 'worker@dawoo.co.kr' },
        actorStaffId: 'missing',
        lookup: { byId, byEmail },
      }),
    ).resolves.toEqual({ ok: true, staff: workerStaff, authEmail: 'worker@dawoo.co.kr' })

    expect(byId).toHaveBeenCalledWith('missing')
    expect(byEmail).toHaveBeenCalledWith('worker@dawoo.co.kr')
  })

  it('헤더가 없으면 이메일만 조회한다', async () => {
    const byId = vi.fn()
    const byEmail = vi.fn().mockResolvedValue(workerStaff)

    await expect(
      resolveCredentialActor('shared', {
        user: { email: 'worker@dawoo.co.kr' },
        actorStaffId: null,
        lookup: { byId, byEmail },
      }),
    ).resolves.toEqual({ ok: true, staff: workerStaff, authEmail: 'worker@dawoo.co.kr' })

    expect(byId).not.toHaveBeenCalled()
    expect(byEmail).toHaveBeenCalledWith('worker@dawoo.co.kr')
  })

  it('로그인 이메일이 없으면 401이다', async () => {
    const byId = vi.fn()
    const byEmail = vi.fn()

    await expect(
      resolveCredentialActor('shared', {
        user: null,
        actorStaffId: 's-admin',
        lookup: { byId, byEmail },
      }),
    ).resolves.toEqual({ ok: false, message: '인증이 필요합니다', status: 401 })

    expect(byId).not.toHaveBeenCalled()
    expect(byEmail).not.toHaveBeenCalled()
  })

  it('staff를 못 찾으면 403이다', async () => {
    await expect(
      resolveCredentialActor('shared', {
        user: { email: 'unknown@dawoo.co.kr' },
        actorStaffId: null,
        lookup: { byId: vi.fn(), byEmail: vi.fn().mockResolvedValue(null) },
      }),
    ).resolves.toEqual({ ok: false, message: '등록되지 않은 직원입니다', status: 403 })
  })

  it('중요 목록은 관리자가 아니면 권한없음이다', async () => {
    await expect(
      resolveCredentialActor('private', {
        user: { email: 'worker@dawoo.co.kr' },
        actorStaffId: 's-worker',
        lookup: { byId: vi.fn().mockResolvedValue(workerStaff), byEmail: vi.fn() },
      }),
    ).resolves.toEqual({ ok: false, message: '권한없음', status: 403 })
  })

  it('중요 목록은 관리자면 통과한다', async () => {
    await expect(
      resolveCredentialActor('private', {
        user: { email: 'admin@dawoo.co.kr' },
        actorStaffId: 's-admin',
        lookup: { byId: vi.fn().mockResolvedValue(adminStaff), byEmail: vi.fn() },
      }),
    ).resolves.toEqual({ ok: true, staff: adminStaff, authEmail: 'admin@dawoo.co.kr' })
  })
})

describe('pickEmailMappedStaff', () => {
  it('staff_emails 매핑이 있으면 staff.email보다 우선한다', () => {
    expect(pickEmailMappedStaff(adminStaff, workerStaff)).toEqual(adminStaff)
    expect(pickEmailMappedStaff(null, workerStaff)).toEqual(workerStaff)
    expect(pickEmailMappedStaff(undefined, null)).toBeNull()
  })
})
