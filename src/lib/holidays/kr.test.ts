import { describe, it, expect } from 'vitest'
import { getHolidays, nextBusinessDay } from './kr'

describe('getHolidays', () => {
  it('2026 추석은 9/24~26이다 (예전 표는 10/4~6)', () => {
    const h = getHolidays(2026)
    expect(h.get('2026-09-25')).toBe('추석')
    expect(h.has('2026-09-24') && h.has('2026-09-26')).toBe(true)
    expect(h.has('2026-10-04')).toBe(false)
    expect(h.has('2026-10-06')).toBe(false)
    expect(h.get('2026-10-05')).toBe('대체공휴일(개천절)')
  })

  it('2027 추석은 9/14~16이다 (예전 표는 9/24~26)', () => {
    const h = getHolidays(2027)
    expect(h.get('2027-09-15')).toBe('추석')
    expect(h.has('2027-09-25')).toBe(false)
  })

  it('2026년부터 제헌절·노동절이 공휴일이다', () => {
    expect(getHolidays(2026).get('2026-07-17')).toBe('제헌절')
    expect(getHolidays(2026).get('2026-05-01')).toBe('노동절')
    expect(getHolidays(2025).has('2025-07-17')).toBe(false)
  })

  it('양력 공휴일과 겹치는 날은 이름을 합친다', () => {
    expect(getHolidays(2028).get('2028-10-03')).toBe('추석·개천절')
    expect(getHolidays(2025).get('2025-05-05')).toBe('어린이날·부처님오신날')
  })

  it('표에 없는 해도 양력 공휴일은 나온다', () => {
    expect(getHolidays(2030).get('2030-12-25')).toBe('성탄절')
  })
})

describe('nextBusinessDay', () => {
  it('평일이면 그대로', () => {
    // 2026-10-26(월)
    expect(nextBusinessDay(2026, 10, 26, getHolidays(2026))).toBe(26)
  })
  it('토요일이면 월요일로', () => {
    // 2026-07-25(토) → 27(월)
    expect(nextBusinessDay(2026, 7, 25, getHolidays(2026))).toBe(27)
  })
  it('주말 뒤 공휴일이 이어지면 그다음 영업일로', () => {
    // 2026-10-03(토) 개천절 → 4(일) → 5(월, 대체공휴일) → 6(화)
    expect(nextBusinessDay(2026, 10, 3, getHolidays(2026))).toBe(6)
  })
  it('평일 공휴일도 미룬다', () => {
    // 2027-02-09(화) 설 대체공휴일 → 10(수)
    expect(nextBusinessDay(2027, 2, 9, getHolidays(2027))).toBe(10)
  })
})
