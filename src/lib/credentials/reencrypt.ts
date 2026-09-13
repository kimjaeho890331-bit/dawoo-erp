import {
  decryptPassword,
  encryptPassword,
  hasCredentialSecret,
} from './secret'

export type ReencryptCounts = {
  total: number
  encrypted: number
  skipped_empty: number
  failed: number
}

export type ReencryptRowResult =
  | { status: 'skipped_empty' }
  | { status: 'encrypted'; next: string }
  | { status: 'failed' }

function isEmptyPassword(value: string | null): boolean {
  return value == null || value.trim() === ''
}

/** 한 행: decrypt(현재 규칙) → encrypt(CREDENTIAL_SECRET만). 값·키는 로그하지 않는다. */
export function reencryptStoredPassword(stored: string | null): ReencryptRowResult {
  if (isEmptyPassword(stored)) return { status: 'skipped_empty' }
  const plain = decryptPassword(stored)
  if (plain == null || isEmptyPassword(plain)) return { status: 'failed' }
  try {
    const next = encryptPassword(plain)
    if (next == null || next === '') return { status: 'failed' }
    return { status: 'encrypted', next }
  } catch {
    return { status: 'failed' }
  }
}

export function emptyReencryptCounts(): ReencryptCounts {
  return { total: 0, encrypted: 0, skipped_empty: 0, failed: 0 }
}

/** CREDENTIAL_SECRET 없으면 재암호화 API는 503. */
export function reencryptUnavailableReason(): { error: string; status: number } | null {
  if (!hasCredentialSecret()) {
    return { error: '암호화 키가 설정되지 않았습니다', status: 503 }
  }
  return null
}

export function applyReencryptRow(
  counts: ReencryptCounts,
  result: ReencryptRowResult,
): void {
  if (result.status === 'encrypted') counts.encrypted += 1
  else if (result.status === 'skipped_empty') counts.skipped_empty += 1
  else counts.failed += 1
}

