import { describe, expect, it } from 'vitest'
import {
  SITE_INFLOW_PATHS,
  isSiteInflowChosen,
  isSiteInflowPath,
  resolveNewSiteInflow,
} from './siteInflow'

describe('siteInflow', () => {
  it('빈 값은 고르지 않은 것으로 본다', () => {
    expect(isSiteInflowPath(null)).toBe(false)
    expect(isSiteInflowPath('')).toBe(false)
    expect(isSiteInflowChosen(undefined)).toBe(false)
  })

  it('허용 값만 통과한다', () => {
    expect(isSiteInflowChosen('소개')).toBe(true)
    expect(isSiteInflowChosen('나라장터공고')).toBe(true)
    expect(isSiteInflowChosen('미확인')).toBe(true)
    expect(isSiteInflowChosen('입찰')).toBe(false)
    expect(SITE_INFLOW_PATHS).toContain('미확인')
  })

  it('INSERT 빈값은 미확인, 허용 외는 추정하지 않는다', () => {
    expect(resolveNewSiteInflow('')).toBe('미확인')
    expect(resolveNewSiteInflow(null)).toBe('미확인')
    expect(resolveNewSiteInflow(undefined)).toBe('미확인')
    expect(resolveNewSiteInflow('소개')).toBe('소개')
    expect(resolveNewSiteInflow('입찰')).toBeNull()
  })
})
