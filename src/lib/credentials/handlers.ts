import { NextRequest } from 'next/server'
import type { CredentialKind } from '@/types'
import { requireCredentialStaff } from './guard'
import { parseCreateInput, parseUpdateInput } from './fields'
import {
  createCredential,
  deleteCredential,
  getCredential,
  listCredentials,
  revealCredential,
  updateCredential,
} from './store'

export async function handleList(kind: CredentialKind) {
  const actor = await requireCredentialStaff(kind)
  if (actor instanceof Response) return actor

  const items = await listCredentials(kind)
  if (items instanceof Response) return items
  return Response.json({ items })
}

export async function handleCreate(kind: CredentialKind, request: NextRequest) {
  const actor = await requireCredentialStaff(kind)
  if (actor instanceof Response) return actor

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }

  const parsed = parseCreateInput((body ?? {}) as Record<string, unknown>)
  if ('error' in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }

  const created = await createCredential(kind, parsed, actor.staff.id)
  if (created instanceof Response) return created
  return Response.json({ item: created }, { status: 201 })
}

export async function handleGetOne(kind: CredentialKind, id: string) {
  const actor = await requireCredentialStaff(kind)
  if (actor instanceof Response) return actor
  if (!id) return Response.json({ error: 'id가 필요합니다' }, { status: 400 })

  const item = await getCredential(kind, id)
  if (item instanceof Response) return item
  return Response.json({ item })
}

export async function handleReveal(kind: CredentialKind, id: string) {
  const actor = await requireCredentialStaff(kind)
  if (actor instanceof Response) return actor
  if (!id) return Response.json({ error: 'id가 필요합니다' }, { status: 400 })

  const revealed = await revealCredential(kind, id)
  if (revealed instanceof Response) return revealed
  return Response.json(revealed)
}

export async function handleUpdate(kind: CredentialKind, id: string, request: NextRequest) {
  const actor = await requireCredentialStaff(kind)
  if (actor instanceof Response) return actor
  if (!id) return Response.json({ error: 'id가 필요합니다' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }

  const parsed = parseUpdateInput((body ?? {}) as Record<string, unknown>)
  if ('error' in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }

  const updated = await updateCredential(kind, id, parsed)
  if (updated instanceof Response) return updated
  return Response.json({ item: updated })
}

export async function handleDelete(kind: CredentialKind, id: string) {
  const actor = await requireCredentialStaff(kind)
  if (actor instanceof Response) return actor
  if (!id) return Response.json({ error: 'id가 필요합니다' }, { status: 400 })

  const result = await deleteCredential(kind, id)
  if (result instanceof Response) return result
  return Response.json(result)
}
