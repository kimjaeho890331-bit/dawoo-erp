import { describe, it, expect } from 'vitest'
import { laborApprovalDraft, type LaborPayLine } from './approvalDraft'
import { suggestedLaborCategory, validateLaborApproval } from '@/lib/expenseCategory'

const line = (o: Partial<LaborPayLine> = {}): LaborPayLine => ({
  worker_name: '박일용', netPay: 1_620_000, bank_name: '국민', account_number: '123-45',
  payment_date: '2026-10-31', detail: '박일용: 9일 × 180,000원', ...o,
})

describe('laborApprovalDraft', () => {
  it('근무자 한 명이 지급정보 한 줄이 된다', () => {
    const r = laborApprovalDraft({ year: 2026, month: 10, today: '2026-10-09', lines: [line(), line({ worker_name: '최일용', payment_date: null, bank_name: null })] })
    if (!r.ok) throw new Error(r.error)
    expect(r.draft.title).toBe('2026년 10월 일용직 노무비 (박일용 외 1명)')
    expect(r.draft.payments).toEqual([
      { vendor_name: '박일용', amount: 1_620_000, pay_request_date: '2026-10-31', bank: '국민', account_no: '123-45', business_no: '' },
      { vendor_name: '최일용', amount: 1_620_000, pay_request_date: '2026-10-09', bank: '', account_no: '123-45', business_no: '' },
    ])
    expect(r.draft.body_html).toContain('박일용: 9일')
  })

  it('제목이 50자를 넘으면 인원수만 적는다', () => {
    const r = laborApprovalDraft({ year: 2026, month: 10, today: '2026-10-09', lines: [line({ worker_name: '아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주긴이름' })] })
    if (!r.ok) throw new Error(r.error)
    expect(r.draft.title).toBe('2026년 10월 일용직 노무비 (1명)')
    expect(r.draft.title.length).toBeLessThanOrEqual(50)
  })

  it('만든 결의서는 노무비로 분류되고, 현장을 이으면 결재 검사를 통과한다', () => {
    const r = laborApprovalDraft({ year: 2026, month: 10, today: '2026-10-09', lines: [line()] })
    if (!r.ok) throw new Error(r.error)
    expect(suggestedLaborCategory(r.draft.title)).toBeTruthy()
    expect(validateLaborApproval({ title: r.draft.title, site_id: 'site1', project_id: null, payments: r.draft.payments, mode: 'submit' })).toBeNull()
  })

  it('체크한 사람이 없거나, 이름·실지급액이 비면 만들지 않는다', () => {
    expect(laborApprovalDraft({ year: 2026, month: 10, today: 'x', lines: [] }).ok).toBe(false)
    expect(laborApprovalDraft({ year: 2026, month: 10, today: 'x', lines: [line({ worker_name: ' ' })] }).ok).toBe(false)
    expect(laborApprovalDraft({ year: 2026, month: 10, today: 'x', lines: [line({ netPay: 0 })] }).ok).toBe(false)
  })
})
