/**
 * 카드 CSV를 올릴 때 이미 들어 있는 내역을 다시 넣지 않게 거른다.
 * 예전에는 같은 파일을 두 번 올리면 내역과 합계가 그대로 두 배가 됐다.
 *
 * 같은 결제로 보는 기준: 카드 + 거래일 + 금액 + 가맹점.
 * 같은 날 같은 가게에서 같은 금액을 두 번 긁는 일은 실제로 있다(커피 두 잔 따로 결제 등).
 * 그래서 「있으면 전부 건너뜀」이 아니라 「DB에 있는 개수만큼만 건너뜀」으로 센다 —
 * 처음 올릴 때 두 건은 두 건 다 들어가고, 같은 파일을 다시 올리면 둘 다 건너뛴다.
 */

export interface CardRowKeyFields {
  card_name: string | null
  transaction_date: string | null
  amount: number | string | null
  merchant: string | null
}

/** 비교용 열쇠. 앞뒤 공백·시간 부분·금액 표기(문자/숫자) 차이는 같은 것으로 본다. */
export function cardRowKey(r: CardRowKeyFields): string {
  const card = (r.card_name ?? '').trim()
  const date = (r.transaction_date ?? '').slice(0, 10)
  const amount = Number(r.amount ?? 0)
  const merchant = (r.merchant ?? '').trim()
  return `${card}|${date}|${amount}|${merchant}`
}

/** 'YYYY-MM-DD'의 다음 날 (달·해 넘김 포함) */
export function nextDay(date: string): string {
  return new Date(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
}

/**
 * 파일 안 거래일의 처음·끝 — 기존 내역은 이 사이만 읽어 와 비교한다. 비었으면 null.
 * before = 끝날의 다음 날. '끝날 이하' 대신 '다음 날 미만'으로 물으면 날짜 칸이 시각을 가져도 끝날이 빠지지 않는다.
 */
export function cardDateRange(rows: { transaction_date: string }[]): { from: string; to: string; before: string } | null {
  let from: string | null = null
  let to: string | null = null
  for (const r of rows) {
    const d = (r.transaction_date ?? '').slice(0, 10)
    if (!d) continue
    if (from === null || d < from) from = d
    if (to === null || d > to) to = d
  }
  return from && to ? { from, to, before: nextDay(to) } : null
}

/** 올릴 줄을 「새로 넣을 것」과 「이미 있어 건너뛸 것」으로 나눈다. 원래 순서는 지킨다. */
export function splitNewCardRows<T extends CardRowKeyFields>(
  rows: T[],
  existing: CardRowKeyFields[],
): { fresh: T[]; skipped: T[] } {
  const left = new Map<string, number>()
  for (const e of existing) {
    const k = cardRowKey(e)
    left.set(k, (left.get(k) ?? 0) + 1)
  }
  const fresh: T[] = []
  const skipped: T[] = []
  for (const r of rows) {
    const k = cardRowKey(r)
    const n = left.get(k) ?? 0
    if (n > 0) {
      left.set(k, n - 1)
      skipped.push(r)
    } else {
      fresh.push(r)
    }
  }
  return { fresh, skipped }
}
