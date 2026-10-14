import { describe, it, expect } from 'vitest'
import { laborApprovalDraft, type LaborPayLine } from './approvalDraft'
import { suggestedLaborCategory, validateLaborApproval } from '@/lib/expenseCategory'

const line = (o: Partial<LaborPayLine> = {}): LaborPayLine => ({
  worker_name: '박일용', netPay: 1_620_000, bank_name: '국민', account_number: '123-45',
  payment_date: '2026-10-31', detail: '박일용: 9일 × 180,000원', ...o,
})
const base = { year: 2026, month: 10, today: '2026-10-09', workTargetName: '상암오수펌프장' }

describe('laborApprovalDraft', () => {
  it('근무자 한 명이 지급정보 한 줄이 된다', () => {
    const r = laborApprovalDraft({ ...base, lines: [line(), line({ worker_name: '최일용', payment_date: null, bank_name: null })] })
    if (!r.ok) throw new Error(r.error)
    expect(r.draft.title).toBe('26년 10월 상암오수펌프장 노무비[박일용,최일용] 집행 요청의 건')
    expect(r.draft.payments).toEqual([
      { vendor_name: '박일용', amount: 1_620_000, pay_request_date: '2026-10-31', bank: '국민', account_no: '123-45', business_no: '' },
      { vendor_name: '최일용', amount: 1_620_000, pay_request_date: '2026-10-09', bank: '', account_no: '123-45', business_no: '' },
    ])
    expect(r.draft.body_html).toContain('박일용: 9일')
  })

  it('제목이 50자를 넘으면 이름을 인원수로 줄인다', () => {
    const r = laborApprovalDraft({
      ...base, workTargetName: '수도권서부본부 사옥 외부 도장공사',
      lines: [line({ worker_name: '김창식' }), line({ worker_name: '김수만' }), line({ worker_name: '이희건' })],
    })
    if (!r.ok) throw new Error(r.error)
    expect(r.draft.title).toContain('노무비(3명)')
    expect(r.draft.title).not.toContain('김창식')
    expect(r.draft.title.length).toBeLessThanOrEqual(50)
  })

  it('공사건명이 길어 인원수로도 안 줄면 공사건명을 자른다', () => {
    const r = laborApprovalDraft({ ...base, workTargetName: '아'.repeat(60), lines: [line()] })
    if (!r.ok) throw new Error(r.error)
    expect(r.draft.title.length).toBeLessThanOrEqual(50)
    expect(r.draft.title).toContain('…')
    expect(r.draft.title).toContain('집행 요청의 건')
  })

  it('만든 결의서는 노무비로 분류되고, 현장을 이으면 결재 검사를 통과한다', () => {
    const r = laborApprovalDraft({ ...base, lines: [line()] })
    if (!r.ok) throw new Error(r.error)
    expect(suggestedLaborCategory(r.draft.title)).toBeTruthy()
    expect(validateLaborApproval({ title: r.draft.title, site_id: 'site1', project_id: null, payments: r.draft.payments, mode: 'submit' })).toBeNull()
  })

  it('체크한 사람이 없거나, 이름·실지급액이 비면 만들지 않는다', () => {
    expect(laborApprovalDraft({ ...base, lines: [] }).ok).toBe(false)
    expect(laborApprovalDraft({ ...base, lines: [line({ worker_name: ' ' })] }).ok).toBe(false)
    expect(laborApprovalDraft({ ...base, lines: [line({ netPay: 0 })] }).ok).toBe(false)
  })
})
