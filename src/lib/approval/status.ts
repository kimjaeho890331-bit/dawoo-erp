import type { ExpenseReport, ExpenseReportLine } from '@/types/approval'

type LineLike = Pick<ExpenseReportLine, 'seq' | 'staff_id' | 'role' | 'state'>
type ReportLike = Pick<ExpenseReport, 'status' | 'drafter_staff_id'>

const EDITABLE: ExpenseReport['status'][] = ['draft', 'withdrawn', 'rejected']

/** 지금 결재할 차례인 행. 대기 중인 행 가운데 seq가 가장 작은 것. */
export function currentTurnLine<T extends LineLike>(lines: T[]): T | null {
  const waiting = lines.filter(l => l.state === 'waiting').sort((a, b) => a.seq - b.seq)
  return waiting[0] ?? null
}

/** seq가 가장 큰 사람이 최종 결재자다. */
export function isFinalApprover(lines: LineLike[], staffId: string): boolean {
  if (lines.length === 0) return false
  const last = [...lines].sort((a, b) => a.seq - b.seq)[lines.length - 1]
  return last.staff_id === staffId
}

export function canSubmit(report: ReportLike, staffId: string): boolean {
  return report.drafter_staff_id === staffId && EDITABLE.includes(report.status)
}

export function canDelete(report: ReportLike, staffId: string): boolean {
  return report.drafter_staff_id === staffId && EDITABLE.includes(report.status)
}

/** 회수는 아무도 결재를 처리하지 않았을 때만 가능하다. */
export function canWithdraw(report: ReportLike, lines: LineLike[], staffId: string): boolean {
  if (report.status !== 'pending') return false
  if (report.drafter_staff_id !== staffId) return false
  return lines.every(l => l.state === 'waiting')
}

export function canApprove(report: ReportLike, lines: LineLike[], staffId: string): boolean {
  if (report.status !== 'pending') return false
  const turn = currentTurnLine(lines)
  return turn !== null && turn.staff_id === staffId
}

/**
 * 최종 승인 처리가 도중에 끊긴 문서를 같은 결재자가 이어서 완료할 수 있는지.
 * 결재선은 전부 처리됐는데 문서가 아직 pending으로 남은 상태를 뜻한다.
 */
export function canResumeCompletion(report: ReportLike, lines: LineLike[], staffId: string): boolean {
  if (report.status !== 'pending') return false
  if (currentTurnLine(lines) !== null) return false
  if (!lines.every(l => l.state === 'approved')) return false
  return isFinalApprover(lines, staffId)
}

/** 완료된 문서는 이미 지출이 생성돼 취소할 수 없다. */
export function canCancel(report: ReportLike, lines: LineLike[], staffId: string): boolean {
  if (report.status !== 'pending') return false
  const mine = lines.find(l => l.staff_id === staffId && l.state === 'approved')
  if (!mine) return false
  return !lines.some(l => l.seq > mine.seq && l.state !== 'waiting')
}

/** 저장·상신 전 결재선 검증. 문제가 없으면 null. */
export function validateApprovalLine(lines: LineLike[], drafterStaffId: string): string | null {
  if (lines.length === 0) return '결재선을 설정해 주세요.'
  if (lines.some(l => l.staff_id === drafterStaffId)) {
    return '기안자는 본인을 결재자로 지정할 수 없습니다.'
  }
  const ids = lines.map(l => l.staff_id)
  if (new Set(ids).size !== ids.length) return '같은 사람을 두 번 지정할 수 없습니다.'
  const sorted = [...lines].sort((a, b) => a.seq - b.seq)
  if (sorted[sorted.length - 1].role !== 'approval') return '마지막은 결재 역할이어야 합니다.'
  return null
}
