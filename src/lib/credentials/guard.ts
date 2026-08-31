import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { getAuthUser } from '@/lib/auth'
import { credentialAccessDeny, credentialDenyBody, pickCredentialStaff } from './access'
import type { CredentialKind } from '@/types'

export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export type CredentialStaff = {
  id: string
  name: string
  role: string
}

export type ResolvedCredentialStaff = {
  staff: CredentialStaff
  authEmail: string
}

function deny(message: string, status: number) {
  return Response.json(credentialDenyBody(message), { status })
}

async function lookupStaffByEmail(email: string): Promise<CredentialStaff | null> {
  const normalized = email.trim()

  const { data: mapped, error: mapError } = await admin
    .from('staff_emails')
    .select('staff:staff_id(id, name, role)')
    .ilike('email', normalized)
    .maybeSingle()

  if (mapError) {
    console.error('[credentials] staff_emails 조회 실패:', mapError.message)
  }

  const mappedStaff = mapped?.staff as unknown as CredentialStaff | null
  if (mappedStaff?.id) return mappedStaff

  const { data: byEmail, error: staffError } = await admin
    .from('staff')
    .select('id, name, role')
    .ilike('email', normalized)
    .maybeSingle()

  if (staffError) {
    console.error('[credentials] staff 조회 실패:', staffError.message)
  }

  return (byEmail as CredentialStaff | null) ?? null
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

async function resolveStaffFromAuth(): Promise<ResolvedCredentialStaff | Response> {
  const user = await getAuthUser()
  if (!user?.email) {
    return deny('인증이 필요합니다', 401)
  }

  const email = user.email
  const mappedByEmail = await lookupStaffByEmail(email)

  let mappedByActorId: CredentialStaff | null = null
  if (!mappedByEmail) {
    const actorStaffId = await actorStaffIdFromHeader()
    if (actorStaffId) {
      mappedByActorId = await lookupStaffById(actorStaffId)
    }
  }

  const staff = pickCredentialStaff(mappedByEmail, mappedByActorId)
  if (!staff) {
    return deny('등록되지 않은 직원입니다', 403)
  }

  return { staff, authEmail: email }
}

export async function requireCredentialStaff(
  kind: CredentialKind,
): Promise<ResolvedCredentialStaff | Response> {
  const resolved = await resolveStaffFromAuth()
  if (resolved instanceof Response) return resolved

  const denied = credentialAccessDeny(kind, resolved.staff.role)
  if (denied) return deny(denied.error, denied.status)

  return resolved
}
