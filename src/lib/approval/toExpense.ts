import type { ExpenseReport, ExpenseReportPayment } from '@/types/approval'

/** expenses 테이블에 넣을 행. site_id는 항상 null — 양식에 현장 칸이 없다. */
export interface ExpenseInsert {
  title: string
  amount: number
  expense_date: string
  category: string
  staff_id: string
  site_id: null
  receipt_url: string | null
  memo: string
}

interface Args {
  report: Pick<ExpenseReport, 'title' | 'doc_no' | 'drafter_staff_id'>
  payments: ExpenseReportPayment[]
  category: string
  firstFileUrl: string | null
}

/**
 * 지급정보 1행 = 지출 1건.
 * expense_id가 이미 있는 행은 건너뛴다 — 재처리·중복 호출로 지출이 두 번 생기는 것을 막는다.
 */
export function paymentsToExpenses({
  report, payments, category, firstFileUrl,
}: Args): { payment_id: string; expense: ExpenseInsert }[] {
  const multi = payments.length > 1

  return payments
    .filter(p => p.expense_id === null)
    .map(p => ({
      payment_id: p.id,
      expense: {
        title: multi ? `${report.title} (${p.vendor_name})` : report.title,
        amount: p.amount,
        expense_date: p.pay_request_date,
        category,
        staff_id: report.drafter_staff_id,
        site_id: null,
        receipt_url: firstFileUrl,
        memo: `[${report.doc_no ?? ''}] ${p.vendor_name} / ${p.bank} ${p.account_no}`,
      },
    }))
}
