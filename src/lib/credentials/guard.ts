import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'
import { canSeePrivateIds } from '@/lib/credentialAccess'
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
  return Response.json({ error: message, items: [] }, { status })
}

async function resolveStaffFromAuth(): Promise<ResolvedCredentialStaff | Response> {
  const user = await getAuthUser()
  if (!user?.email) {
    return deny('인증이 필요합니다', 401)
  }

  const email = user.email

  const { data: mapped, error: mapError } = await admin
    .from('staff_emails')
    .select('staff:staff_id(id, name, role)')
    .eq('email', email)
    .maybeSingle()

  if (mapError) {
    console.error('[credentials] staff_emails 조회 실패:', mapError.message)
  }

  const mappedStaff = mapped?.staff as unknown as CredentialStaff | null

  if (mappedStaff?.id) {
    return { staff: mappedStaff, authEmail: email }
  }

  const { data: byEmail, error: staffError } = await admin
    .from('staff')
    .select('id, name, role')
    .eq('email', email)
    .maybeSingle()

  if (staffError) {
    console.error('[credentials] staff 조회 실패:', staffError.message)
  }

  if (!byEmail) {
    return deny('등록되지 않은 직원입니다', 403)
  }

  return { staff: byEmail as CredentialStaff, authEmail: email }
}

export async function requireCredentialStaff(
  kind: CredentialKind,
): Promise<ResolvedCredentialStaff | Response> {
  const resolved = await resolveStaffFromAuth()
  if (resolved instanceof Response) return resolved

  if (kind === 'private' && !canSeePrivateIds(resolved.staff.role)) {
    return deny('권한없음', 403)
  }

  return resolved
}
