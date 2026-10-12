import { describe, expect, it } from 'vitest'
import {
  addMonths,
  classifyBank,
  coefficientOfVariation,
  detectLeaks,
  itemKey,
  kstDate,
  monthDiff,
  normalizeName,
  periodStart,
  summarizeReviews,
  type BankOutInput,
  type CardInput,
} from './leaks'

// 자료 기간: 2025-11 ~ 2026-10 (12개월). 이름·금액은 가짜다.
const MONTHS = Array.from({ length: 12 }, (_, i) => addMonths('2025-11', i))

let seq = 0
function bank(date: string, amount: number, name: string, opts: Partial<BankOutInput> = {}): BankOutInput {
  return { id: `b${++seq}`, account: '기업 1012', tx_at: `${date}T10:00:00+09:00`, amount, counterparty: null, description: name, ...opts }
}
function card(date: string, amount: number, merchant: string, cardName = '법인1'): CardInput {
  return { id: `c${++seq}`, card_name: cardName, merchant, amount, transaction_date: date }
}
/** 12개월 매달 같은 날 같은 금액 */
function monthly<T extends BankOutInput | CardInput>(day: number, amount: number, make: (date: string, amount: number) => T): T[] {
  return MONTHS.map(m => make(`${m}-${String(day).padStart(2, '0')}`, amount))
}
/** 통장 자료가 12개월 내내 있다는 것을 보여 주는 바탕 줄(매달 다른 곳, 정기로 묶이지 않음) */
const BANK_FILLER = MONTHS.map((m, i) => bank(`${m}-15`, 10_000 + i * 7_919, `거래처${'가나다라마바사아자차카타'[i]}`))

describe('normalizeName', () => {
  it('(주)·㈜·주식회사 표기 차이는 같은 곳', () => {
    expect(normalizeName('(주)케이티')).toBe('케이티')
    expect(normalizeName('㈜케이티')).toBe('케이티')
    expect(normalizeName('주식회사 케이티')).toBe('케이티')
    expect(normalizeName('케이티 (주)')).toBe('케이티')
  })

  it('달마다 바뀌는 날짜·회차·숫자와 끝 코드를 뺀다', () => {
    expect(normalizeName('KT 10월분 통신요금')).toBe('kt 통신요금')
    expect(normalizeName('2026.10 임대료')).toBe('임대료')
    expect(normalizeName('보험료 3회차')).toBe('보험료')
    expect(normalizeName('NAVER*PAY A1B2C3D4')).toBe('naver pay')
    expect(normalizeName('GS25 수원점')).toBe('gs 수원점')
  })

  it('이체 방식 낱말·기호·띄어쓰기를 정리한다', () => {
    expect(normalizeName(' CMS  국민연금 ')).toBe('국민연금')
    expect(normalizeName('KT 자동이체')).toBe(normalizeName('KT'))
    expect(normalizeName('20261008')).toBe('')
    expect(normalizeName(null)).toBe('')
  })
})

describe('날짜 도우미', () => {
  it('timestamptz(UTC 표기)를 한국 날짜로', () => {
    expect(kstDate('2026-10-07T15:30:00+00:00')).toBe('2026-10-08')
    expect(kstDate('2026-10-08T00:00:00+09:00')).toBe('2026-10-08')
    expect(kstDate('2026-10-08')).toBe('2026-10-08')
  })

  it('달 계산', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2025-11', 11)).toBe('2026-10')
    expect(monthDiff('2025-11', '2026-10')).toBe(11)
    expect(periodStart('2026-10-12', 12)).toBe('2025-11-01')
    expect(periodStart('2026-10-12', 3)).toBe('2026-08-01')
    expect(periodStart('2026-10-12', 1)).toBe('2026-10-01')
  })

  it('변동계수', () => {
    expect(coefficientOfVariation([100, 100, 100])).toBe(0)
    expect(coefficientOfVariation([75, 125])).toBeCloseTo(0.25)
  })
})

describe('classifyBank', () => {
  it('수수료를 먼저, 그다음 카드대금', () => {
    expect(classifyBank('타행이체수수료')).toBe('fee')
    expect(classifyBank('카드수수료')).toBe('fee')
    expect(classifyBank('신한카드대금')).toBe('cardBill')
    expect(classifyBank('국민카드')).toBe('cardBill')
    expect(classifyBank('KT통신요금')).toBe('normal')
  })
})

describe('정기지출', () => {
  it('매달 같은 날 같은 금액 → 정기. 월 평균·연간·처음·마지막', () => {
    const r = detectLeaks([...monthly(25, 55_000, (d, a) => bank(d, a, 'KT통신요금')), ...BANK_FILLER], [])
    expect(r.recurring).toHaveLength(1)
    const kt = r.recurring[0]
    expect(kt).toMatchObject({
      key: itemKey('bank', 'kt통신요금'), source: 'bank', label: 'KT통신요금', monthsSeen: 12, cadence: 1,
      monthlyAvg: 55_000, yearly: 660_000, lastAmount: 55_000, firstSeen: '2025-11-25', lastSeen: '2026-10-25',
      typicalDay: 25, reason: 'both',
    })
  })

  it('날짜는 들쭉날쭉해도 금액이 고르면 정기(금액 일정)', () => {
    const rows = MONTHS.map((m, i) => card(`${m}-${String(3 + (i * 7) % 25).padStart(2, '0')}`, 9_900, '넷플릭스'))
    const r = detectLeaks([], rows)
    expect(r.recurring.map(i => [i.label, i.reason])).toEqual([['넷플릭스', 'stable']])
  })

  it('금액은 달라도 매달 같은 날이면 정기(날짜 일정) — 전기요금처럼', () => {
    const amounts = [30_000, 52_000, 41_000, 70_000, 35_000, 60_000, 33_000, 75_000, 40_000, 55_000, 30_000, 66_000]
    const rows = MONTHS.map((m, i) => bank(`${m}-${i % 2 ? '19' : '21'}`, amounts[i], '한국전력'))
    const r = detectLeaks([...rows, ...BANK_FILLER], [])
    const kepco = r.recurring.find(i => i.label === '한국전력')
    expect(kepco?.reason).toBe('sameDay')
    expect(kepco?.typicalDay).toBe(20)
  })

  it('금액도 날짜도 들쭉날쭉하면 정기가 아니다(변동계수 0.25 초과)', () => {
    const rows = MONTHS.map((m, i) => bank(`${m}-${String(1 + (i * 11) % 27).padStart(2, '0')}`, i % 2 ? 1_400_000 : 600_000, '철물상회'))
    const r = detectLeaks([...rows, ...BANK_FILLER], [])
    expect(r.recurring.find(i => i.label === '철물상회')).toBeUndefined()
  })

  it('두 달에만 나온 것은 자료가 길면 정기가 아니고, 자료가 짧으면(3개월 이하) 연속 두 달로 정기', () => {
    const twoMonths = [bank('2026-09-10', 20_000, '클라우드'), bank('2026-10-10', 20_000, '클라우드')]
    expect(detectLeaks([...twoMonths, ...BANK_FILLER], []).recurring.find(i => i.label === '클라우드')).toBeUndefined()
    const short = detectLeaks([...twoMonths, bank('2026-09-20', 5_000, '기타1')], [])
    expect(short.recurring.map(i => i.label)).toEqual(['클라우드'])
  })

  it('덜 찬 마지막 달 때문에 여러 번 나가는 곳을 놓치지 않는다(평균에서도 뺀다)', () => {
    // 자료 3개월(8~10월), 10월은 12일까지라 주유를 한 번만 했다 → 합계 [100k, 100k, 50k], 전체 변동계수 0.28
    const fuel = [
      card('2026-08-03', 50_000, '주유소'), card('2026-08-20', 50_000, '주유소'),
      card('2026-09-03', 50_000, '주유소'), card('2026-09-20', 50_000, '주유소'),
      card('2026-10-03', 50_000, '주유소'),
    ]
    expect(coefficientOfVariation([100_000, 100_000, 50_000])).toBeGreaterThan(0.25)
    const r = detectLeaks([], fuel)
    expect(r.recurring).toEqual([expect.objectContaining({ label: '주유소', monthlyAvg: 100_000, lastAmount: 50_000 })])
    // 덜 찬 달이 아니라 가운데 달이 비면 그대로 정기가 아니다
    const holeInMiddle = [...fuel.slice(0, 2), fuel[2], card('2026-10-03', 50_000, '주유소'), card('2026-10-20', 50_000, '주유소')]
    expect(detectLeaks([], holeInMiddle).recurring).toEqual([])
  })

  it('세 달마다 나가는 것은 월로 나눠 환산한다', () => {
    const rows = ['2025-11', '2026-02', '2026-05', '2026-08'].map(m => bank(`${m}-05`, 300_000, '정수기 관리'))
    const q = detectLeaks([...rows, ...BANK_FILLER], []).recurring.find(i => i.label === '정수기 관리')
    expect(q).toMatchObject({ cadence: 3, perPayment: 300_000, monthlyAvg: 100_000, yearly: 1_200_000 })
  })

  it('최근 두 달 안 나온 정기지출은 「끊긴 것」으로 따로', () => {
    const until7 = MONTHS.slice(0, 9).map(m => bank(`${m}-01`, 33_000, '옛날보안업체'))
    const until9 = MONTHS.slice(0, 11).map(m => bank(`${m}-01`, 44_000, '지금보안업체'))
    const r = detectLeaks([...until7, ...until9, ...BANK_FILLER], [])
    expect(r.stopped.map(i => i.label)).toEqual(['옛날보안업체'])
    expect(r.recurring.map(i => i.label)).toEqual(['지금보안업체'])
  })

  it('월 환산 큰 순', () => {
    const r = detectLeaks([
      ...monthly(1, 10_000, (d, a) => bank(d, a, '작은것')),
      ...monthly(2, 900_000, (d, a) => bank(d, a, '임대료')),
      ...BANK_FILLER,
    ], [])
    expect(r.recurring.map(i => i.label)).toEqual(['임대료', '작은것'])
  })
})

describe('금액 오른 정기결제', () => {
  it('마지막 금액이 이전 중앙값보다 5% 넘게 오르면 표시, 1년 추가 금액', () => {
    const rows = MONTHS.map((m, i) => card(`${m}-10`, i === 11 ? 11_000 : 10_000, '어도비'))
    const p = detectLeaks([], rows).priceIncreases
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ before: 10_000, latest: 11_000, yearlyExtra: 12_000 })
    expect(p[0].ratio).toBeCloseTo(0.1)
  })

  it('5% 이하는 표시하지 않는다', () => {
    const rows = MONTHS.map((m, i) => card(`${m}-10`, i === 11 ? 10_500 : 10_000, '어도비'))
    expect(detectLeaks([], rows).priceIncreases).toEqual([])
  })

  it('한 달에 여러 번 나가는 곳(주유 등)은 보지 않는다', () => {
    const rows = MONTHS.flatMap((m, i) => [card(`${m}-03`, 50_000, '주유소'), card(`${m}-17`, i === 11 ? 70_000 : 50_000, '주유소')])
    const r = detectLeaks([], rows)
    expect(r.recurring.map(i => i.label)).toEqual(['주유소'])
    expect(r.priceIncreases).toEqual([])
  })
})

describe('중복 의심', () => {
  it('같은 날·같은 곳·같은 금액 두 번 이상', () => {
    const r = detectLeaks([], [
      card('2026-10-01', 50_000, '(주)사무용품'), card('2026-10-01', 50_000, '사무용품'),
      card('2026-10-01', 1_500, 'GS25'), card('2026-10-01', 1_500, 'GS25'),   // 1만원 미만은 잡음이라 뺀다
      card('2026-10-02', 30_000, '식당'), card('2026-10-02', 31_000, '식당'),  // 금액이 다르면 아니다
    ])
    expect(r.duplicates).toEqual([
      expect.objectContaining({ source: 'card', date: '2026-10-01', amount: 50_000, count: 2, extra: 50_000 }),
    ])
  })

  it('통장도 본다(같은 사람에게 같은 금액 두 번 이체)', () => {
    const r = detectLeaks([bank('2026-10-05', 1_200_000, '홍길동'), bank('2026-10-05', 1_200_000, '홍길동')], [])
    expect(r.duplicates).toHaveLength(1)
    expect(r.duplicates[0]).toMatchObject({ source: 'bank', count: 2, extra: 1_200_000 })
  })
})

describe('수수료', () => {
  it('통장 수수료를 달·종류별로 더하고 정기지출에는 넣지 않는다', () => {
    const fees = MONTHS.flatMap(m => [bank(`${m}-03`, 500, '타행이체수수료'), bank(`${m}-20`, 500, '타행이체수수료')])
    const r = detectLeaks([...fees, ...BANK_FILLER, bank('2026-10-09', 1_000, 'SMS수수료')], [])
    expect(r.recurring).toEqual([])
    expect(r.fees.total).toBe(12_000 + 1_000)
    expect(r.fees.count).toBe(25)
    expect(r.fees.months).toHaveLength(12)
    expect(r.fees.monthlyAvg).toBe(Math.round(13_000 / 12))
    expect(r.fees.yearly).toBe(Math.round((13_000 / 12) * 12))
    expect(r.fees.byName[0]).toEqual({ label: '타행이체수수료', total: 12_000, count: 24 })
  })
})

describe('카드대금', () => {
  it('통장의 카드대금은 정기·일회성에서 빼고 카드 내역 합계와 맞춰 본다', () => {
    const cards = [card('2026-09-03', 400_000, '자재상'), card('2026-09-20', 100_000, '식당', '법인2')]
    const bills = MONTHS.map(m => bank(`${m}-14`, m === '2026-10' ? 500_000 : 777_000, '신한카드대금'))
    const r = detectLeaks([...bills, ...BANK_FILLER], cards)
    expect(r.recurring.find(i => i.label.includes('카드'))).toBeUndefined()
    expect(r.oneOffs.find(o => o.name.includes('카드'))).toBeUndefined()
    expect(r.cardBills.rows).toHaveLength(12)
    expect(r.cardBills.total).toBe(777_000 * 11 + 500_000)
    const oct = r.cardBills.rows.find(b => b.date === '2026-10-14')
    expect(oct).toMatchObject({ matchedMonth: '2026-09', matchedCard: null })
  })
})

describe('큰 일회성 지출', () => {
  it('정기로 묶이지 않은 지출 중 큰 것. 상위 20건 + 100만원 이상 전부', () => {
    const big = Array.from({ length: 25 }, (_, i) => bank(`2026-0${1 + (i % 9)}-11`, 2_000_000 + i * 1_000, `하도급${i}업체${'가나다라마바사아자차카타파하'[i % 14]}`))
    const small = Array.from({ length: 5 }, (_, i) => bank(`2026-03-0${i + 1}`, 10_000 + i, `소액${'가나다라마'[i]}`))
    const rent = monthly(1, 3_000_000, (d, a) => bank(d, a, '임대료'))
    const r = detectLeaks([...big, ...small, ...rent], [])
    // 100만원 이상 25건이 상위 20건보다 많으므로 25건 모두, 소액은 빠진다. 정기(임대료)는 빠진다.
    expect(r.oneOffs).toHaveLength(25)
    expect(r.oneOffs.every(o => o.amount >= 2_000_000 && o.name !== '임대료')).toBe(true)
    expect(r.oneOffs[0].amount).toBe(2_024_000)
  })

  it('큰 지출이 적으면 상위 20건을 채운다', () => {
    const rows = Array.from({ length: 30 }, (_, i) => card(`2026-10-${String(1 + (i % 28)).padStart(2, '0')}`, 1_000 * (i + 1), `가게${i}호${'가나다라마바사아자차'[i % 10]}`))
    expect(detectLeaks([], rows).oneOffs).toHaveLength(20)
  })
})

describe('기간', () => {
  it('기간 밖 줄은 보지 않는다', () => {
    const rows = monthly(25, 55_000, (d, a) => bank(d, a, 'KT통신요금'))
    const r = detectLeaks(rows, [], { from: '2026-08-01', to: '2026-10-31' })
    expect(r.coverage.bank).toMatchObject({ months: ['2026-08', '2026-09', '2026-10'], count: 3, from: '2026-08-25', to: '2026-10-25' })
    expect(r.recurring[0].monthsSeen).toBe(3)
  })
})

describe('summarizeReviews', () => {
  const rows = [
    ...monthly(1, 100_000, (d, a) => bank(d, a, '임대료')),
    ...monthly(2, 50_000, (d, a) => bank(d, a, '보안업체')),
    ...monthly(3, 30_000, (d, a) => bank(d, a, '정수기')),
    ...monthly(4, 20_000, (d, a) => bank(d, a, '안쓰는구독')),
    ...MONTHS.slice(0, 6).map(m => bank(`${m}-05`, 9_000, '이미해지')),
    ...BANK_FILLER,
  ]
  const report = detectLeaks(rows, [])

  it('요약 카드 숫자와 고정지출 목록', () => {
    const s = summarizeReviews(report, [
      { item_key: 'bank:임대료', label: '임대료', decision: 'keep', monthly_amount: 100_000, note: '사무실' },
      { item_key: 'bank:보안업체', label: '보안업체', decision: 'reduce', monthly_amount: 50_000, note: null },
      { item_key: 'bank:안쓰는구독', label: '안쓰는구독', decision: 'cancelled', monthly_amount: 20_000, note: null },
      { item_key: 'bank:이미해지', label: '이미해지', decision: 'cancel', monthly_amount: 9_000, note: null },
      // 이번 기간에 안 나온 항목도 「필요」면 목록에 남긴다(적어 둔 금액으로)
      { item_key: 'card:옛날것', label: '옛날것', decision: 'keep', monthly_amount: 7_000, note: null },
    ])
    expect(report.recurring.map(i => i.label)).toEqual(['임대료', '보안업체', '정수기', '안쓰는구독'])
    expect(report.stopped.map(i => i.label)).toEqual(['이미해지'])
    // 지금 매달: 해지함 표시한 안쓰는구독은 뺀다
    expect(s.monthlyTotal).toBe(100_000 + 50_000 + 30_000)
    expect(s.yearlyTotal).toBe(180_000 * 12)
    expect(s.remaining).toBe(1)   // 정수기만 검토 전
    expect(s.cancelYearly).toBe((20_000 + 9_000) * 12)
    expect(s.reduceYearly).toBe(50_000 * 12)
    expect(s.savingsYearly).toBe((20_000 + 9_000 + 50_000) * 12)
    expect(s.fixed).toEqual([
      { key: 'bank:임대료', label: '임대료', source: 'bank', monthly: 100_000, note: '사무실', detected: true },
      { key: 'card:옛날것', label: '옛날것', source: 'card', monthly: 7_000, note: null, detected: false },
    ])
    expect(s.fixedMonthly).toBe(107_000)
  })

  it('검토 결과가 없으면 전부 검토 전', () => {
    const s = summarizeReviews(report, [])
    expect(s.remaining).toBe(4)
    expect(s.savingsYearly).toBe(0)
    expect(s.fixed).toEqual([])
  })
})
