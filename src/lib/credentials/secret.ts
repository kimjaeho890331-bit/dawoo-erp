import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

export const CREDENTIAL_ENC_PREFIX = 'enc:v1:'

export class CredentialSecretMissingError extends Error {
  constructor() {
    super('CREDENTIAL_SECRET is required')
    this.name = 'CredentialSecretMissingError'
  }
}

function sha256Key(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

function credentialKey(): Buffer | null {
  const secret = process.env.CREDENTIAL_SECRET
  if (!secret) return null
  return sha256Key(secret)
}

function legacyServiceRoleKey(): Buffer | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return null
  return sha256Key(secret)
}

export function hasCredentialSecret(): boolean {
  return Boolean(process.env.CREDENTIAL_SECRET)
}

function encryptWithKey(value: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return CREDENTIAL_ENC_PREFIX + Buffer.concat([iv, tag, enc]).toString('base64')
}

function decryptWithKey(value: string, key: Buffer): string | null {
  try {
    const raw = Buffer.from(value.slice(CREDENTIAL_ENC_PREFIX.length), 'base64')
    if (raw.length < 28) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const enc = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** 저장 전 암호화. CREDENTIAL_SECRET 없으면 throw — 평문 저장 금지. 값·키는 로그하지 않는다. */
export function encryptPassword(value: string | null): string | null {
  if (value == null || value === '') return value
  const key = credentialKey()
  if (!key) throw new CredentialSecretMissingError()
  return encryptWithKey(value, key)
}

/**
 * 접두 없는 평문은 그대로.
 * enc:v1 은 먼저 CREDENTIAL_SECRET, 실패 시에만 SERVICE_ROLE 한 번(레거시).
 * 복호화 실패 시 null. 값·키는 로그하지 않는다.
 */
export function decryptPassword(value: string | null): string | null {
  if (value == null || value === '') return value
  if (!value.startsWith(CREDENTIAL_ENC_PREFIX)) return value

  const primary = credentialKey()
  if (primary) {
    const out = decryptWithKey(value, primary)
    if (out !== null) return out
  }

  const legacy = legacyServiceRoleKey()
  if (legacy) return decryptWithKey(value, legacy)
  return null
}
