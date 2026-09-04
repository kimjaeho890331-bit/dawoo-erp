import { credentialAccessDeny } from './access'
import type { CredentialKind } from '@/types'

export type CredentialStaff = {
  id: string
  name: string
  role: string
}

export type ResolvedCredentialStaff = {
  staff: CredentialStaff
  authEmail: string
}

export type StaffLookups = {
  byId: (id: string) => Promise<CredentialStaff | null>
  byEmail: (email: string) => Promise<CredentialStaff | null>
}

export type ResolveStaffResult =
  | { ok: true; staff: CredentialStaff; authEmail: string }
  | { ok: false; message: string; status: number }

/** staff_emails 매핑이 있으면 그걸 쓰고, 없으면 staff.email. */
export function pickEmailMappedStaff(
  fromStaffEmails: CredentialStaff | null | undefined,
  fromStaffTable: CredentialStaff | null | undefined,
): CredentialStaff | null {
  if (fromStaffEmails?.id) return fromStaffEmails
  return fromStaffTable ?? null
}

/**
 * x-actor-staff-id가 있고 staff 조회가 되면 이메일 경로를 생략한다.
 * 헤더가 없거나 id 조회가 실패하면 staff_emails + staff.email.
 */
export async function resolveCredentialActor(
  kind: CredentialKind,
  input: {
    user: { email?: string | null } | null
    actorStaffId: string | null
    lookup: StaffLookups
  },
): Promise<ResolveStaffResult> {
  if (!input.user?.email) {
    return { ok: false, message: '인증이 필요합니다', status: 401 }
  }

  const email = input.user.email
  let staff: CredentialStaff | null = null

  if (input.actorStaffId) {
    staff = await input.lookup.byId(input.actorStaffId)
  }
  if (!staff) {
    staff = await input.lookup.byEmail(email)
  }
  if (!staff) {
    return { ok: false, message: '등록되지 않은 직원입니다', status: 403 }
  }

  const denied = credentialAccessDeny(kind, staff.role)
  if (denied) return { ok: false, message: denied.error, status: denied.status }

  return { ok: true, staff, authEmail: email }
}
