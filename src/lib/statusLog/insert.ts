import { admin } from '@/lib/approval/guard'
import { statusLogStaffRefuseReason } from '@/lib/statusLog'

export type StatusLogInsertRow = {
  staffId: string
  projectId: string
  fromStatus: string | null
  toStatus: string
  note?: string | null
}

/**
 * 신규 status_logs만. staff_id 없으면 insert 자체를 하지 않는다.
 * 컬럼 NOT NULL은 건드리지 않는다(옛 행은 비어 있는 채로 둔다).
 */
export async function insertStatusLogRow(
  input: StatusLogInsertRow,
): Promise<{ ok: true } | { error: string; status: number }> {
  const refused = statusLogStaffRefuseReason(input.staffId)
  if (refused) return { error: refused, status: 400 }

  const toStatus = input.toStatus?.trim()
  if (!toStatus) return { error: '변경 단계를 입력해 주세요', status: 400 }
  if (!input.projectId?.trim()) return { error: '접수를 확인할 수 없습니다', status: 400 }

  const { data: staff, error: staffError } = await admin
    .from('staff')
    .select('id')
    .eq('id', input.staffId)
    .maybeSingle()

  if (staffError) {
    console.error('[status_logs] staff 조회 실패:', staffError.message)
    return { error: '처리자를 확인할 수 없습니다', status: 500 }
  }
  if (!staff) return { error: '등록되지 않은 직원입니다', status: 403 }

  const { error } = await admin.from('status_logs').insert({
    project_id: input.projectId,
    staff_id: input.staffId,
    from_status: input.fromStatus ?? null,
    to_status: toStatus,
    note: input.note ?? null,
  })

  if (error) {
    console.error('[status_logs] insert 실패:', error.message)
    return { error: '단계 변경 이력을 남기지 못했습니다', status: 500 }
  }

  return { ok: true }
}
