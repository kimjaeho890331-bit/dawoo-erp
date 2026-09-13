import { requireAdminStaff } from '@/lib/credentials/guard'
import { reencryptAllCredentialPasswords } from '@/lib/credentials/reencryptAll'

/**
 * POST /api/ids/reencrypt
 * 관리자만. service_role로 credential_entries 전 행을 CREDENTIAL_SECRET으로 다시 넣는다.
 * 응답은 건수만. 비밀번호·샘플 문자열을 넣지 않는다.
 * CREDENTIAL_SECRET 없으면 503.
 */
export async function POST() {
  const actor = await requireAdminStaff()
  if (actor instanceof Response) return actor

  const result = await reencryptAllCredentialPasswords()
  if ('error' in result) {
    return Response.json({ error: result.error }, { status: result.status })
  }
  return Response.json({
    total: result.total,
    encrypted: result.encrypted,
    skipped_empty: result.skipped_empty,
    failed: result.failed,
  })
}
