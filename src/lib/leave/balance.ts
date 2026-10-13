// 연차 잔여 계산 (입사일 기준, 해별 구간 + 이월/만료/소멸)
// 설계: 1년 미만 월 1일(최대11) / 1년↑ 15 / 3년↑ 매2년 +1(최대25)
//       직전 구간 잔여는 다음 구간으로 이월, 이월은 구간시작+N개월 후 소멸 대상(수동)
// 날짜는 TZ 영향 없게 UTC 기준으로 계산한다.

export interface LeaveUsageRow {
  start_date: string
  days: number
  status: string
}

export interface ForfeitRow {
  period_start: string // 소멸된 이월이 속한 구간의 시작일(YYYY-MM-DD)
  days: number
}

export type CarryStatus = 'none' | 'valid' | 'pending' | 'forfeited'

export interface LeaveBalance {
  periodIndex: number
  isAccruing: boolean
  periodStart: string
  periodEnd: string
  grant: number
  used: number
  carryIn: number
  carryExpiry: string | null
  carryStatus: CarryStatus
  carryRemaining: number
  forfeited: number
  grantRemaining: number
  usable: number
  pendingForfeit: number
}

export interface ComputeLeaveParams {
  joinDate: string
  approved: LeaveUsageRow[]
  carryoverMonths: number
  forfeits?: ForfeitRow[]
  today?: Date
}

// --- UTC 날짜 유틸 (ms 타임스탬프로 다룬다) ---
const pad = (n: number) => String(n).padStart(2, '0')
function parseUTC(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
function toUTCday(t: Date): number {
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}
function addYearsUTC(ms: number, n: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate())
}
function addMonthsUTC(ms: number, n: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate())
}
function fmtUTC(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
function fullYears(join: number, today: number): number {
  let k = 0
  while (addYearsUTC(join, k + 1) <= today) k++
  return k
}
function fullMonths(join: number, today: number): number {
  let m = 0
  while (addMonthsUTC(join, m + 1) <= today) m++
  return m
}
// 해당 연차 구간(k≥1)의 법정 부여일수: 1~2년차 15, 3년차부터 매 2년 +1 (최대 25)
function grantForPeriod(k: number): number {
  return Math.min(15 + Math.floor((k - 1) / 2), 25)
}

// 사용 합계: 승인된 연차 중 [from, to) 구간에 시작한 것
function usedInRange(approved: LeaveUsageRow[], from: number, to: number): number {
  return approved
    .filter(r => r.status === '승인')
    .filter(r => { const s = parseUTC(r.start_date); return s >= from && s < to })
    .reduce((sum, r) => sum + (r.days || 0), 0)
}

export function computeLeaveBalance(params: ComputeLeaveParams): LeaveBalance {
  const join = parseUTC(params.joinDate)
  const today = toUTCday(params.today ?? new Date())
  const k = fullYears(join, today)
  const periodStart = addYearsUTC(join, k)
  const periodEnd = addYearsUTC(join, k + 1)

  // 1년 미만: 월 1일 적립(최대 11), 이월 없음
  if (k === 0) {
    const grant = Math.min(fullMonths(join, today), 11)
    const used = usedInRange(params.approved, periodStart, periodEnd)
    const grantRemaining = Math.max(0, grant - used)
    return {
      periodIndex: 0,
      isAccruing: true,
      periodStart: fmtUTC(periodStart),
      periodEnd: fmtUTC(periodEnd),
      grant,
      used,
      carryIn: 0,
      carryExpiry: null,
      carryStatus: 'none',
      carryRemaining: 0,
      forfeited: 0,
      grantRemaining,
      usable: grantRemaining,
      pendingForfeit: 0,
    }
  }

  // 1년 이상: 당해 부여 + 직전 구간에서 넘어온 이월
  const grant = grantForPeriod(k)

  // 이월 체인: 각 구간에 들어온 이월은 N개월 뒤 소멸하므로 '다음 구간으로' 넘기지 않는다.
  // 다음 구간으로 넘어가는 건 그 구간 '당해 부여'의 미사용분뿐 → 이월이 해마다 쌓이지 않는다.
  let carryOut = 0
  for (let p = 0; p < k; p++) {
    const pStart = addYearsUTC(join, p)
    const pEnd = addYearsUTC(join, p + 1)
    const pBase = p === 0 ? 11 : grantForPeriod(p)
    const pExpiry = addMonthsUTC(pStart, params.carryoverMonths)
    const pUsed = usedInRange(params.approved, pStart, pEnd)
    const pUsedBeforeExpiry = usedInRange(params.approved, pStart, pExpiry)
    const pCarryConsumed = Math.min(carryOut, pUsedBeforeExpiry) // 들어온 이월 중 만료 전 사용분
    const pGrantConsumed = pUsed - pCarryConsumed
    carryOut = Math.max(0, pBase - pGrantConsumed) // 당해 부여 미사용분만 다음 구간으로
  }
  const carryIn = carryOut
  const carryExpiry = carryIn > 0 ? addMonthsUTC(periodStart, params.carryoverMonths) : null

  const used = usedInRange(params.approved, periodStart, periodEnd)
  // 선입선출: 당해 사용 중 '만료 전'에 쓴 것만 이월에서 차감, 나머지는 당해 부여에서 뺀다
  const usedBeforeExpiry = carryExpiry !== null
    ? usedInRange(params.approved, periodStart, carryExpiry)
    : used
  const carryConsumed = Math.min(carryIn, usedBeforeExpiry)
  const grantConsumed = used - carryConsumed
  const grantRemaining = grant - grantConsumed

  // 이 구간 이월에 대한 소멸 기록(관리자/경리가 처리)
  const periodStartStr = fmtUTC(periodStart)
  const forfeited = (params.forfeits ?? [])
    .filter(f => f.period_start === periodStartStr)
    .reduce((s, f) => s + (f.days || 0), 0)
  const carryRemaining = Math.max(0, carryIn - carryConsumed - forfeited)

  const expired = carryExpiry !== null && today >= carryExpiry
  const carryStatus: CarryStatus =
    carryIn === 0 ? 'none' : forfeited > 0 ? 'forfeited' : expired ? 'pending' : 'valid'
  const usable = grantRemaining + (carryStatus === 'valid' ? carryRemaining : 0)
  const pendingForfeit = carryStatus === 'pending' ? carryRemaining : 0

  return {
    periodIndex: k,
    isAccruing: false,
    periodStart: fmtUTC(periodStart),
    periodEnd: fmtUTC(periodEnd),
    grant,
    used,
    carryIn,
    carryExpiry: carryExpiry !== null ? fmtUTC(carryExpiry) : null,
    carryStatus,
    carryRemaining,
    forfeited,
    grantRemaining,
    usable,
    pendingForfeit,
  }
}
