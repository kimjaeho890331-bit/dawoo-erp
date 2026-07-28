import { describe, it, expect } from 'vitest'
import { paymentsToExpenses } from './toExpense'
import type { ExpenseReportPayment } from '@/types/approval'

function payment(over: Partial<ExpenseReportPayment> = {}): ExpenseReportPayment {
  return {
    id: 'p1', report_id: 'r1', seq: 0,
    vendor_name: '나래이앤씨', amount: 9900000, pay_request_date: '2026-07-24',
    bank: '농협은행', account_no: '352-0373-7807-13', business_no: '507-27-20974',
    expense_id: null, ...over,
  }
}

const report = { title: '잠원초 인방보수공사 계약금 30%', doc_no: 'CDV-26-000158', drafter_staff_id: 'staff-kim' }

describe('paymentsToExpenses', () => {
  it('지급정보 1행을 지출 1건으로 바꾼다', () => {
    const out = paymentsToExpenses({ report, payments: [payment()], category: '자재비', firstFileUrl: null })
    expect(out).toHaveLength(1)
    expect(out[0].payment_id).toBe('p1')
    expect(out[0].expense).toEqual({
      title: '잠원초 인방보수공사 계약금 30%',
      amount: 9900000,
      expense_date: '2026-07-24',
      category: '자재비',
      staff_id: 'staff-kim',
      site_id: null,
      receipt_url: null,
      memo: '[CDV-26-000158] 나래이앤씨 / 농협은행 352-0373-7807-13',
      expense_report_payment_id: 'p1',
    })
  })

  it('지급정보가 2행 이상이면 제목에 거래처명을 덧붙인다', () => {
    const payments = [
      payment({ id: 'p1', vendor_name: '신성공사 [단독]', amount: 9100000 }),
      payment({ id: 'p2', vendor_name: '신성공사 [새한]', amount: 2800000 }),
    ]
    const out = paymentsToExpenses({ report, payments, category: '자재비', firstFileUrl: null })
    expect(out[0].expense.title).toBe('잠원초 인방보수공사 계약금 30% (신성공사 [단독])')
    expect(out[1].expense.title).toBe('잠원초 인방보수공사 계약금 30% (신성공사 [새한])')
  })

  it('이미 지출이 만들어진 행은 건너뛴다', () => {
    const payments = [payment({ id: 'p1', expense_id: 'exp-1' }), payment({ id: 'p2' })]
    const out = paymentsToExpenses({ report, payments, category: '자재비', firstFileUrl: null })
    expect(out).toHaveLength(1)
    expect(out[0].payment_id).toBe('p2')
  })

  it('전부 이미 만들어졌으면 빈 배열', () => {
    const payments = [payment({ expense_id: 'exp-1' })]
    expect(paymentsToExpenses({ report, payments, category: '자재비', firstFileUrl: null })).toEqual([])
  })

  it('첫 번째 첨부파일을 영수증으로 붙인다', () => {
    const out = paymentsToExpenses({ report, payments: [payment()], category: '자재비', firstFileUrl: 'https://x/a.jpg' })
    expect(out[0].expense.receipt_url).toBe('https://x/a.jpg')
  })

  it('이미 지출이 있는 행을 제외해도 거래처명 접미사는 필터링 전 행 수로 판정한다', () => {
    // 지급정보 2행: 첫 번째는 이미 처리됨, 두 번째는 미처리
    // multi는 필터링 전 2행으로 판정되어야 하므로, 남은 1행의 제목에도 거래처명이 붙어야 한다.
    const payments = [
      payment({ id: 'p1', vendor_name: '나래이앤씨', expense_id: 'exp-1' }),
      payment({ id: 'p2', vendor_name: '신성공사' }),
    ]
    const out = paymentsToExpenses({ report, payments, category: '자재비', firstFileUrl: null })
    expect(out).toHaveLength(1)
    expect(out[0].payment_id).toBe('p2')
    // 필터링 전 payments.length=2이므로 multi=true → 거래처명 접미사 포함
    expect(out[0].expense.title).toBe('잠원초 인방보수공사 계약금 30% (신성공사)')
  })
})
