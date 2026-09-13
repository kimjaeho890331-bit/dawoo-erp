import { afterEach, describe, expect, it } from 'vitest'
import {
  CREDENTIAL_ENC_PREFIX,
  CredentialSecretMissingError,
  decryptPassword,
  encryptPassword,
  hasCredentialSecret,
} from './secret'

const ORIGINAL_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ORIGINAL_CREDENTIAL = process.env.CREDENTIAL_SECRET

afterEach(() => {
  if (ORIGINAL_SERVICE === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SERVICE
  if (ORIGINAL_CREDENTIAL === undefined) delete process.env.CREDENTIAL_SECRET
  else process.env.CREDENTIAL_SECRET = ORIGINAL_CREDENTIAL
})

describe('encryptPassword / decryptPassword', () => {
  it('키가 없으면 encrypt가 실패한다', () => {
    delete process.env.CREDENTIAL_SECRET
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(hasCredentialSecret()).toBe(false)
    expect(() => encryptPassword('plain-secret')).toThrow(CredentialSecretMissingError)
  })

  it('SERVICE_ROLE만 있어도 encrypt는 실패한다(평문 저장 금지)', () => {
    delete process.env.CREDENTIAL_SECRET
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret'
    expect(() => encryptPassword('plain-secret')).toThrow(CredentialSecretMissingError)
  })

  it('enc:v1 왕복은 CREDENTIAL_SECRET만 쓴다', () => {
    process.env.CREDENTIAL_SECRET = 'test-credential-secret'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const cipher = encryptPassword('plain-secret')
    expect(cipher).not.toBe('plain-secret')
    expect(cipher?.startsWith(CREDENTIAL_ENC_PREFIX)).toBe(true)
    expect(decryptPassword(cipher)).toBe('plain-secret')
  })

  it('접두 없는 평문 입력은 decrypt가 그대로 통과한다', () => {
    delete process.env.CREDENTIAL_SECRET
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(decryptPassword('legacy-plain')).toBe('legacy-plain')
  })

  it('enc:v1이 CREDENTIAL_SECRET로 실패하면 SERVICE_ROLE로 한 번 더 시도한다', () => {
    process.env.CREDENTIAL_SECRET = 'test-legacy-service-role'
    const legacyCipher = encryptPassword('plain-secret')
    process.env.CREDENTIAL_SECRET = 'test-credential-secret'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-legacy-service-role'
    expect(decryptPassword(legacyCipher)).toBe('plain-secret')
  })

  it('빈 값은 그대로 둔다', () => {
    process.env.CREDENTIAL_SECRET = 'test-credential-secret'
    expect(encryptPassword(null)).toBeNull()
    expect(encryptPassword('')).toBe('')
    expect(decryptPassword(null)).toBeNull()
    expect(decryptPassword('')).toBe('')
  })
})
