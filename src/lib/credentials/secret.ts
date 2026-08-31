import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const PREFIX = 'enc:v1:'

function keyBytes(): Buffer | null {
  const secret = process.env.CREDENTIAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return null
  return createHash('sha256').update(secret).digest()
}

/** 저장 전 암호화. 키가 없거나 실패하면 평문 그대로 둔다(배포 env 없는 경우 페이지가 깨지지 않게). */
export function encryptPassword(value: string | null): string | null {
  if (value == null || value === '') return value
  const key = keyBytes()
  if (!key) return value
  try {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64')
  } catch {
    return value
  }
}

/** 이미 평문인 값(접두 없음)은 그대로. 복호화 실패 시 null. 값은 로그하지 않는다. */
export function decryptPassword(value: string | null): string | null {
  if (value == null || value === '') return value
  if (!value.startsWith(PREFIX)) return value
  const key = keyBytes()
  if (!key) return null
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
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
