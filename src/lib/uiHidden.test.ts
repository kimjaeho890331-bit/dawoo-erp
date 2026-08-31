import { describe, expect, it } from 'vitest'
import { HIDDEN_MENU_PATHS, isHiddenMenuPath, UI_HIDDEN } from './uiHidden'

describe('uiHidden', () => {
  it('숨긴 메뉴 경로만 차단하고 유지 화면은 통과시킨다', () => {
    expect(UI_HIDDEN.documents).toBe(true)
    expect(UI_HIDDEN.reports).toBe(true)
    expect(UI_HIDDEN.kpi).toBe(true)
    expect(UI_HIDDEN.aiAssistant).toBe(true)
    expect(UI_HIDDEN.promo).toBe(true)

    expect(HIDDEN_MENU_PATHS).toEqual(['/documents', '/reports', '/kpi'])
    expect(isHiddenMenuPath('/documents')).toBe(true)
    expect(isHiddenMenuPath('/documents/water')).toBe(true)
    expect(isHiddenMenuPath('/reports')).toBe(true)
    expect(isHiddenMenuPath('/kpi')).toBe(true)

    expect(isHiddenMenuPath('/register/small')).toBe(false)
    expect(isHiddenMenuPath('/register/building-ledger')).toBe(false)
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
})
