/** 중요 ID/PW: staff.role 이 관리자만. 경리·대표·직원·현장소장은 안 된다. */

export const SHARED_IDS_PATH = '/ids'
export const PRIVATE_IDS_PATH = '/ids-private'
export const SHARED_IDS_MENU = '공유 ID/PW'
export const PRIVATE_IDS_MENU = '중요 ID/PW'

export function canSeePrivateIds(role: string | null | undefined): boolean {
  return (role ?? '').trim() === '관리자'
}
