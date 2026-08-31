import { afterEach, describe, expect, it } from 'vitest'
import { decryptPassword, encryptPassword } from './secret'

const ORIGINAL_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ORIGINAL_CREDENTIAL = process.env.CREDENTIAL_SECRET

afterEach(() => {
  if (ORIGINAL_SERVICE === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SERVICE
  if (ORIGINAL_CREDENTIAL === undefined) delete process.env.CREDENTIAL_SECRET
  else process.env.CREDENTIAL_SECRET = ORIGINAL_CREDENTIAL
})

describe('encryptPassword / decryptPassword', () => {
  it('키가 있으면 암호문을 만들고 같은 키로 되돌린다', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret'
    delete process.env.CREDENTIAL_SECRET
    const cipher = encryptPassword('plain-secret')
    expect(cipher).not.toBe('plain-secret')
    expect(cipher?.startsWith('enc:v1:')).toBe(true)
    expect(decryptPassword(cipher)).toBe('plain-secret')
  })

  it('접두 없는 기존 평문은 그대로 읽는다', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret'
    expect(decryptPassword('legacy-plain')).toBe('legacy-plain')
  })

  it('키가 없으면 평문으로 저장한다', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.CREDENTIAL_SECRET
    expect(encryptPassword('plain-secret')).toBe('plain-secret')
    expect(decryptPassword('plain-secret')).toBe('plain-secret')
  })

  it('빈 값은 그대로 둔다', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret'
    expect(encryptPassword(null)).toBeNull()
    expect(encryptPassword('')).toBe('')
    expect(decryptPassword(null)).toBeNull()
  })
})
