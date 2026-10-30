/**
 * 회사 공통 설정을 바꿀 수 있는 직책.
 *
 * 한 사람이 바꾸면 모두의 화면이 바뀌는 설정에 쓴다. 연차 이월 기한이 쓰는 집합과
 * 같지만(대표·관리자·경리, 2026-10-09 대표 결정), 거기는 '연차를 승인할 수 있는가'라는
 * 다른 질문이라 한 함수로 합치지 않는다 — 한쪽 기준이 바뀌어도 다른 쪽이 끌려가지 않게.
 *
 * "지금 누구인지"는 다른 화면과 같이 화면에서 고른 현재 직원(localStorage)이다.
 * 로그인 계정과 직원이 아직 다 연결되지 않아서다 — 실수를 막는 장치이지,
 * 마음먹고 다른 직원으로 바꿔 고르는 것까지 막지는 못한다.
 */
const COMPANY_SETTING_ROLES = new Set(['대표', '관리자', '경리'])

export function canEditCompanySettings(role: string | null | undefined): boolean {
  return COMPANY_SETTING_ROLES.has((role ?? '').trim())
}

/** 권한이 없는 사람에게 보여 줄 안내 — 왜 못 고치는지 알 수 있게. */
export const COMPANY_SETTING_READONLY_NOTE = '대표·관리자·경리만 바꿀 수 있습니다.'
