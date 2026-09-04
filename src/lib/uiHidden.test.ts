import { describe, expect, it } from 'vitest'
import {
  HIDDEN_MENU_PATHS,
  hiddenPageRedirect,
  isDashboardAiGated,
  isHiddenMenuPath,
  UI_HIDDEN,
} from './uiHidden'

describe('uiHidden', () => {
  it('숨긴 메뉴 경로만 차단하고 유지 화면은 통과시킨다', () => {
    expect(UI_HIDDEN.documents).toBe(true)
    expect(UI_HIDDEN.reports).toBe(true)
    expect(UI_HIDDEN.kpi).toBe(true)
    expect(UI_HIDDEN.aiAssistant).toBe(true)
    expect(UI_HIDDEN.promo).toBe(true)
    expect(UI_HIDDEN.buildingLedger).toBe(true)
    expect(UI_HIDDEN.labor).toBe(true)

    expect(HIDDEN_MENU_PATHS).toEqual([
      '/documents',
      '/reports',
      '/kpi',
      '/register/building-ledger',
      '/labor',
    ])
    expect(isHiddenMenuPath('/documents')).toBe(true)
    expect(isHiddenMenuPath('/documents/water')).toBe(true)
    expect(isHiddenMenuPath('/reports')).toBe(true)
    expect(isHiddenMenuPath('/kpi')).toBe(true)
    expect(isHiddenMenuPath('/register/building-ledger')).toBe(true)
    expect(isHiddenMenuPath('/register/building-ledger/queue')).toBe(true)
    expect(isHiddenMenuPath('/labor')).toBe(true)
    expect(isHiddenMenuPath('/labor/export')).toBe(true)

    expect(isHiddenMenuPath('/register/small')).toBe(false)
    expect(isHiddenMenuPath('/calendar/work')).toBe(false)
    expect(isHiddenMenuPath('/sites')).toBe(false)
    expect(isHiddenMenuPath('/my-sites')).toBe(false)
    expect(isHiddenMenuPath('/ai-review')).toBe(false)
    expect(isHiddenMenuPath('/approval')).toBe(false)
    expect(isHiddenMenuPath('/vendors')).toBe(false)
    expect(isHiddenMenuPath('/staff')).toBe(false)
    expect(isHiddenMenuPath('/ids')).toBe(false)
    expect(isHiddenMenuPath('/ids-private')).toBe(false)
    expect(isHiddenMenuPath('/notice')).toBe(false)
    expect(isHiddenMenuPath('/dashboard')).toBe(false)
  })

  it('페이지 가드는 숨김이면 대시보드로 보낸다', () => {
    expect(hiddenPageRedirect(true)).toBe('/dashboard')
    expect(hiddenPageRedirect(false)).toBeNull()
    expect(hiddenPageRedirect(UI_HIDDEN.buildingLedger)).toBe('/dashboard')
    expect(hiddenPageRedirect(UI_HIDDEN.labor)).toBe('/dashboard')
    expect(hiddenPageRedirect(UI_HIDDEN.documents)).toBe('/dashboard')
    expect(hiddenPageRedirect(UI_HIDDEN.reports)).toBe('/dashboard')
    expect(hiddenPageRedirect(UI_HIDDEN.kpi)).toBe('/dashboard')
  })

  it('대시보드 AI 브리핑·주간보고서는 aiAssistant 또는 reports가 켜지면 게이트한다', () => {
    expect(isDashboardAiGated()).toBe(true)
  })
})
