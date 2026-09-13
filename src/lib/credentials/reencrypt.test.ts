import { afterEach, describe, expect, it } from 'vitest'
import {
  applyReencryptRow,
  emptyReencryptCounts,
  reencryptStoredPassword,
  reencryptUnavailableReason,
} from './reencrypt'
import { CREDENTIAL_ENC_PREFIX, decryptPassword, encryptPassword } from './secret'

const ORIGINAL_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ORIGINAL_CREDENTIAL = process.env.CREDENTIAL_SECRET

afterEach(() => {
  if (ORIGINAL_SERVICE === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SERVICE
  if (ORIGINAL_CREDENTIAL === undefined) delete process.env.CREDENTIAL_SECRET
  else process.env.CREDENTIAL_SECRET = ORIGINAL_CREDENTIAL
})

describe('reencryptStoredPassword', () => {
  it('빈 값은 건너뛴다', () => {
    process.env.CREDENTIAL_SECRET = 'test-credential-secret'
    expect(reencryptStoredPassword(null)).toEqual({ status: 'skipped_empty' })
    expect(reencryptStoredPassword('')).toEqual({ status: 'skipped_empty' })
    expect(reencryptStoredPassword('   ')).toEqual({ status: 'skipped_empty' })
  })

  it('평문은 CREDENTIAL_SECRET으로 암호문만 만든다', () => {
    process.env.CREDENTIAL_SECRET = 'test-credential-secret'
    const result = reencryptStoredPassword('legacy-plain')
    expect(result.status).toBe('encrypted')
    if (result.status !== 'encrypted') return
    expect(result.next.startsWith(CREDENTIAL_ENC_PREFIX)).toBe(true)
    expect(result.next).not.toBe('legacy-plain')
  })

  it('레거시 SERVICE_ROLE 암호문을 CREDENTIAL_SECRET으로 다시 넣는다', () => {
    process.env.CREDENTIAL_SECRET = 'test-legacy-service-role'
    const legacyCipher = encryptPassword('plain-secret')
    process.env.CREDENTIAL_SECRET = 'test-credential-secret'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-legacy-service-role'
    const result = reencryptStoredPassword(legacyCipher)
    expect(result.status).toBe('encrypted')
    if (result.status !== 'encrypted') return
    expect(result.next.startsWith(CREDENTIAL_ENC_PREFIX)).toBe(true)
    expect(result.next).not.toBe(legacyCipher)
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.CREDENTIAL_SECRET = 'test-credential-secret'
    expect(decryptPassword(result.next)).toBe('plain-secret')
  })

  it('키가 없으면 실패로만 센다', () => {
    delete process.env.CREDENTIAL_SECRET
    expect(reencryptStoredPassword('legacy-plain')).toEqual({ status: 'failed' })
    expect(reencryptUnavailableReason()).toEqual({
      error: '암호화 키가 설정되지 않았습니다',
      status: 503,
    })
  })

  it('키가 있으면 재암호화 API 사전점검을 통과한다', () => {
    process.env.CREDENTIAL_SECRET = 'test-credential-secret'
    expect(reencryptUnavailableReason()).toBeNull()
  })

  it('건수에 비밀번호를 넣지 않는다', () => {
    const counts = emptyReencryptCounts()
    applyReencryptRow(counts, { status: 'encrypted', next: 'enc:v1:x' })
    applyReencryptRow(counts, { status: 'skipped_empty' })
    applyReencryptRow(counts, { status: 'failed' })
    expect(counts).toEqual({
      total: 0,
      encrypted: 1,
      skipped_empty: 1,
      failed: 1,
    })
    expect(JSON.stringify(counts)).not.toContain('enc:v1')
  })
})
