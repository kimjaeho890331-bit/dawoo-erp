/**
 * 연차 승인·수정 권한.
 *
 * 예전에는 대기 중인 신청마다 승인·반려 버튼이 모든 직원에게 보여서, 본인 연차를
 * 본인이 승인할 수 있었다. 승인된 연차도 누구나 날짜를 고칠 수 있었다.
 *
 * "지금 누구인지"는 다른 화면과 같이 화면에서 고른 현재 직원(localStorage)이다.
 * 로그인 계정과 직원이 아직 다 연결되지 않아서다 — 그래서 이 검사는 실수를 막는
 * 장치이지, 마음먹고 다른 직원으로 바꿔 고르는 것까지 막지는 못한다.
 */
const APPROVER_ROLES = new Set(['대표', '관리자'])

export interface LeaveActor {
  id: string | null
  role: string | null | undefined
}

export function isLeaveApprover(role: string | null | undefined): boolean {
  return APPROVER_ROLES.has((role ?? '').trim())
}

/** 승인·반려를 누를 수 있는가. 관리자도 본인 연차는 승인할 수 없다(대표만 예외). */
export function canDecideLeave(me: LeaveActor, requestStaffId: string): boolean {
  if (!me.id || !isLeaveApprover(me.role)) return false
  if (me.id === requestStaffId) return (me.role ?? '').trim() === '대표'
  return true
}

/**
 * 수정·삭제할 수 있는가.
 * 대기 중인 신청은 본인과 승인자가, 이미 승인·반려된 신청은 승인자만 고칠 수 있다.
 */
export function canChangeLeave(me: LeaveActor, req: { staff_id: string; status: string }): boolean {
  if (!me.id) return false
  if (isLeaveApprover(me.role)) return true
  return req.status === '대기' && req.staff_id === me.id
}
