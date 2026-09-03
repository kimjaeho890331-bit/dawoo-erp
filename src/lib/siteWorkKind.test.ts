import { describe, expect, it } from 'vitest'
import { isSiteWorkKind, isSiteWorkKindChosen } from './siteWorkKind'

describe('siteWorkKind', () => {
  it('빈 값은 추정하지 않고 고르지 않은 것으로 본다', () => {
    expect(isSiteWorkKind(null)).toBe(false)
    expect(isSiteWorkKind('')).toBe(false)
    expect(isSiteWorkKindChosen(undefined)).toBe(false)
  })

  it('허용 값만 통과한다', () => {
    expect(isSiteWorkKindChosen('실내건축')).toBe(true)
    expect(isSiteWorkKindChosen('도장')).toBe(true)
    expect(isSiteWorkKindChosen('방수')).toBe(false)
  })
})
