import { admin } from '@/lib/approval/guard'
import {
  activityLogStaffRefuseReason,
  type ActivityLogRow,
} from '@/lib/activityLog'

export type ActivityLogInsertInput = {
  staffId: string
  action: string
  target_type?: string | null
  target_id?: string | null
  detail?: string | null
}

/**
 * 신규 activity_log만. staff_id 없으면 insert 자체를 하지 않는다.
 * 컬럼 NOT NULL은 건드리지 않는다(옛 행은 비어 있는 채로 둔다).
 */
export async function insertActivityLog(
  input: ActivityLogInsertInput,
): Promise<{ row: ActivityLogRow } | { error: string; status: number }> {
  const refused = activityLogStaffRefuseReason(input.staffId)
  if (refused) return { error: refused, status: 400 }

  const action = input.action?.trim()
  if (!action) return { error: '작업을 입력해 주세요', status: 400 }

  const { data: staff, error: staffError } = await admin
    .from('staff')
    .select('id')
    .eq('id', input.staffId)
    .maybeSingle()

  if (staffError) {
    console.error('[activity_log] staff 조회 실패:', staffError.message)
    return { error: '처리자를 확인할 수 없습니다', status: 500 }
  }
  if (!staff) return { error: '등록되지 않은 직원입니다', status: 403 }

  const { data, error } = await admin
    .from('activity_log')
    .insert({
      staff_id: input.staffId,
      action,
      target_type: input.target_type ?? null,
      target_id: input.target_id ?? null,
      detail: input.detail ?? null,
    })
    .select('id, staff_id, action, target_type, target_id, detail, created_at')
    .single()

  if (error || !data) {
    console.error('[activity_log] insert 실패:', error?.message)
    return { error: '작업 이력을 남기지 못했습니다', status: 500 }
  }

  return { row: data as ActivityLogRow }
}
