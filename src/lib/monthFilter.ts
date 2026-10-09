/**
 * 목록 화면의 「월 선택」과 「글자 검색」에 쓰는 순수 함수.
 * 지출관리·경리(카드내역)가 같이 쓴다. 날짜는 DB 그대로의 'YYYY-MM-DD' 문자열을 받는다.
 */

/** 월 선택에서 '전부 보기'를 뜻하는 값 */
export const ALL_MONTHS = '전체'

/** 'YYYY-MM-DD…' → 'YYYY-MM'. 날짜 꼴이 아니면 null (빈 값·깨진 값이 달 목록에 끼지 않게) */
export function monthOf(date: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? '')
  if (!m) return null
  const mm = Number(m[2])
  return mm >= 1 && mm <= 12 ? `${m[1]}-${m[2]}` : null
}

/**
 * 자료에 실제로 있는 달만 최신순으로. 자료가 없는 달을 늘어놓으면 골라도 빈 화면만 나온다.
 * `always`의 달(예: 이번 달)은 자료가 없어도 넣는다 — 기본으로 골라 둔 달이 목록에 없으면 안 된다.
 */
export function monthOptions(
  dates: Iterable<string | null | undefined>,
  always: string[] = [],
): string[] {
  const set = new Set<string>()
  for (const d of dates) {
    const m = monthOf(d)
    if (m) set.add(m)
  }
  for (const a of always) {
    const m = monthOf(`${a}-01`)
    if (m) set.add(m)
  }
  return [...set].sort((a, b) => b.localeCompare(a))
}

/** 이 날짜가 고른 달에 드는가. '전체'면 늘 그렇다. */
export function inMonth(date: string | null | undefined, month: string): boolean {
  if (month === ALL_MONTHS) return true
  return monthOf(date) === month
}

/** '2026-10' → '2026년 10월' */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return month
  return `${m[1]}년 ${Number(m[2])}월`
}

/**
 * 검색어가 칸들 중 어딘가에 들어 있는가. 대소문자 무시.
 * 띄어 쓴 낱말은 각각 어느 칸에든 있으면 된다 ("철물 수원" → 제목에 철물, 현장에 수원).
 */
export function matchesQuery(fields: (string | null | undefined)[], query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = fields.map(f => (f ?? '').toLowerCase())
  return words.every(w => hay.some(h => h.includes(w)))
}
