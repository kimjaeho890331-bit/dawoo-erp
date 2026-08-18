/** 경리 메뉴: 임원/경리만. 직원·현장소장 목록에는 안 보인다. */
const LEDGER_ROLES = new Set(['대표', '관리자', '경리'])

export function canSeeLedger(role: string | null | undefined): boolean {
  if (!role) return false
  return LEDGER_ROLES.has(role.trim())
}
