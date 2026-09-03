/** status_logs.staff_id 규칙 — 신규 insert만. 옛 행(null)은 그대로 둔다. */

export {
  STAFF_STORAGE_KEY,
  activityLogStaffRefuseReason as statusLogStaffRefuseReason,
  isRealStaffId,
  processorLabel,
} from '@/lib/activityLog'

export type StatusLogInsertInput = {
  projectId: string
  fromStatus: string | null
  toStatus: string
  note?: string | null
}
