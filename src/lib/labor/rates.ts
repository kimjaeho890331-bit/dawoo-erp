// 일용직 공제 요율 (% 단위).
// labor_rates 한 줄 = "이 달부터 적용". 다음 줄이 나오기 전까지의 모든 달에 쓰인다.

export interface LaborRates {
  income: number     // 소득세: (일급-15만) × 요율
  resident: number   // 주민세: 소득세 × 요율
  employment: number // 고용보험: 총지급액 × 요율
  pension: number    // 국민연금: 총지급액 × 요율
  health: number     // 건강보험: 총지급액 × 요율
  longterm: number   // 장기요양: 건강보험 × 요율
}

export const DEFAULT_RATES: LaborRates = { income: 2.7, resident: 10, employment: 0.9, pension: 4.5, health: 3.43, longterm: 11.52 }

export const RATE_FIELDS: { key: keyof LaborRates; label: string; basis: string }[] = [
  { key: 'income', label: '소득세', basis: '(일급 − 15만원) × 요율' },
  { key: 'resident', label: '주민세', basis: '소득세 × 요율' },
  { key: 'employment', label: '고용보험', basis: '총지급액 × 요율' },
  { key: 'pension', label: '국민연금', basis: '총지급액 × 요율' },
  { key: 'health', label: '건강보험', basis: '총지급액 × 요율' },
  { key: 'longterm', label: '장기요양', basis: '건강보험 × 요율' },
]

export interface LaborRateRow {
  year: number
  month: number
  rates: Partial<LaborRates> | null
}

const ym = (year: number, month: number) => year * 12 + month

/** 그 달에 적용되는 요율: 적용 시작월이 그 달 이전(포함)인 것 중 가장 늦은 줄. 없으면 기본값. */
export function pickRates(rows: LaborRateRow[], year: number, month: number): LaborRates {
  let best: LaborRateRow | null = null
  for (const row of rows) {
    if (ym(row.year, row.month) > ym(year, month)) continue
    if (!best || ym(row.year, row.month) > ym(best.year, best.month)) best = row
  }
  return { ...DEFAULT_RATES, ...(best?.rates ?? {}) }
}
