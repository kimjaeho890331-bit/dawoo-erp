/**
 * 새는 돈 찾기 — 통장 출금 + 법인카드 내역에서 「매달 나가는 돈」과 새는 돈을 찾는 순수 함수.
 *
 * 대표: "회사에서 빠져나가는 1원까지 알고 싶다." 직원이 적어 사람 손으로 통장을 넘겨 보며
 * 자동이체·구독료·수수료를 찾기는 어렵다. 같은 곳으로 반복해 나가는 돈을 묶어 보여 주고,
 * 대표가 필요/해지/줄이기를 고르면 남은 것이 회사의 「고정지출 목록」이 된다.
 *
 * DB·화면과 무관하게 입력(행 배열)만으로 계산한다 — 기준(몇 달, 몇 %)을 테스트로 묶어 둔다.
 */

import type { SpendDecision } from '@/types'

export type SpendSource = 'bank' | 'card'
/** normal 일반 지출 / fee 은행 수수료 / cardBill 카드대금(카드 상세와 겹치므로 따로 센다) */
export type SpendKind = 'normal' | 'fee' | 'cardBill'

export const SOURCE_LABEL: Record<SpendSource, string> = { bank: '통장', card: '카드' }

/** 기준값. 화면은 기본값을 쓰고, 테스트는 여기를 바꿔 경계를 확인한다. */
export interface LeakOptions {
  /** 정기로 보려면 나온 달 수(서로 다른 달) */
  minMonths: number
  /** 자료가 짧을 때(아래 달 수 이하)는 연속 2개월만 나와도 정기로 본다 */
  shortCoverageMonths: number
  /** 달마다 금액의 흔들림(변동계수 = 표준편차 ÷ 평균) 허용치. 0.25 = 평균의 ±25% 안팎 */
  maxCv: number
  /** 「매달 비슷한 날」로 볼 날짜 차이(일) */
  dayTolerance: number
  /** 「비슷한 날」은 한 달에 한 번꼴로 나가는 것에만 의미가 있다. 달마다 평균 결제 횟수 상한 */
  maxTxPerMonthForDay: number
  /** 최근 금액이 이전 중앙값보다 이만큼(5%) 넘게 오르면 「금액 오름」 */
  priceIncreaseRatio: number
  /** 큰 일회성 지출: 금액 순 상위 N건 … */
  oneOffTopN: number
  /** … 또는 이 금액 이상은 모두 */
  oneOffMinAmount: number
  /** 중복 의심은 이 금액 이상만(편의점 1,500원 두 번 같은 잡음을 뺀다) */
  duplicateMinAmount: number
  /** 카드대금 출금이 카드 내역 한 달 합계와 이 비율 안이면 「같은 돈」으로 표시 */
  cardBillTolerance: number
}

export const DEFAULT_LEAK_OPTIONS: LeakOptions = {
  minMonths: 3,
  shortCoverageMonths: 3,
  maxCv: 0.25,
  dayTolerance: 3,
  maxTxPerMonthForDay: 1.5,
  priceIncreaseRatio: 0.05,
  oneOffTopN: 20,
  oneOffMinAmount: 1_000_000,
  duplicateMinAmount: 10_000,
  cardBillTolerance: 0.01,
}

// ---------------- 입력 ----------------

/** bank_transactions 출금 줄에서 쓰는 칸 */
export interface BankOutInput {
  id?: string | null
  account: string | null
  tx_at: string
  amount: number | string
  counterparty: string | null
  description: string | null
}

/** card_transactions에서 쓰는 칸 */
export interface CardInput {
  id?: string | null
  card_name: string | null
  merchant: string | null
  amount: number | string
  transaction_date: string
}

/** 통장·카드를 한 모양으로 */
export interface SpendRow {
  source: SpendSource
  id: string | null
  date: string    // 'YYYY-MM-DD' (한국 날짜)
  month: string   // 'YYYY-MM'
  amount: number
  /** 원래 이름(받는 분·거래내용·가맹점) */
  name: string
  /** 묶음용으로 정리한 이름. 비면 묶을 수 없다 */
  norm: string
  /** 정기지출 검토 열쇠(spend_reviews.item_key). norm이 비면 '' */
  key: string
  /** 통장 이름 또는 카드 이름 */
  via: string
  kind: SpendKind
}

// ---------------- 이름 정리 ----------------

/** 이름 앞뒤에 붙는 이체 방식 낱말 — 같은 곳인데 'KT 자동이체'와 'KT'가 갈리지 않게 */
const NOISE_TOKENS = new Set(['cms', '자동이체', '자동납부', '이체', '펌뱅킹', '인터넷', '모바일', '스마트폰', '타행', '당행'])

/**
 * 같은 곳으로 나간 돈을 묶기 위한 이름 정리.
 * - (주)·㈜·주식회사·(유)·유한회사를 뺀다 ('(주)케이티' = '케이티')
 * - 날짜·회차('10월분', '2026.10', '3회차')와 숫자를 뺀다 — 달마다 바뀌는 부분이라
 * - 글자·숫자가 섞인 6자 이상 덩어리(승인·주문 번호 같은 끝 코드)를 뺀다
 * - 기호를 빼고, 띄어쓰기를 하나로, 영문은 소문자로
 * 결과는 묶음 열쇠일 뿐 화면에는 원래 이름을 보인다.
 */
export function normalizeName(s: string | null | undefined): string {
  let t = (s ?? '').normalize('NFKC').toLowerCase()
  t = t.replace(/\(\s*(주|유|사|재)\s*\)|주식회사|유한회사|^\s*주\)|\(\s*주\s*$/g, ' ')
  t = t.replace(/\d{2,4}\s*[.\-/]\s*\d{1,2}(?:\s*[.\-/]\s*\d{1,2})?/g, ' ')
  t = t.replace(/\d+\s*(?:년|월분|월|일|회차|회|차)/g, ' ')
  t = t.replace(/[a-z0-9]*(?:[a-z][0-9]|[0-9][a-z])[a-z0-9]*/g, m => (m.length >= 6 ? ' ' : m))
  t = t.replace(/\d+/g, ' ')
  t = t.replace(/[^\p{L}\s]/gu, ' ')
  const tokens = t.split(/\s+/).filter(w => w && !NOISE_TOKENS.has(w))
  return tokens.join(' ').trim()
}

/** spend_reviews.item_key */
export function itemKey(source: SpendSource, norm: string): string {
  return `${source}:${norm}`
}

// ---------------- 날짜 ----------------

/** timestamptz(읽으면 UTC 표기) → 한국 날짜. 날짜만 온 값은 그대로 */
export function kstDate(ts: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts
  const ms = Date.parse(ts)
  if (Number.isNaN(ms)) return ts.slice(0, 10)
  return new Date(ms + 9 * 3600000).toISOString().slice(0, 10)
}

function ymIndex(ym: string): number {
  return Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1
}

/** b가 a보다 몇 달 뒤인가 ('2026-01' → '2026-03' = 2) */
export function monthDiff(a: string, b: string): number {
  return ymIndex(b) - ymIndex(a)
}

/** 'YYYY-MM'에 n달 더하기 */
export function addMonths(ym: string, n: number): string {
  const i = ymIndex(ym) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

/** 기간 시작일: 오늘이 든 달을 포함해 최근 months개월의 첫날 (12 → 작년 같은 달 다음 달 1일) */
export function periodStart(today: string, months: number): string {
  return `${addMonths(today.slice(0, 7), -(Math.max(months, 1) - 1))}-01`
}

// ---------------- 분류 ----------------

function toNumber(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** 통장 줄의 종류. 수수료를 먼저 본다('카드수수료'는 수수료) */
export function classifyBank(text: string): SpendKind {
  if (text.includes('수수료')) return 'fee'
  // 카드대금은 법인카드 내역(card_transactions)에 가맹점별로 이미 들어 있다 — 같이 세면 두 번 센다.
  if (text.includes('카드')) return 'cardBill'
  return 'normal'
}

/** 통장 출금·카드 내역을 한 모양으로. 금액 0 이하 줄(취소 등)은 뺀다 */
export function toSpendRows(bank: BankOutInput[], card: CardInput[]): SpendRow[] {
  const rows: SpendRow[] = []
  for (const b of bank) {
    const amount = Math.abs(toNumber(b.amount))
    if (amount <= 0) continue
    // 묶음 이름은 상대 예금주가 있으면 그것(달마다 같다), 없으면 거래내용(자동이체는 여기에 회사명)
    const name = (b.counterparty ?? '').trim() || (b.description ?? '').trim()
    const norm = normalizeName(name)
    const date = kstDate(b.tx_at)
    rows.push({
      source: 'bank', id: b.id ?? null, date, month: date.slice(0, 7), amount, name, norm,
      key: norm ? itemKey('bank', norm) : '',
      via: (b.account ?? '').trim() || '통장',
      kind: classifyBank(`${b.counterparty ?? ''} ${b.description ?? ''}`),
    })
  }
  for (const c of card) {
    const amount = toNumber(c.amount)
    if (amount <= 0) continue
    const name = (c.merchant ?? '').trim()
    const norm = normalizeName(name)
    const date = (c.transaction_date ?? '').slice(0, 10)
    rows.push({
      source: 'card', id: c.id ?? null, date, month: date.slice(0, 7), amount, name, norm,
      key: norm ? itemKey('card', norm) : '',
      via: (c.card_name ?? '').trim() || '카드',
      kind: 'normal',
    })
  }
  return rows
}

// ---------------- 결과 모양 ----------------

export interface MonthAmount {
  month: string
  total: number
  count: number
}

export interface RecurringItem {
  key: string
  source: SpendSource
  label: string
  via: string[]
  /** 나온 달만, 오래된 순 */
  months: MonthAmount[]
  monthsSeen: number
  /** 몇 달마다 나가는가. 1 = 매달, 3 = 석 달마다 */
  cadence: number
  /** 나간 달의 평균 금액(한 번 나갈 때) */
  perPayment: number
  /** 한 달로 환산 = perPayment ÷ cadence */
  monthlyAvg: number
  /** 1년 환산 = monthlyAvg × 12 */
  yearly: number
  /** 마지막으로 나간 달의 합계 */
  lastAmount: number
  firstSeen: string
  lastSeen: string
  txCount: number
  cv: number
  /** 보통 나가는 날(한 달에 한 번꼴일 때만) */
  typicalDay: number | null
  /** 정기로 본 까닭: 금액이 일정 / 날짜가 일정 / 둘 다 */
  reason: 'stable' | 'sameDay' | 'both'
}

export interface PriceIncrease {
  item: RecurringItem
  before: number
  latest: number
  /** 0.1 = 10% 오름 */
  ratio: number
  /** 오른 만큼을 1년으로 */
  yearlyExtra: number
}

export interface DuplicateGroup {
  source: SpendSource
  key: string
  date: string
  label: string
  amount: number
  count: number
  /** 한 번만 나갔어야 했다면 더 나간 돈 = 금액 × (건수 − 1) */
  extra: number
  via: string[]
}

export interface FeeSummary {
  total: number
  count: number
  months: MonthAmount[]
  monthlyAvg: number
  yearly: number
  byName: { label: string; total: number; count: number }[]
}

export interface CardBillRow extends SpendRow {
  /** 카드 내역 어느 달 합계와 같은가('YYYY-MM'). 못 찾으면 null */
  matchedMonth: string | null
  /** 그 합계가 특정 카드 것이면 카드 이름, 전체 카드 합계면 null */
  matchedCard: string | null
}

export interface SourceCoverage {
  months: string[]
  count: number
  from: string | null
  to: string | null
}

export interface LeakReport {
  coverage: Record<SpendSource, SourceCoverage>
  /** 지금도 나가는 정기지출. 월 환산 큰 순 */
  recurring: RecurringItem[]
  /** 정기였는데 최근 두 번 이상 안 나간 것(이미 해지됐을 가능성) */
  stopped: RecurringItem[]
  priceIncreases: PriceIncrease[]
  duplicates: DuplicateGroup[]
  fees: FeeSummary
  oneOffs: SpendRow[]
  cardBills: { rows: CardBillRow[]; total: number }
}

// ---------------- 계산 도우미 ----------------

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** 변동계수 = 표준편차 ÷ 평균 (모집단). 평균 0이면 0 */
export function coefficientOfVariation(xs: number[]): number {
  const m = mean(xs)
  if (m <= 0) return 0
  const v = mean(xs.map(x => (x - m) ** 2))
  return Math.sqrt(v) / m
}

/** 달 안의 날짜 차이. 31일과 1일은 하루 차이로 본다(말일 결제가 달마다 30·31·1일로 흔들린다) */
function dayDistance(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 31 - d)
}

function mostCommon(names: string[]): string {
  const count = new Map<string, number>()
  let best = ''
  let bestN = 0
  // 뒤(최근)부터 세어 같은 횟수면 최근 이름이 이긴다
  for (let i = names.length - 1; i >= 0; i--) {
    const n = names[i]
    const c = (count.get(n) ?? 0) + 1
    count.set(n, c)
    if (c > bestN) { best = n; bestN = c }
  }
  return best
}

function distinct(xs: string[]): string[] {
  return [...new Set(xs)]
}

function byMonth(rows: SpendRow[]): MonthAmount[] {
  const map = new Map<string, MonthAmount>()
  for (const r of rows) {
    const m = map.get(r.month) ?? { month: r.month, total: 0, count: 0 }
    m.total += r.amount
    m.count++
    map.set(r.month, m)
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month))
}

function coverageOf(rows: SpendRow[]): SourceCoverage {
  let from: string | null = null
  let to: string | null = null
  const months = new Set<string>()
  for (const r of rows) {
    months.add(r.month)
    if (from === null || r.date < from) from = r.date
    if (to === null || r.date > to) to = r.date
  }
  return { months: [...months].sort(), count: rows.length, from, to }
}

// ---------------- 정기지출 ----------------

/**
 * 한 묶음(같은 곳으로 나간 돈)이 정기지출인가. 아니면 null.
 * - 서로 다른 달 3번 이상(자료가 3개월 이하로 짧으면 연속 2개월)
 * - 그리고 달마다 금액이 고르거나(변동계수 ≤ 0.25), 한 달에 한 번꼴로 비슷한 날(±3일) 나간다
 * - 석 달마다처럼 띄엄띄엄이면 그 간격이 일정해야 한다(간격 ±1달)
 * latestMonth = 그 출처 자료의 마지막 달(대개 덜 찬 달). 주면 그 달을 뺀 흔들림도 본다.
 */
export function recurringOf(
  rows: SpendRow[],
  coverageMonths: number,
  opts: LeakOptions = DEFAULT_LEAK_OPTIONS,
  latestMonth: string | null = null,
): RecurringItem | null {
  if (!rows.length) return null
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const months = byMonth(sorted)
  const n = months.length
  const short = coverageMonths <= opts.shortCoverageMonths
  const gaps = months.slice(1).map((m, i) => monthDiff(months[i].month, m.month))
  const hasConsecutive = gaps.some(g => g === 1)
  if (!(n >= opts.minMonths || (short && n >= 2 && hasConsecutive))) return null

  const totals = months.map(m => m.total)
  const txPerMonth = sorted.length / n
  // 자료의 마지막 달은 대개 덜 찬 달이다(통장 내역을 달 중간에 받는다). 주유처럼 한 달에 여러 번
  // 나가는 곳은 그 달 합계가 작게 잡혀 흔들림이 커 보이고 평균도 낮아진다. 그래서 그 달을 뺀
  // 나머지(2달 이상)로도 흔들림을 보고, 여러 번 나가는 곳은 평균에서도 뺀다.
  const partialLast = latestMonth !== null && months[n - 1].month === latestMonth && n - 1 >= 2
  const fullTotals = partialLast ? totals.slice(0, -1) : totals
  const cvAll = coefficientOfVariation(totals)
  const cvFull = coefficientOfVariation(fullTotals)
  const cv = Math.min(cvAll, cvFull)
  const stable = cv <= opts.maxCv

  // 달마다 첫 결제일
  const firstDays = months.map(m => Number(sorted.find(r => r.month === m.month)!.date.slice(8, 10)))
  const medDay = Math.round(median(firstDays))
  const sameDay = txPerMonth <= opts.maxTxPerMonthForDay
    && firstDays.every(d => dayDistance(d, medDay) <= opts.dayTolerance)
  if (!stable && !sameDay) return null

  // 간격: 대부분 1이면 매달. 석 달마다 같은 것은 간격이 고르게 3이어야 한다.
  const cadence = gaps.length ? Math.max(1, Math.min(12, Math.floor(median(gaps)))) : 1
  if (cadence >= 2 && gaps.some(g => Math.abs(g - cadence) > 1)) return null

  // 한 달에 한 번꼴(구독)은 마지막 달에도 한 번 다 나갔으므로 전부로 평균, 여러 번 나가는 곳은 덜 찬 달을 뺀다
  const perPayment = mean(txPerMonth > opts.maxTxPerMonthForDay ? fullTotals : totals)
  const monthlyAvg = perPayment / cadence
  return {
    key: sorted[0].key,
    source: sorted[0].source,
    label: mostCommon(sorted.map(r => r.name)),
    via: distinct(sorted.map(r => r.via)),
    months,
    monthsSeen: n,
    cadence,
    perPayment: Math.round(perPayment),
    monthlyAvg: Math.round(monthlyAvg),
    yearly: Math.round(monthlyAvg * 12),
    lastAmount: totals[totals.length - 1],
    firstSeen: sorted[0].date,
    lastSeen: sorted[sorted.length - 1].date,
    txCount: sorted.length,
    cv,
    typicalDay: txPerMonth <= opts.maxTxPerMonthForDay ? medDay : null,
    reason: stable && sameDay ? 'both' : stable ? 'stable' : 'sameDay',
  }
}

/**
 * 끊긴 정기지출인가: 자료의 마지막 달 기준으로 (간격 + 1)달 넘게 안 나왔다.
 * 매달 나가던 것이면 최근 두 달(마지막 달·그 전달) 모두 없을 때. 마지막 달이 이번 달처럼
 * 덜 찬 달이어도, 전달에 나갔으면 끊긴 것으로 보지 않는다.
 */
export function isStopped(item: RecurringItem, latestMonth: string | null): boolean {
  if (!latestMonth) return false
  return monthDiff(item.lastSeen.slice(0, 7), latestMonth) >= item.cadence + 1
}

/**
 * 금액이 오른 정기결제: 마지막 달 금액이 그 전 달들의 중앙값보다 5% 넘게 많다.
 * 구독처럼 한 달에 한 번꼴로 나가는 것만 본다 — 주유처럼 여러 번 나가는 곳은 달마다 합계가 원래 흔들린다.
 */
export function priceIncreaseOf(item: RecurringItem, opts: LeakOptions = DEFAULT_LEAK_OPTIONS): PriceIncrease | null {
  if (item.months.length < 2) return null
  if (item.txCount / item.months.length > opts.maxTxPerMonthForDay) return null
  const latest = item.months[item.months.length - 1].total
  const before = median(item.months.slice(0, -1).map(m => m.total))
  if (before <= 0 || latest <= before * (1 + opts.priceIncreaseRatio)) return null
  return {
    item,
    before,
    latest,
    ratio: latest / before - 1,
    yearlyExtra: Math.round(((latest - before) * 12) / item.cadence),
  }
}

// ---------------- 본체 ----------------

export interface LeakPeriod {
  /** 'YYYY-MM-DD' 포함. null이면 처음부터 */
  from: string | null
  /** 'YYYY-MM-DD' 포함. null이면 끝까지 */
  to: string | null
}

export function detectLeaks(
  bank: BankOutInput[],
  card: CardInput[],
  period: LeakPeriod = { from: null, to: null },
  options: Partial<LeakOptions> = {},
): LeakReport {
  const opts = { ...DEFAULT_LEAK_OPTIONS, ...options }
  const all = toSpendRows(bank, card).filter(r =>
    /^\d{4}-\d{2}-\d{2}$/.test(r.date)
    && (period.from === null || r.date >= period.from)
    && (period.to === null || r.date <= period.to))

  const coverage: Record<SpendSource, SourceCoverage> = {
    bank: coverageOf(all.filter(r => r.source === 'bank')),
    card: coverageOf(all.filter(r => r.source === 'card')),
  }

  // 1) 정기지출 — 일반 지출만(수수료·카드대금은 따로 본다), 이름이 있는 것만 묶는다
  const groups = new Map<string, SpendRow[]>()
  for (const r of all) {
    if (r.kind !== 'normal' || !r.key) continue
    const g = groups.get(r.key)
    if (g) g.push(r)
    else groups.set(r.key, [r])
  }
  const recurring: RecurringItem[] = []
  const stopped: RecurringItem[] = []
  for (const g of groups.values()) {
    const cov = coverage[g[0].source]
    const latestMonth = cov.months.length ? cov.months[cov.months.length - 1] : null
    const item = recurringOf(g, cov.months.length, opts, latestMonth)
    if (!item) continue
    if (isStopped(item, latestMonth)) stopped.push(item)
    else recurring.push(item)
  }
  recurring.sort((a, b) => b.monthlyAvg - a.monthlyAvg || a.label.localeCompare(b.label))
  stopped.sort((a, b) => b.monthlyAvg - a.monthlyAvg || a.label.localeCompare(b.label))

  // 2) 금액 오른 정기결제 — 지금도 나가는 것만
  const priceIncreases = recurring
    .map(item => priceIncreaseOf(item, opts))
    .filter((p): p is PriceIncrease => p !== null)
    .sort((a, b) => b.yearlyExtra - a.yearlyExtra)

  // 3) 중복 의심 — 같은 출처·같은 날·같은 곳·같은 금액이 두 번 이상
  const dupMap = new Map<string, SpendRow[]>()
  for (const r of all) {
    if (r.kind === 'fee' || r.amount < opts.duplicateMinAmount) continue
    const k = `${r.source}|${r.date}|${r.norm || r.name}|${r.amount}`
    const g = dupMap.get(k)
    if (g) g.push(r)
    else dupMap.set(k, [r])
  }
  const duplicates: DuplicateGroup[] = []
  for (const g of dupMap.values()) {
    if (g.length < 2) continue
    duplicates.push({
      source: g[0].source,
      key: g[0].key,
      date: g[0].date,
      label: mostCommon(g.map(r => r.name)) || '(이름 없음)',
      amount: g[0].amount,
      count: g.length,
      extra: g[0].amount * (g.length - 1),
      via: distinct(g.map(r => r.via)),
    })
  }
  duplicates.sort((a, b) => b.extra - a.extra || b.date.localeCompare(a.date))

  // 4) 수수료 — 통장 줄 중 '수수료'가 들어간 것. 달 평균은 통장 자료가 있는 달 수로 나눈다
  const feeRows = all.filter(r => r.kind === 'fee')
  const feeTotal = feeRows.reduce((s, r) => s + r.amount, 0)
  const feeMonthly = feeTotal / Math.max(coverage.bank.months.length, 1)
  const feeNames = new Map<string, { names: string[]; total: number; count: number }>()
  for (const r of feeRows) {
    const k = r.norm || r.name
    const f = feeNames.get(k) ?? { names: [], total: 0, count: 0 }
    f.names.push(r.name)
    f.total += r.amount
    f.count++
    feeNames.set(k, f)
  }
  const fees: FeeSummary = {
    total: feeTotal,
    count: feeRows.length,
    months: byMonth(feeRows),
    monthlyAvg: Math.round(feeMonthly),
    yearly: Math.round(feeMonthly * 12),
    byName: [...feeNames.values()]
      .map(f => ({ label: mostCommon(f.names) || '수수료', total: f.total, count: f.count }))
      .sort((a, b) => b.total - a.total),
  }

  // 5) 큰 일회성 지출 — 정기(끊긴 것 포함)로 묶이지 않은 일반 지출 중 금액 순 상위 N건 + 기준 금액 이상 전부
  const recurringKeys = new Set([...recurring, ...stopped].map(i => i.key))
  const oneOffs = all
    .filter(r => r.kind === 'normal' && !(r.key && recurringKeys.has(r.key)))
    .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
    .filter((r, i) => i < opts.oneOffTopN || r.amount >= opts.oneOffMinAmount)

  // 6) 카드대금 — 카드 내역 한 달 합계(전체·카드별)와 ±1% 안이면 그 달 것으로 표시
  const cardTotals: { month: string; card: string | null; total: number }[] = []
  const cardRows = all.filter(r => r.source === 'card')
  for (const m of byMonth(cardRows)) cardTotals.push({ month: m.month, card: null, total: m.total })
  for (const name of distinct(cardRows.map(r => r.via))) {
    for (const m of byMonth(cardRows.filter(r => r.via === name))) cardTotals.push({ month: m.month, card: name, total: m.total })
  }
  const billRows: CardBillRow[] = all
    .filter(r => r.kind === 'cardBill')
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(r => {
      const hit = cardTotals.find(t => t.total > 0 && Math.abs(r.amount - t.total) <= t.total * opts.cardBillTolerance)
      return { ...r, matchedMonth: hit?.month ?? null, matchedCard: hit?.card ?? null }
    })

  return {
    coverage,
    recurring,
    stopped,
    priceIncreases,
    duplicates,
    fees,
    oneOffs,
    cardBills: { rows: billRows, total: billRows.reduce((s, r) => s + r.amount, 0) },
  }
}

// ---------------- 검토 결과 합치기 ----------------

export interface ReviewLike {
  item_key: string
  label: string | null
  decision: SpendDecision
  monthly_amount: number | string | null
  note: string | null
}

export interface FixedItem {
  key: string
  label: string
  source: SpendSource | null
  monthly: number
  note: string | null
  /** 이번 기간 내역에서 다시 찾았는가(아니면 결정할 때 적어 둔 금액) */
  detected: boolean
}

export interface ReviewSummary {
  /** 지금 매달 나가는 정기지출 합계(해지함 표시한 것은 뺀다) */
  monthlyTotal: number
  yearlyTotal: number
  /** 해지(할 것 + 한 것) 1년 금액 */
  cancelYearly: number
  /** 줄이기 대상 1년 금액(전액 기준 — 얼마나 줄일지는 모른다) */
  reduceYearly: number
  savingsYearly: number
  /** 검토 전(아무것도 안 고른) 정기지출 수 */
  remaining: number
  /** 「필요」로 남긴 것 = 고정지출 목록 */
  fixed: FixedItem[]
  fixedMonthly: number
}

export function sourceOfKey(key: string): SpendSource | null {
  const s = key.split(':', 1)[0]
  return s === 'bank' || s === 'card' ? s : null
}

/**
 * 화면 위 요약 카드와 「고정지출 목록」.
 * 금액은 이번 기간 내역에서 다시 찾은 월 환산을 먼저 쓰고, 못 찾으면(기간을 줄였거나 이미 끊김)
 * 결정할 때 적어 둔 monthly_amount를 쓴다.
 */
export function summarizeReviews(report: LeakReport, reviews: ReviewLike[]): ReviewSummary {
  const byKey = new Map(reviews.map(r => [r.item_key, r]))
  const detected = new Map([...report.recurring, ...report.stopped].map(i => [i.key, i]))
  const decisionOf = (key: string): SpendDecision => byKey.get(key)?.decision ?? 'unknown'
  const monthlyOf = (r: ReviewLike): number => detected.get(r.item_key)?.monthlyAvg ?? Math.round(toNumber(r.monthly_amount))

  const monthlyTotal = report.recurring
    .filter(i => decisionOf(i.key) !== 'cancelled')
    .reduce((s, i) => s + i.monthlyAvg, 0)
  const remaining = report.recurring.filter(i => decisionOf(i.key) === 'unknown').length

  let cancelMonthly = 0
  let reduceMonthly = 0
  const fixed: FixedItem[] = []
  for (const r of reviews) {
    if (r.decision === 'cancel' || r.decision === 'cancelled') cancelMonthly += monthlyOf(r)
    else if (r.decision === 'reduce') reduceMonthly += monthlyOf(r)
    else if (r.decision === 'keep') {
      const item = detected.get(r.item_key)
      fixed.push({
        key: r.item_key,
        label: item?.label ?? r.label ?? r.item_key,
        source: item?.source ?? sourceOfKey(r.item_key),
        monthly: monthlyOf(r),
        note: r.note,
        detected: !!item,
      })
    }
  }
  fixed.sort((a, b) => b.monthly - a.monthly || a.label.localeCompare(b.label))
  return {
    monthlyTotal,
    yearlyTotal: monthlyTotal * 12,
    cancelYearly: cancelMonthly * 12,
    reduceYearly: reduceMonthly * 12,
    savingsYearly: (cancelMonthly + reduceMonthly) * 12,
    remaining,
    fixed,
    fixedMonthly: fixed.reduce((s, f) => s + f.monthly, 0),
  }
}
