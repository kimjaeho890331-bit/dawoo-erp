// 전화번호 하이픈 자동 포맷
// 010-1234-5678, 02-123-4567, 031-123-4567
export function formatPhone(value: string): string {
  const nums = value.replace(/[^0-9]/g, '')
  if (nums.startsWith('02')) {
    if (nums.length <= 2) return nums
    if (nums.length <= 5) return `${nums.slice(0, 2)}-${nums.slice(2)}`
    if (nums.length <= 9) return `${nums.slice(0, 2)}-${nums.slice(2, 5)}-${nums.slice(5)}`
    return `${nums.slice(0, 2)}-${nums.slice(2, 6)}-${nums.slice(6, 10)}`
  }
  if (nums.length <= 3) return nums
  if (nums.length <= 7) return `${nums.slice(0, 3)}-${nums.slice(3)}`
  if (nums.length <= 11) return `${nums.slice(0, 3)}-${nums.slice(3, 7)}-${nums.slice(7)}`
  return `${nums.slice(0, 3)}-${nums.slice(3, 7)}-${nums.slice(7, 11)}`
}

// 금액 콤마 포맷 (입력용: 숫자만 남기고 콤마 추가)
export function formatMoney(value: string | number): string {
  const nums = String(value).replace(/[^0-9]/g, '')
  if (!nums) return ''
  return Number(nums).toLocaleString()
}

// 콤마 제거 → 숫자 반환
export function parseMoney(value: string): number {
  return Number(value.replace(/[^0-9]/g, '')) || 0
}
