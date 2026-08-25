/** 내 현장 메뉴: 직원 이름 김재호만. 경리(대표/관리자/경리)보다 좁다. */
export const KIM_JAEHO_NAME = '김재호'

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

/**
 * 김재호가 여러 명이면 임원/이사(관리자·대표 포함) 행만 통과.
 * 한 명이면 이름 또는 기존 이메일로 통과.
 */
export function canSeeMySites(
  staff: MySitesStaff | null | undefined,
  allKimJaeho?: MySitesStaff[] | null,
): boolean {
  if (!staff) return false
  if (!nameIsKimJaeho(staff.name) && !emailIsKimJaeho(staff.email)) return false

  const twins = (allKimJaeho ?? []).filter((s) => nameIsKimJaeho(s.name))
  if (twins.length > 1) {
    const chosen = twins.find((s) => isExecRole(s.role))
    if (chosen?.id && staff.id) return chosen.id === staff.id && isExecRole(staff.role)
    return isExecRole(staff.role)
  }
  return true
}

export const WEEKLY_UNASSIGNED_TASKS = [
  '영등포 주말',
  '농협 견적 금액만',
  '철도 착공 날짜',
] as const
