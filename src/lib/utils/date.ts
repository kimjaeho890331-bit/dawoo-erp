// 한국(KST, UTC+9) 기준 날짜 유틸
// 브라우저/서버 타임존과 무관하게 항상 KST 자정(오전 12:00)을 하루 경계로 사용한다.
// toISOString()은 UTC 기준이라 KST 00:00~09:00 사이에는 전날로 밀리는 문제가 있어 보정.

const KST_OFFSET = 9 * 60 * 60 * 1000

// 현재 시각의 KST 벽시계를 UTC 필드에 담은 Date (반드시 getUTC*로 읽을 것)
function kstNow(): Date {
  return new Date(Date.now() + KST_OFFSET)
}

// KST 기준 오늘 날짜 'YYYY-MM-DD'
export function todayKST(): string {
  return kstNow().toISOString().slice(0, 10)
}

// KST 기준 오늘이 속한 { year, month } (month는 0-based)
export function todayMonthKST(): { year: number; month: number } {
  const k = kstNow()
  return { year: k.getUTCFullYear(), month: k.getUTCMonth() }
}

// KST 기준 오늘의 요일 (0=일 ~ 6=토)
export function todayDowKST(): number {
  return kstNow().getUTCDay()
}

// 다음 KST 자정까지 남은 밀리초 (자정 직후 1초 여유 포함)
export function msUntilNextMidnightKST(): number {
  const k = kstNow()
  const elapsed =
    k.getUTCHours() * 3600000 + k.getUTCMinutes() * 60000 + k.getUTCSeconds() * 1000 + k.getUTCMilliseconds()
  return 86400000 - elapsed + 1000
}
