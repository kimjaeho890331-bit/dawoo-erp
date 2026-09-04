import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { getAuthUser } from '@/lib/auth'
import { credentialDenyBody } from './access'
import {
  pickEmailMappedStaff,
  resolveCredentialActor,
  type CredentialStaff,
  type ResolvedCredentialStaff,
} from './resolveStaff'
import type { CredentialKind } from '@/types'

export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export type { CredentialStaff, ResolvedCredentialStaff }

function deny(message: string, status: number) {
  return Response.json(credentialDenyBody(message), { status })
}

async function lookupStaffByEmail(email: string): Promise<CredentialStaff | null> {
  const normalized = email.trim()

  const [mappedResult, byEmailResult] = await Promise.all([
    admin
      .from('staff_emails')
      .select('staff:staff_id(id, name, role)')
      .ilike('email', normalized)
      .maybeSingle(),
    admin
      .from('staff')
      .select('id, name, role')
      .ilike('email', normalized)
      .maybeSingle(),
  ])

  if (mappedResult.error) {
    console.error('[credentials] staff_emails 조회 실패:', mappedResult.error.message)
  }
  if (byEmailResult.error) {
    console.error('[credentials] staff 조회 실패:', byEmailResult.error.message)
  }

  const mappedStaff = mappedResult.data?.staff as unknown as CredentialStaff | null
  return pickEmailMappedStaff(mappedStaff, (byEmailResult.data as CredentialStaff | null) ?? null)
}

async function lookupStaffById(id: string): Promise<CredentialStaff | null> {
  const { data, error } = await admin
    .from('staff')
    .select('id, name, role')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[credentials] staff 조회 실패:', error.message)
  }

  return (data as CredentialStaff | null) ?? null
}

async function actorStaffIdFromHeader(): Promise<string | null> {
  const headerStore = await headers()
  const raw = headerStore.get('x-actor-staff-id')?.trim()
  return raw || null
}

async function resolveStaffFromAuth(kind: CredentialKind): Promise<ResolvedCredentialStaff | Response> {
  const [user, actorStaffId] = await Promise.all([
    getAuthUser(),
    actorStaffIdFromHeader(),
  ])

  const resolved = await resolveCredentialActor(kind, {
    user,
    actorStaffId,
    lookup: { byId: lookupStaffById, byEmail: lookupStaffByEmail },
  })
  if (!resolved.ok) return deny(resolved.message, resolved.status)
  return { staff: resolved.staff, authEmail: resolved.authEmail }
}

export async function requireCredentialStaff(
  kind: CredentialKind,
): Promise<ResolvedCredentialStaff | Response> {
  return resolveStaffFromAuth(kind)
}
