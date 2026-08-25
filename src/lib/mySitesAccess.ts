/** 내 현장 메뉴: 직원 이름 김재호만. 경리(대표/관리자/경리)보다 좁다. */
export const KIM_JAEHO_NAME = '김재호'

/** 직원 피커에 있는 유일한 김재호. 로그인 이메일이 아니라 이 id로 연다. */
export const KIM_JAEHO_STAFF_ID = 'f3036556-8a09-4c51-92a7-0e176f87be80'

/** staff / staff_emails 에 이미 있는 계정. 새 계정을 만들지 않는다. */
export const KIM_JAEHO_EMAIL = 'kimjaeho890331@gmail.com'

const EXEC_ROLES = new Set(['대표', '관리자', '임원', '이사', '사장'])

export function isExecRole(role: string | null | undefined): boolean {
  if (!role) return false
  return EXEC_ROLES.has(role.trim())
}

export type MySitesStaff = {
  id?: string | null
  name?: string | null
  role?: string | null
  email?: string | null
}

function nameIsKimJaeho(name: string | null | undefined): boolean {
  return (name ?? '').trim() === KIM_JAEHO_NAME
}

function emailIsKimJaeho(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === KIM_JAEHO_EMAIL
}

export function isKimJaehoStaffId(id: string | null | undefined): boolean {
  return (id ?? '').trim() === KIM_JAEHO_STAFF_ID
}

/**
 * 선택한 직원이 김재호(고정 id 또는 이름)면 연다.
 * 로그인 이메일·staff_emails 와는 무관하다.
 */
export function canSeeMySites(
  staff: MySitesStaff | null | undefined,
  allKimJaeho?: MySitesStaff[] | null,
): boolean {
  if (!staff) return false
  if (isKimJaehoStaffId(staff.id)) return true
  if (!nameIsKimJaeho(staff.name) && !emailIsKimJaeho(staff.email)) return false

  const twins = (allKimJaeho ?? []).filter((s) => nameIsKimJaeho(s.name))
  if (twins.length > 1) {
    const chosen = twins.find((s) => isExecRole(s.role))
    if (chosen?.id && staff.id) return chosen.id === staff.id && isExecRole(staff.role)
    return isExecRole(staff.role)
  }
  return true
}

export type MySitesGate = 'ok' | 'staff-unread' | 'no-access'

/** 선택한 직원 id가 김재호면 연다. 대시보드로 쫓지 않는다. */
export function mySitesGateReason(args: {
  staffId: string | null | undefined
}): MySitesGate {
  if (isKimJaehoStaffId(args.staffId)) return 'ok'
  if (!args.staffId) return 'staff-unread'
  return 'no-access'
}

export const WEEKLY_UNASSIGNED_TASKS = [
  '영등포 주말',
  '농협 견적 금액만',
  '철도 착공 날짜',
] as const
