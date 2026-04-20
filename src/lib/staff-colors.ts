/**
 * 직원 색상 시스템 — 단일 진실 원천
 *
 * 규칙:
 * - staff.color (hex #rrggbb) 가 저장되어 있으면 그 값 사용
 * - 미저장 시 id 해시 → FALLBACK_PALETTE 매핑
 * - 프리셋 선택지는 STAFF_COLOR_PALETTE (48색, 색조별 정렬)
 * - 자유 선택은 <input type="color"> 또는 hex 직접 입력
 */

/** 프리셋 팔레트 — 48색, 8줄 × 6열, 색조별 정렬 */
export const STAFF_COLOR_PALETTE: string[] = [
  // 1행: 빨강~핑크
  '#EF4444', '#F43F5E', '#EC4899', '#D946EF', '#DC2626', '#BE185D',
  // 2행: 주황~노랑
  '#F97316', '#FB923C', '#F59E0B', '#EAB308', '#CA8A04', '#92400E',
  // 3행: 라임~초록
  '#84CC16', '#22C55E', '#10B981', '#14B8A6', '#15803D', '#166534',
  // 4행: 청록~파랑
  '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#1D4ED8', '#1E3A8A',
  // 5행: 보라
  '#8B5CF6', '#A855F7', '#7C3AED', '#9333EA', '#5E6AD2', '#4C1D95',
  // 6행: 중성 (회색/갈색)
  '#78716C', '#737373', '#64748B', '#475569', '#374151', '#1F2937',
  // 7행: 파스텔 (연한 톤)
  '#FCA5A5', '#FDBA74', '#FDE68A', '#A7F3D0', '#93C5FD', '#C4B5FD',
  // 8행: 딥 톤
  '#881337', '#7C2D12', '#713F12', '#064E3B', '#134E4A', '#1E1B4B',
]

/** 색상 미지정 직원에게 자동 부여할 fallback 팔레트 (구분력 높은 12색) */
const FALLBACK_PALETTE: string[] = [
  '#3B82F6', '#EC4899', '#10B981', '#F59E0B',
  '#8B5CF6', '#06B6D4', '#EF4444', '#F97316',
  '#6366F1', '#22C55E', '#A855F7', '#14B8A6',
]

/** 문자열 → 안정 해시 (id 기반 일관된 색상 보장) */
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * 직원의 표시 색상을 결정.
 * 1순위: DB에 저장된 staff.color
 * 2순위: id 해시로 FALLBACK_PALETTE 매핑 (같은 id는 항상 같은 색상)
 */
export function resolveStaffColor(staff: { id: string; color?: string | null } | null | undefined): string {
  if (!staff) return '#94a3b8'
  if (staff.color && /^#[0-9a-fA-F]{6}$/.test(staff.color)) return staff.color
  const idx = hashString(staff.id) % FALLBACK_PALETTE.length
  return FALLBACK_PALETTE[idx]
}

/** 직원 리스트 → { [id]: color } 맵. 캘린더 등에서 사용. */
export function buildStaffColorMap(
  staffList: Array<{ id: string; color?: string | null }>
): Record<string, string> {
  const m: Record<string, string> = {}
  staffList.forEach(s => { m[s.id] = resolveStaffColor(s) })
  return m
}

/** hex 유효성 검사 (#rrggbb 또는 #rgb) */
export function isValidHex(v: string): boolean {
  return /^#([0-9a-fA-F]{3}){1,2}$/.test(v)
}

/** #rgb → #rrggbb 정규화 */
export function normalizeHex(v: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const [, r, g, b] = v.match(/^#(.)(.)(.)$/)!
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return v.toLowerCase()
}
