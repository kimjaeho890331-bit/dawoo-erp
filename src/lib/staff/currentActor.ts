/**
 * "지금 이 화면들이 누구로 동작하는가"(현재 직원)를 정하는 규칙.
 *
 * 값 자체는 예전부터 쓰던 localStorage 키 하나(dawoo_current_staff_id)에 그대로 둔다.
 * 사이드바·연차·내 현장·AI 비서 등 열 곳 넘는 화면이 이 키를 직접 읽기 때문이다.
 *
 * 규칙은 하나다 — **로그인한 사람이 기본값이고, 손으로 바꾼 선택은 존중한다.**
 *
 * 예전에는 AuthProvider가 화면을 열 때마다 이 키를 로그인한 사람으로 덮어썼다.
 * 그래서 결재 화면에서 다른 사람으로 바꿔놓아도 토큰 갱신이나 화면 이동 한 번에
 * 조용히 본인으로 되돌아갔고, 결재 화면의 드롭다운은 그 사실을 모른 채(같은 탭에서는
 * storage 이벤트가 오지 않는다) 바뀐 이름을 계속 보여줬다. 결재 화면과 사이드바가
 * 서로 다른 사람을 가리키는 상태가 여기서 나왔다.
 *
 * 그래서 "이 로그인 계정으로 이미 맞춰줬는지"를 따로 기억해 두고, 맞춰준 적이 없을
 * 때만 덮어쓴다. 다른 사람이 로그인하면 그 사람 id로 바뀌므로 다시 맞춰진다.
 */

export const CURRENT_STAFF_KEY = 'dawoo_current_staff_id'

/** 마지막으로 '현재 직원'을 맞춰준 로그인 계정의 staff id. */
const APPLIED_FOR_KEY = 'dawoo_actor_login_id'

function get(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // 사생활 보호 모드나 저장소 차단 — 값이 없는 것으로 본다
    return null
  }
}

function set(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 저장 못 해도 이번 화면은 그대로 동작한다. 다음 번에 다시 맞춰진다.
  }
}

/**
 * 로그인한 사람을 현재 직원의 기본값으로 삼는다.
 *
 * 덮어쓰는 경우는 둘뿐이다.
 *   1. 아직 아무도 고른 적이 없을 때
 *   2. 직전에 맞춰준 로그인 계정과 지금 로그인한 사람이 다를 때 (공용 PC에서 사람이 바뀜)
 *
 * 같은 사람이 계속 쓰는 동안 손으로 바꾼 선택은 건드리지 않는다 —
 * 경리가 다른 직원 몫을 대신 기안하는 경우가 있다.
 *
 * @returns 적용 후의 현재 직원 id
 */
export function applyLoginActor(loginStaffId: string): string {
  const current = get(CURRENT_STAFF_KEY)
  const appliedFor = get(APPLIED_FOR_KEY)

  if (!current || appliedFor !== loginStaffId) {
    set(CURRENT_STAFF_KEY, loginStaffId)
    set(APPLIED_FOR_KEY, loginStaffId)
    return loginStaffId
  }

  // 이 계정으로는 이미 맞춰줬고, 지금 값은 본인이 고른 것이다. 그대로 둔다.
  set(APPLIED_FOR_KEY, loginStaffId)
  return current
}

/** 지금 저장된 현재 직원 id. 없으면 null. */
export function readCurrentActor(): string | null {
  return get(CURRENT_STAFF_KEY)
}

/** 화면에서 직접 고른 값을 저장한다. 이후 같은 계정으로는 덮어쓰이지 않는다. */
export function writeCurrentActor(staffId: string): void {
  set(CURRENT_STAFF_KEY, staffId)
}
