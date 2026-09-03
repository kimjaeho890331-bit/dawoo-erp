import { describe, expect, it } from 'vitest'
import { isSiteInflowChosen, isSiteInflowPath } from './siteInflow'

describe('siteInflow', () => {
  it('빈 값은 추정하지 않고 고르지 않은 것으로 본다', () => {
    expect(isSiteInflowPath(null)).toBe(false)
    expect(isSiteInflowPath('')).toBe(false)
    expect(isSiteInflowChosen(undefined)).toBe(false)
  })

  it('허용 값만 통과한다', () => {
    expect(isSiteInflowChosen('소개')).toBe(true)
    expect(isSiteInflowChosen('나라장터공고')).toBe(true)
    expect(isSiteInflowChosen('입찰')).toBe(false)
  })
})
