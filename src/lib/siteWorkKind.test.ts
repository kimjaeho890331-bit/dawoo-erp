import { describe, expect, it } from 'vitest'
import {
  SITE_WORK_KINDS,
  isSiteWorkKind,
  isSiteWorkKindChosen,
  resolveNewSiteWorkKind,
} from './siteWorkKind'

describe('siteWorkKind', () => {
  it('빈 값은 고르지 않은 것으로 본다', () => {
    expect(isSiteWorkKind(null)).toBe(false)
    expect(isSiteWorkKind('')).toBe(false)
    expect(isSiteWorkKindChosen(undefined)).toBe(false)
  })

  it('허용 값만 통과한다', () => {
    expect(isSiteWorkKindChosen('실내건축')).toBe(true)
    expect(isSiteWorkKindChosen('도장')).toBe(true)
    expect(isSiteWorkKindChosen('미확인')).toBe(true)
    expect(isSiteWorkKindChosen('방수')).toBe(false)
    expect(SITE_WORK_KINDS).toContain('미확인')
  })

  it('INSERT 빈값은 미확인, 허용 외는 추정하지 않는다', () => {
    expect(resolveNewSiteWorkKind('')).toBe('미확인')
    expect(resolveNewSiteWorkKind(null)).toBe('미확인')
    expect(resolveNewSiteWorkKind(undefined)).toBe('미확인')
    expect(resolveNewSiteWorkKind('도장')).toBe('도장')
    expect(resolveNewSiteWorkKind('방수')).toBeNull()
  })
})
