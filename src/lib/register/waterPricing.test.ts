import { describe, expect, it } from 'vitest'
import { DEFAULT_WATER_PRICES, mergeWaterPricing } from './waterPricing'

describe('mergeWaterPricing', () => {
  it('인증 실패 JSON을 setPricing 하면 toLocaleString 이 터지던 응답을 기본 단가로 되돌린다', () => {
    const merged = mergeWaterPricing({ error: '인증이 필요합니다' })
    expect(merged).toEqual(DEFAULT_WATER_PRICES)
    expect(merged.전용.toLocaleString()).toBe('8,500')
    expect(merged.공용.toLocaleString()).toBe('4,500')
    expect(merged.공용_세대.toLocaleString()).toBe('150,000')
  })

  it('빈 값·배열·null 도 기본 단가다', () => {
    expect(mergeWaterPricing(null)).toEqual(DEFAULT_WATER_PRICES)
    expect(mergeWaterPricing(undefined)).toEqual(DEFAULT_WATER_PRICES)
    expect(mergeWaterPricing([])).toEqual(DEFAULT_WATER_PRICES)
    expect(mergeWaterPricing({})).toEqual(DEFAULT_WATER_PRICES)
  })

  it('유효한 단가만 덮어쓴다', () => {
    expect(mergeWaterPricing({ 전용: 9000, 공용: 0, 공용_세대: '200000' })).toEqual({
      전용: 9000,
      공용: DEFAULT_WATER_PRICES.공용,
      공용_세대: 200000,
    })
  })
})
