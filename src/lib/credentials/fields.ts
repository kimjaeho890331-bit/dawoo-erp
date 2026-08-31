import type { CredentialEntry } from '@/types'

export type CredentialListItem = Omit<CredentialEntry, 'password'>

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
  if ('password' in body) patch.password = asText(body.password)
  if ('memo' in body) patch.memo = asText(body.memo)
  return patch
}

export function omitPassword<T extends object>(row: T): Omit<T, 'password'> {
  const copy = { ...row } as T & { password?: unknown }
  delete copy.password
  return copy
}
