import { admin } from './guard'
import {
  applyReencryptRow,
  emptyReencryptCounts,
  reencryptStoredPassword,
  reencryptUnavailableReason,
  type ReencryptCounts,
} from './reencrypt'

/**
 * credential_entries 전 행을 CREDENTIAL_SECRET으로 다시 넣는다.
 * 응답/로그에 비밀번호를 넣지 않는다. 호출 전 CREDENTIAL_SECRET 필수.
 */
export async function reencryptAllCredentialPasswords(): Promise<
  ReencryptCounts | { error: string; status: number }
> {
  const unavailable = reencryptUnavailableReason()
  if (unavailable) return unavailable

  const { data, error } = await admin
    .from('credential_entries')
    .select('id, password')

  if (error) {
    console.error('[credentials] 재암호화 목록 조회 실패')
    return { error: '재암호화에 실패했습니다', status: 500 }
  }

  const rows = (data ?? []) as { id: string; password: string | null }[]
  const counts = emptyReencryptCounts()
  counts.total = rows.length

  for (const row of rows) {
    const result = reencryptStoredPassword(row.password)
    if (result.status !== 'encrypted') {
      applyReencryptRow(counts, result)
      continue
    }

    const { error: updateError } = await admin
      .from('credential_entries')
      .update({
        password: result.next,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    if (updateError) {
      console.error('[credentials] 재암호화 행 갱신 실패')
      counts.failed += 1
      continue
    }
    counts.encrypted += 1
  }

  return counts
}
