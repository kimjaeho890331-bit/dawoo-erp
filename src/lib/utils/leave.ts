// 근로기준법 기반 연차 계산
// 1년 미만: 월 1일 (최대 11일)
// 1년 이상: 15일
// 3년 이상: 매 2년마다 +1일 (최대 25일)
export function calcTotalLeave(joinDate: string | null): number {
  if (!joinDate) return 15
  const join = new Date(joinDate)
  const now = new Date()
  const years = (now.getTime() - join.getTime()) / (365.25 * 86400000)
  if (years < 1) return Math.min(Math.floor(years * 12), 11)
  if (years < 3) return 15
  const extra = Math.floor((years - 1) / 2)
  return Math.min(15 + extra, 25)
}
