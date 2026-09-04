/**
 * UI 메뉴/화면 숨김 스위치.
 * DB 테이블·컬럼·RLS·API·페이지 컴포넌트는 지우지 않는다.
 * 다시 켤 때는 해당 키만 false로 바꾸면 된다.
 */
export const UI_HIDDEN = {
  documents: true,
  reports: true,
  kpi: true,
  aiAssistant: true,
  promo: true,
  buildingLedger: true,
  labor: true,
} as const

export const HIDDEN_MENU_PATHS: readonly string[] = [
  ...(UI_HIDDEN.documents ? (['/documents'] as const) : []),
  ...(UI_HIDDEN.reports ? (['/reports'] as const) : []),
  ...(UI_HIDDEN.kpi ? (['/kpi'] as const) : []),
  ...(UI_HIDDEN.buildingLedger ? (['/register/building-ledger'] as const) : []),
  ...(UI_HIDDEN.labor ? (['/labor'] as const) : []),
]

/** 숨김 화면 직접 진입 시 보낼 경로. 숨기지 않으면 null. */
export function hiddenPageRedirect(hidden: boolean): '/dashboard' | null {
  return hidden ? '/dashboard' : null
}

/** 대시보드 AI 브리핑·주간보고서 카드/fetch를 끌지. */
export function isDashboardAiGated(): boolean {
  return UI_HIDDEN.aiAssistant || UI_HIDDEN.reports
}

export function isHiddenMenuPath(pathname: string): boolean {
  return HIDDEN_MENU_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}
