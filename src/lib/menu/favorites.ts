/**
 * 메뉴 즐겨찾기 — 왼쪽 메뉴에서 별을 눌러 지정하고, 모바일 대시보드 맨 위에 뜬다.
 *
 * 저장은 이 기기(브라우저)에만 한다. 직원마다 쓰는 기기가 정해져 있어
 * DB까지 갈 이유가 없고, 지금 마이그레이션 이력이 어긋나 있어 칸 추가가
 * 간단치 않다. 나중에 PC·폰 공유가 필요해지면 staff 테이블로 옮기면 된다.
 *
 * 사이드바와 대시보드가 동시에 떠 있을 수 있으므로, 바뀌면 이벤트로 알린다.
 * (localStorage의 storage 이벤트는 "다른 탭"에서만 오기 때문에 직접 쏜다.)
 */

const KEY = 'dawoo_menu_favorites'
const CHANGE_EVENT = 'dawoo:favorites-changed'

/** 모바일 대시보드 맨 위 한 줄에 들어가는 개수. 넘으면 추가를 막는다. */
export const MAX_FAVORITES = 4

/** 저장된 즐겨찾기 경로 목록. 추가한 순서를 유지한다. */
export function readFavorites(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_FAVORITES)
  } catch {
    // 값이 깨졌으면 즐겨찾기가 없는 것으로 본다 — 화면이 멈추면 안 된다.
    return []
  }
}

function write(paths: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(paths))
  } catch {
    /* 저장 공간이 막혀도 화면 동작은 계속되어야 한다 */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export type ToggleResult =
  | { ok: true; favorites: string[]; added: boolean }
  | { ok: false; reason: 'limit'; favorites: string[] }

/**
 * 즐겨찾기 추가/해제.
 * 이미 있으면 뺀다. 없는데 한도를 넘으면 넣지 않고 이유를 돌려준다
 * (몰래 다른 항목을 밀어내면 쓰던 게 사라져 당황하게 된다).
 */
export function toggleFavorite(path: string): ToggleResult {
  const current = readFavorites()
  if (current.includes(path)) {
    const next = current.filter(p => p !== path)
    write(next)
    return { ok: true, favorites: next, added: false }
  }
  if (current.length >= MAX_FAVORITES) {
    return { ok: false, reason: 'limit', favorites: current }
  }
  const next = [...current, path]
  write(next)
  return { ok: true, favorites: next, added: true }
}

/** 즐겨찾기 변경 구독. 해제 함수를 돌려준다. */
export function subscribeFavorites(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  // 다른 탭에서 바꾼 경우도 따라간다.
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}
