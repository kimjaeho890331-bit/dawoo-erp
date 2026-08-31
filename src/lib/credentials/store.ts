import type { CredentialKind } from '@/types'
import { admin } from './guard'
import {
  CREDENTIAL_LIST_COLUMNS,
  omitPassword,
  type CredentialCreatePayload,
  type CredentialListItem,
} from './fields'
import { decryptPassword, encryptPassword } from './secret'

export type { CredentialCreatePayload, CredentialInput, CredentialListItem } from './fields'
export { omitPassword, parseCreateInput, parseUpdateInput } from './fields'

export async function listCredentials(kind: CredentialKind): Promise<CredentialListItem[] | Response> {
  const { data, error } = await admin
    .from('credential_entries')
    .select(CREDENTIAL_LIST_COLUMNS)
    .eq('kind', kind)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[credentials] 목록 조회 실패:', error.message)
    return Response.json({ error: '목록을 불러오지 못했습니다', items: [] }, { status: 500 })
  }

  return ((data ?? []) as CredentialListItem[]).map((row) => omitPassword(row))
}

export async function getCredential(
  kind: CredentialKind,
  id: string,
): Promise<CredentialListItem | Response> {
  const { data, error } = await admin
    .from('credential_entries')
    .select(CREDENTIAL_LIST_COLUMNS)
    .eq('kind', kind)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[credentials] 단건 조회 실패:', error.message)
    return Response.json({ error: '조회에 실패했습니다' }, { status: 500 })
  }
  if (!data) {
    return Response.json({ error: '항목을 찾을 수 없습니다' }, { status: 404 })
  }
  return omitPassword(data as CredentialListItem)
}

export async function revealCredential(
  kind: CredentialKind,
  id: string,
): Promise<{ password: string | null } | Response> {
  const { data, error } = await admin
    .from('credential_entries')
    .select('password')
    .eq('kind', kind)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[credentials] 비밀번호 조회 실패')
    return Response.json({ error: '조회에 실패했습니다' }, { status: 500 })
  }
  if (!data) {
    return Response.json({ error: '항목을 찾을 수 없습니다' }, { status: 404 })
  }

  return { password: decryptPassword((data.password as string | null) ?? null) }
}

export async function createCredential(
  kind: CredentialKind,
  input: CredentialCreatePayload,
  createdBy: string,
): Promise<CredentialListItem | Response> {
  const { data, error } = await admin
    .from('credential_entries')
    .insert({
      kind,
      name: input.name,
      url: input.url,
      login_id: input.login_id,
      password: encryptPassword(input.password),
      memo: input.memo,
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    })
    .select(CREDENTIAL_LIST_COLUMNS)
    .single()

  if (error) {
    console.error('[credentials] 등록 실패 name=', input.name, error.message)
    return Response.json({ error: '등록에 실패했습니다' }, { status: 500 })
  }
  return omitPassword(data as CredentialListItem)
}

export async function updateCredential(
  kind: CredentialKind,
  id: string,
  patch: Record<string, string | null>,
): Promise<CredentialListItem | Response> {
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: '수정할 내용이 없습니다' }, { status: 400 })
  }

  const stored: Record<string, string | null> = { ...patch }
  if (typeof stored.password === 'string') {
    stored.password = encryptPassword(stored.password)
  }

  const { data, error } = await admin
    .from('credential_entries')
    .update({
      ...stored,
      updated_at: new Date().toISOString(),
    })
    .eq('kind', kind)
    .eq('id', id)
    .select(CREDENTIAL_LIST_COLUMNS)
    .maybeSingle()

  if (error) {
    console.error('[credentials] 수정 실패 id=', id, error.message)
    return Response.json({ error: '수정에 실패했습니다' }, { status: 500 })
  }
  if (!data) {
    return Response.json({ error: '항목을 찾을 수 없습니다' }, { status: 404 })
  }
  return omitPassword(data as CredentialListItem)
}

export async function deleteCredential(
  kind: CredentialKind,
  id: string,
): Promise<{ ok: true } | Response> {
  const { data, error } = await admin
    .from('credential_entries')
    .delete()
    .eq('kind', kind)
    .eq('id', id)
    .select('id, name')
    .maybeSingle()

  if (error) {
    console.error('[credentials] 삭제 실패 id=', id, error.message)
    return Response.json({ error: '삭제에 실패했습니다' }, { status: 500 })
  }
  if (!data) {
    return Response.json({ error: '항목을 찾을 수 없습니다' }, { status: 404 })
  }
  return { ok: true }
}
