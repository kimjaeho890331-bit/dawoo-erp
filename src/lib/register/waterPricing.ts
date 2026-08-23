/** 수도 견적 미리보기 단가. /api/pricing 이 401·에러 JSON을 줘도 숫자를 유지한다. */

export const DEFAULT_WATER_PRICES = {
  전용: 8500,
  공용: 4500,
  공용_세대: 150000,
} as const

export type WaterPricing = {
  전용: number
  공용: number
  공용_세대: number
}

function positiveNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** `{ error: '인증이 필요합니다' }` 같이 단가 키가 없는 응답도 기본 단가로 되돌린다. */
export function mergeWaterPricing(data: unknown): WaterPricing {
  const row =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {}
  return {
    전용: positiveNumber(row.전용, DEFAULT_WATER_PRICES.전용),
    공용: positiveNumber(row.공용, DEFAULT_WATER_PRICES.공용),
    공용_세대: positiveNumber(row.공용_세대, DEFAULT_WATER_PRICES.공용_세대),
  }
}
