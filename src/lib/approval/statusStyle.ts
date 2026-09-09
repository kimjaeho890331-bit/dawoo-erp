import type { ApprovalStatus } from '@/types/approval'

/**
 * 문서 상태 배지의 색. 모바일 목록은 표가 아니라 카드라서 "상태" 칸의 제목이 없다.
 * 글자만으로는 훑어볼 때 눈에 걸리지 않으므로 색으로 구분한다.
 *
 * 데스크톱 표는 칸 제목이 있어 색 없이도 읽히므로 지금 모양을 그대로 둔다.
 */
export const APPROVAL_STATUS_BADGE: Record<ApprovalStatus, string> = {
  draft: 'bg-surface-secondary text-txt-secondary px-2.5 py-0.5 rounded-full text-[11px] font-medium leading-tight',
  pending: 'bg-caution-bg text-caution-text px-2.5 py-0.5 rounded-full text-[11px] font-medium leading-tight',
  approved: 'bg-status-approved-bg text-status-approved-text px-2.5 py-0.5 rounded-full text-[11px] font-medium leading-tight',
  rejected: 'bg-danger-bg text-danger px-2.5 py-0.5 rounded-full text-[11px] font-medium leading-tight',
  withdrawn: 'bg-status-cancel-bg text-status-cancel-text px-2.5 py-0.5 rounded-full text-[11px] font-medium leading-tight',
}

/** 목록 카드용 짧은 일시. "7/31 14:34" — 폰에서 연도까지 넣으면 한 줄을 넘긴다. */
/**
 * 목록 표의 상신일시. `2026-09-09 15:34` 꼴로 한 줄에 들어간다.
 *
 * toLocaleString('ko-KR')은 `2026. 9. 9. 오후 3:34:56`이라 좁은 칸에서 두 줄로
 * 접히고, 그만큼 옆 칸과의 간격이 벌어져 보인다. 연도는 남긴다 — 문서대장은
 * 해를 넘겨 쌓이므로 월일만으로는 어느 해 건인지 알 수 없다.
 */
export function listDateTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function shortDateTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
