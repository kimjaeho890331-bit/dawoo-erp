/** activity_log.staff_id 규칙 — 신규 insert만. 옛 행(null)은 그대로 둔다. */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const STAFF_STORAGE_KEY = 'dawoo_current_staff_id'

export type ActivityLogRow = {
  id: string
  staff_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  detail: string | null
  created_at: string
}

export type ActivityLogWithStaff = ActivityLogRow & {
  staff: { name: string } | null
}

export function isRealStaffId(value: string | null | undefined): value is string {
  if (!value) return false
  const id = value.trim()
  return UUID_RE.test(id)
}

/** insert 거부 사유. null이면 staff_id를 넣을 수 있다. */
export function activityLogStaffRefuseReason(
  staffId: string | null | undefined,
): string | null {
  if (!isRealStaffId(staffId)) return '처리자를 선택해 주세요'
  return null
}

/** staff_id 없으면 빈칸. 이름 추측하지 않음. */
export function processorLabel(
  staffId: string | null | undefined,
  staffName: string | null | undefined,
): string {
  if (!staffId) return '—'
  const name = staffName?.trim()
  return name || '—'
}

export function attachStaffNames<T extends { staff_id: string | null }>(
  rows: T[],
  staffById: Map<string, string>,
): (T & { staff: { name: string } | null })[] {
  return rows.map((row) => {
    const name = row.staff_id ? staffById.get(row.staff_id) : undefined
    return {
      ...row,
      staff: name ? { name } : null,
    }
  })
}

export const ACTIVITY_ACTION_LABEL: Record<string, string> = {
  site_create: '현장 등록',
  site_update: '현장 수정',
  site_delete: '현장 삭제',
  site_log_create: '일지 작성',
  site_log_update: '일지 수정',
  site_log_delete: '일지 삭제',
  schedule_create: '공정 등록',
  schedule_update: '공정 수정',
  schedule_delete: '공정 삭제',
}

export function activityActionLabel(action: string): string {
  return ACTIVITY_ACTION_LABEL[action] || action
}
