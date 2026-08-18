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
export function shortDateTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
