/**
 * UI 메뉴/화면 숨김 스위치.
 * DB 테이블·컬럼·RLS·API·페이지 컴포넌트는 지우지 않는다.
 * 다시 켜 때는 해당 키만 false로 바꾸면 된다.
 */
export const UI_HIDDEN = {
  documents: true,
  reports: true,
  kpi: true,
  aiAssistant: true,
  promo: true,
  labor: true,
  aiReview: true,
} as const

export const HIDDEN_MENU_PATHS: readonly string[] = [
  ...(UI_HIDDEN.documents ? (['/documents'] as const) : []),
  ...(UI_HIDDEN.reports ? (['/reports'] as const) : []),
  ...(UI_HIDDEN.kpi ? (['/kpi'] as const) : []),
  ...(UI_HIDDEN.labor ? (['/labor'] as const) : []),
  ...(UI_HIDDEN.aiReview ? (['/ai-review'] as const) : []),
]

export function isHiddenMenuPath(pathname: string): boolean {
  return HIDDEN_MENU_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}
