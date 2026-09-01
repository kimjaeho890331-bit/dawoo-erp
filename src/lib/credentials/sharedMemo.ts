import type { CredentialKind } from '@/types'

/** 공유 메모에 통장·이체·OTP 숫자를 넣었을 때 저장을 거절하는 안내. */
export const SHARED_MEMO_REJECT_ERROR =
  '통장·이체·OTP 비번은 메모에 적지 마세요. 비밀번호 칸 또는 중요 ID/PW에 넣어 주세요.'

const PIN_LABEL_RE = /(?:비밀번호|비번|\bpin\b|password)/i
const OTP_RE = /otp/i
const SECURITY_CARD_RE = /보안카드/
const AUTH_NUMBER_RE = /(?:통장|이체|인증)\s*번호/

function digitCount(line: string): number {
  return (line.match(/\d/g) ?? []).length
}

/** 한 줄이 통장/이체/OTP/보안카드/인증 비번 + 숫자인지. */
export function isSharedMemoSecretLine(line: string): boolean {
  const text = line.trim()
  if (!text) return false
  const digits = digitCount(text)

  if (OTP_RE.test(text) && digits >= 4) return true
  if (SECURITY_CARD_RE.test(text) && digits >= 2) return true
  if (PIN_LABEL_RE.test(text) && digits >= 4) return true
  if (AUTH_NUMBER_RE.test(text) && digits >= 4) return true
  return false
}

function memoHasSecretLine(memo: string): boolean {
  return memo.split(/\r?\n/).some(isSharedMemoSecretLine)
}

/**
 * 공유 목록/조회용. 비밀 숫자 줄만 빼고, 남은 안내 문구는 유지한다.
 * 줄 전체가 비밀이면 null.
 */
export function sanitizeSharedMemo(memo: string | null | undefined): string | null {
  if (memo == null) return null
  if (typeof memo !== 'string') return null
  const kept = memo.split(/\r?\n/).filter((line) => !isSharedMemoSecretLine(line))
  const next = kept.join('\n').trim()
  return next === '' ? null : next
}

/** 공유 저장 시 비밀 줄이 있으면 거절 문구. 비밀번호 칸으로 옮기지 않는다. */
export function sharedMemoRejectError(memo: string | null | undefined): string | null {
  if (memo == null || memo === '') return null
  return memoHasSecretLine(memo) ? SHARED_MEMO_REJECT_ERROR : null
}

/** private는 그대로. shared만 비밀 줄을 뺀다. */
export function visibleCredentialMemo(
  kind: CredentialKind,
  memo: string | null | undefined,
): string | null {
  if (memo == null) return null
  if (kind !== 'shared') return memo
  return sanitizeSharedMemo(memo)
}
