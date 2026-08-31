import type { CredentialEntry } from '@/types'

export type CredentialListItem = Omit<CredentialEntry, 'password'>

/** 목록·단건 GET·저장 응답. password 컬럼을 넣지 않는다(복호화는 reveal POST만). */
export const CREDENTIAL_LIST_COLUMNS =
  'id, kind, name, url, login_id, memo, created_by, updated_at'

export type CredentialInput = {
  name?: unknown
  url?: unknown
  login_id?: unknown
  password?: unknown
  memo?: unknown
}

export type CredentialCreatePayload = {
  name: string
  url: string | null
  login_id: string | null
  password: string | null
  memo: string | null
}

function asText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function parseCreateInput(body: CredentialInput): CredentialCreatePayload | { error: string } {
  const name = asText(body.name)
  if (!name) return { error: '사이트/서비스 이름을 입력해 주세요' }
  return {
    name,
    url: asText(body.url),
    login_id: asText(body.login_id),
    password: asText(body.password),
    memo: asText(body.memo),
  }
}

export function parseUpdateInput(body: CredentialInput): Record<string, string | null> | { error: string } {
  const patch: Record<string, string | null> = {}
  if ('name' in body) {
    const name = asText(body.name)
    if (!name) return { error: '사이트/서비스 이름을 입력해 주세요' }
    patch.name = name
  }
  if ('url' in body) patch.url = asText(body.url)
  if ('login_id' in body) patch.login_id = asText(body.login_id)
  // 수정 시 빈 비밀번호는 "그대로" — 평문을 다시 받지 않는다.
  if ('password' in body) {
    const password = asText(body.password)
    if (password) patch.password = password
  }
  if ('memo' in body) patch.memo = asText(body.memo)
  return patch
}

export function omitPassword<T extends object>(row: T): Omit<T, 'password'> {
  const copy = { ...row } as T & { password?: unknown }
  delete copy.password
  return copy
}
