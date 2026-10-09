import { describe, expect, it } from 'vitest'
import { cardDateRange, cardRowKey, nextDay, splitNewCardRows } from './cardImport'

const row = (date: string, merchant: string, amount: number, card = '법인1') => ({
  card_name: card, transaction_date: date, merchant, amount, category: '기타',
})

describe('cardRowKey', () => {
  it('공백·시간·금액 표기 차이는 같은 결제로 본다', () => {
    expect(cardRowKey({ card_name: ' 법인1 ', transaction_date: '2026-10-01T00:00:00', amount: '12000', merchant: 'GS25 ' }))
      .toBe(cardRowKey({ card_name: '법인1', transaction_date: '2026-10-01', amount: 12000, merchant: 'GS25' }))
  })

  it('카드·날짜·금액·가맹점 중 하나라도 다르면 다른 결제', () => {
    const base = { card_name: '법인1', transaction_date: '2026-10-01', amount: 12000, merchant: 'GS25' }
    expect(cardRowKey({ ...base, card_name: '법인2' })).not.toBe(cardRowKey(base))
    expect(cardRowKey({ ...base, transaction_date: '2026-10-02' })).not.toBe(cardRowKey(base))
    expect(cardRowKey({ ...base, amount: 12001 })).not.toBe(cardRowKey(base))
    expect(cardRowKey({ ...base, merchant: 'CU' })).not.toBe(cardRowKey(base))
  })
})

describe('nextDay', () => {
  it('달·해·윤달을 넘긴다', () => {
    expect(nextDay('2026-10-09')).toBe('2026-10-10')
    expect(nextDay('2026-10-31')).toBe('2026-11-01')
    expect(nextDay('2026-12-31')).toBe('2027-01-01')
    expect(nextDay('2028-02-28')).toBe('2028-02-29')
  })
})

describe('cardDateRange', () => {
  it('파일 안 첫날과 끝날, 끝날의 다음 날', () => {
    expect(cardDateRange([row('2026-09-15', 'a', 1), row('2026-09-01', 'b', 1), row('2026-10-31', 'c', 1)]))
      .toEqual({ from: '2026-09-01', to: '2026-10-31', before: '2026-11-01' })
  })

  it('비었으면 null', () => {
    expect(cardDateRange([])).toBeNull()
  })
})

describe('splitNewCardRows', () => {
  it('처음 올리면 전부 새로 넣는다', () => {
    const rows = [row('2026-10-01', 'GS25', 3000), row('2026-10-02', '김밥천국', 8000)]
    const { fresh, skipped } = splitNewCardRows(rows, [])
    expect(fresh).toEqual(rows)
    expect(skipped).toEqual([])
  })

  it('같은 파일을 다시 올리면 전부 건너뛴다', () => {
    const rows = [row('2026-10-01', 'GS25', 3000), row('2026-10-02', '김밥천국', 8000)]
    const { fresh, skipped } = splitNewCardRows(rows, rows)
    expect(fresh).toEqual([])
    expect(skipped).toEqual(rows)
  })

  it('기간이 겹치는 새 파일은 겹친 것만 건너뛰고 순서는 지킨다', () => {
    const existing = [row('2026-10-01', 'GS25', 3000)]
    const rows = [row('2026-10-02', '김밥천국', 8000), row('2026-10-01', 'GS25', 3000), row('2026-10-03', '주유소', 50000)]
    const { fresh, skipped } = splitNewCardRows(rows, existing)
    expect(fresh.map(r => r.merchant)).toEqual(['김밥천국', '주유소'])
    expect(skipped.map(r => r.merchant)).toEqual(['GS25'])
  })

  it('같은 날 같은 결제가 두 번이면 DB에 있는 개수만큼만 건너뛴다', () => {
    const coffee = row('2026-10-01', '스타벅스', 4500)
    // 처음: 두 건 다 들어간다
    expect(splitNewCardRows([coffee, { ...coffee }], []).fresh).toHaveLength(2)
    // 한 건만 들어가 있던 상태: 나머지 한 건만 넣는다
    const once = splitNewCardRows([coffee, { ...coffee }], [coffee])
    expect(once.fresh).toHaveLength(1)
    expect(once.skipped).toHaveLength(1)
    // 두 건 다 있으면: 둘 다 건너뛴다
    expect(splitNewCardRows([coffee, { ...coffee }], [coffee, coffee]).fresh).toHaveLength(0)
  })

  it('다른 카드의 같은 결제는 건너뛰지 않는다', () => {
    const { fresh } = splitNewCardRows([row('2026-10-01', 'GS25', 3000, '법인2')], [row('2026-10-01', 'GS25', 3000, '법인1')])
    expect(fresh).toHaveLength(1)
  })
})
