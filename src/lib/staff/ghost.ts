/**
 * 카카오 첫 로그인 때 자동으로 생긴 직원 행("유령 직원").
 *
 * 예전 로그인 콜백은 로그인 이메일이 직원 정보에 없으면 카카오 닉네임으로 직원 행을
 * 새로 만들었다(직책 '사원'). 그래서 실제 직원 목록에 같은 사람이 한 명 더 생기고,
 * 그 사람이 쓴 기록이 새 행 이름으로 쌓였다. 이제 콜백은 행을 만들지 않고 본인 이름을
 * 고르게 한다. 이미 생긴 행은 직원관리에서 실제 직원과 합친다.
 *
 * 직원관리 화면의 직책 목록(관리자·경리·직원·현장소장)과 대표에는 '사원'이 없어,
 * 직책 '사원'은 자동 생성 행에만 있다.
 */
export const AUTO_CREATED_ROLE = '사원'

export function isAutoCreatedStaff(row: { role?: string | null } | null | undefined): boolean {
  return (row?.role ?? '').trim() === AUTO_CREATED_ROLE
}

/**
 * 합칠 때 직원 id를 옮겨야 하는 칸. 표나 칸이 아직 없는 곳은 서버가 건너뛴다.
 * 새 표에 직원 id 칸을 만들면 여기에도 넣는다.
 */
export const STAFF_REFERENCES: readonly [table: string, column: string][] = [
  ['projects', 'staff_id'],
  ['status_logs', 'staff_id'],
  ['schedules', 'staff_id'],
  ['schedules', 'assigned_to'],
  ['daily_logs', 'staff_id'],
  ['activity_log', 'staff_id'],
  ['expenses', 'staff_id'],
  ['expense_reports', 'drafter_staff_id'],
  ['expense_report_lines', 'staff_id'],
  ['expense_report_files', 'staff_id'],
  ['leave_requests', 'staff_id'],
  ['tasks', 'assigned_to'],
  ['tasks', 'assigned_by'],
  ['push_subscriptions', 'staff_id'],
  ['staff_emails', 'staff_id'],
  ['staff_attachments', 'staff_id'],
  ['building_ledger_requests', 'requested_by'],
  ['building_ledger_requests', 'confirmed_by'],
  ['credential_entries', 'created_by'],
  ['card_mappings', 'staff_id'],
  ['card_transactions', 'staff_id'],
  ['promo_records', 'staff_id'],
  ['chat_messages', 'staff_id'],
  ['chat_sessions', 'staff_id'],
  ['ai_events', 'staff_id'],
  ['cowork_tasks', 'requested_by'],
]

/** 일정의 여러 담당자(staff_ids)에서 from을 to로 바꾼다. 이미 to가 있으면 겹치지 않게 뺀다. */
export function replaceStaffId(ids: readonly string[] | null, from: string, to: string): string[] | null {
  if (!ids) return ids
  const out: string[] = []
  for (const id of ids) {
    const next = id === from ? to : id
    if (!out.includes(next)) out.push(next)
  }
  return out
}

/**
 * 표·칸이 없어서 난 오류인지. 그런 곳은 건너뛰고 다음 칸으로 간다.
 * (Postgres 42P01 표 없음 / 42703 칸 없음, PostgREST PGRST204·PGRST205 스키마에 없음)
 */
export function isMissingTableOrColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(err.code ?? '')) return true
  return /does not exist|could not find/i.test(err.message ?? '')
}
