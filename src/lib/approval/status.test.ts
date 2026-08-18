import { describe, it, expect } from 'vitest'
import {
  currentTurnLine, canSubmit, canWithdraw, canDelete, canEdit,
  canApprove, canCancel, isFinalApprover, validateApprovalLine,
  canResumeCompletion,
} from './status'
import type { ExpenseReport, ExpenseReportLine } from '@/types/approval'

const DRAFTER = 'staff-kim'
const A = 'staff-choi'
const B = 'staff-cho'

function report(over: Partial<ExpenseReport> = {}): ExpenseReport {
  return {
    id: 'r1', doc_no: null, title: '테스트', status: 'pending',
    drafter_staff_id: DRAFTER, submitted_at: null, completed_at: null,
    total_amount: 0, category: null, body_html: null, retention_years: 5,
    created_at: '', updated_at: '', site_id: null, project_id: null, ...over,
  }
}

function line(seq: number, staff_id: string, over: Partial<ExpenseReportLine> = {}): ExpenseReportLine {
  return {
    id: `l${seq}`, report_id: 'r1', seq, staff_id,
    role: 'approval', state: 'waiting', acted_at: null, comment: null, ...over,
  }
}

describe('currentTurnLine', () => {
  it('대기 중인 행 가운데 seq가 가장 작은 행을 고른다', () => {
    const lines = [line(2, B), line(1, A, { state: 'approved' }), line(3, B)]
    expect(currentTurnLine(lines)?.seq).toBe(2)
  })

  it('전부 처리됐으면 null', () => {
    expect(currentTurnLine([line(1, A, { state: 'approved' })])).toBeNull()
  })
})

describe('canApprove', () => {
  const lines = [line(1, A), line(2, B)]

  it('현재 차례인 사람은 승인할 수 있다', () => {
    expect(canApprove(report(), lines, A)).toBe(true)
  })

  it('차례가 아닌 사람은 승인할 수 없다', () => {
    expect(canApprove(report(), lines, B)).toBe(false)
  })

  it('진행중이 아니면 아무도 승인할 수 없다', () => {
    expect(canApprove(report({ status: 'approved' }), lines, A)).toBe(false)
  })

  it('결재선에 없는 사람은 승인할 수 없다', () => {
    expect(canApprove(report(), lines, 'staff-outsider')).toBe(false)
  })
})

describe('isFinalApprover', () => {
  it('seq가 가장 큰 사람이 최종 결재자다', () => {
    const lines = [line(1, A), line(2, B)]
    expect(isFinalApprover(lines, B)).toBe(true)
    expect(isFinalApprover(lines, A)).toBe(false)
  })
})

describe('canWithdraw', () => {
  it('회수는 어떤 상태에서도 할 수 없다', () => {
    expect(canWithdraw(report(), [line(1, A)], DRAFTER)).toBe(false)
    expect(canWithdraw(report({ status: 'draft' }), [line(1, A)], DRAFTER)).toBe(false)
    expect(canWithdraw(report(), [line(1, A)], A)).toBe(false)
  })
})

describe('canDelete', () => {
  it('작성중·상신·회수된·반려된은 기안자가 삭제할 수 있다', () => {
    expect(canDelete(report({ status: 'draft' }), DRAFTER)).toBe(true)
    expect(canDelete(report({ status: 'pending' }), DRAFTER)).toBe(true)
    expect(canDelete(report({ status: 'withdrawn' }), DRAFTER)).toBe(true)
    expect(canDelete(report({ status: 'rejected' }), DRAFTER)).toBe(true)
  })

  it('완료는 삭제할 수 없다', () => {
    expect(canDelete(report({ status: 'approved' }), DRAFTER)).toBe(false)
  })

  it('기안자가 아니면 삭제할 수 없다', () => {
    expect(canDelete(report({ status: 'pending' }), A)).toBe(false)
  })
})

describe('canEdit', () => {
  it('작성중·상신·회수된·반려된은 기안자가 수정할 수 있다', () => {
    expect(canEdit(report({ status: 'draft' }), DRAFTER)).toBe(true)
    expect(canEdit(report({ status: 'pending' }), DRAFTER)).toBe(true)
    expect(canEdit(report({ status: 'withdrawn' }), DRAFTER)).toBe(true)
    expect(canEdit(report({ status: 'rejected' }), DRAFTER)).toBe(true)
  })

  it('완료는 수정할 수 없다', () => {
    expect(canEdit(report({ status: 'approved' }), DRAFTER)).toBe(false)
  })
})

describe('canSubmit', () => {
  it('기안자가 작성중·회수된·반려된 문서를 상신한다', () => {
    expect(canSubmit(report({ status: 'draft' }), DRAFTER)).toBe(true)
    expect(canSubmit(report({ status: 'rejected' }), DRAFTER)).toBe(true)
  })

  it('이미 진행중이면 다시 상신할 수 없다', () => {
    expect(canSubmit(report({ status: 'pending' }), DRAFTER)).toBe(false)
  })
})

describe('canCancel', () => {
  it('내가 승인했고 뒷사람이 아직이면 취소할 수 있다', () => {
    const lines = [line(1, A, { state: 'approved' }), line(2, B)]
    expect(canCancel(report(), lines, A)).toBe(true)
  })

  it('뒷사람이 이미 처리했으면 취소할 수 없다', () => {
    const lines = [line(1, A, { state: 'approved' }), line(2, B, { state: 'approved' })]
    expect(canCancel(report(), lines, A)).toBe(false)
  })

  it('문서가 완료됐으면 취소할 수 없다', () => {
    const lines = [line(1, A, { state: 'approved' })]
    expect(canCancel(report({ status: 'approved' }), lines, A)).toBe(false)
  })
})

describe('canResumeCompletion', () => {
  it('결재선이 전부 승인됐고 문서가 pending이면 최종 결재자는 재개할 수 있다', () => {
    const lines = [line(1, A, { state: 'approved' }), line(2, B, { state: 'approved' })]
    expect(canResumeCompletion(report(), lines, B)).toBe(true)
  })

  it('아직 대기 중인 행이 있으면 재개할 수 없다', () => {
    const lines = [line(1, A, { state: 'approved' }), line(2, B)]
    expect(canResumeCompletion(report(), lines, B)).toBe(false)
  })

  it('문서가 이미 approved면 재개할 수 없다', () => {
    const lines = [line(1, A, { state: 'approved' }), line(2, B, { state: 'approved' })]
    expect(canResumeCompletion(report({ status: 'approved' }), lines, B)).toBe(false)
  })

  it('최종 결재자가 아닌 사람은 재개할 수 없다', () => {
    const lines = [line(1, A, { state: 'approved' }), line(2, B, { state: 'approved' })]
    expect(canResumeCompletion(report(), lines, A)).toBe(false)
  })

  it('결재선에 반려된 행이 있고 문서가 pending이면 최종 결재자도 재개할 수 없다', () => {
    // 반려 처리는 됐지만(rejected) 뒤이은 문서 상태 갱신이 끊겨 pending으로 남은 상황을 흉내낸다.
    // 이때 승인 재개가 열리면 반려된 문서가 승인으로 뒤집혀 지출이 생성된다.
    const lines = [line(1, A, { state: 'approved' }), line(2, B, { state: 'rejected' })]
    expect(canResumeCompletion(report(), lines, B)).toBe(false)
  })
})

describe('validateApprovalLine', () => {
  it('정상 결재선은 null을 돌려준다', () => {
    expect(validateApprovalLine([line(1, A, { role: 'cooperation' }), line(2, B)], DRAFTER)).toBeNull()
  })

  it('빈 결재선은 막는다', () => {
    expect(validateApprovalLine([], DRAFTER)).toBe('결재선을 설정해 주세요.')
  })

  it('기안자 본인은 결재선에 넣을 수 없다', () => {
    expect(validateApprovalLine([line(1, DRAFTER)], DRAFTER)).toBe('기안자는 본인을 결재자로 지정할 수 없습니다.')
  })

  it('마지막이 협조자면 막는다', () => {
    expect(validateApprovalLine([line(1, A), line(2, B, { role: 'cooperation' })], DRAFTER))
      .toBe('마지막은 결재 역할이어야 합니다.')
  })

  it('같은 사람을 두 번 넣을 수 없다', () => {
    expect(validateApprovalLine([line(1, A), line(2, A)], DRAFTER))
      .toBe('같은 사람을 두 번 지정할 수 없습니다.')
  })
})
