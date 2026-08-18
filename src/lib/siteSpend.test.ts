import { describe, expect, it } from 'vitest'
import { sumExpensesBySite } from './siteSpend'

describe('sumExpensesBySite', () => {
  it('site_id가 있는 지출만 합친다. 빈 site_id는 추정하지 않는다', () => {
    expect(sumExpensesBySite([
      { site_id: 's1', amount: 1000 },
      { site_id: 's1', amount: 2500 },
      { site_id: 's2', amount: 400 },
      { site_id: null, amount: 9999 },
      { site_id: '', amount: 10 },
    ])).toEqual({ s1: 3500, s2: 400 })
  })
})
