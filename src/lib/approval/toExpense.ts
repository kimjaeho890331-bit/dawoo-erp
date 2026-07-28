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
  /** 원본 지급정보 행 id. expenses(expense_report_payment_id)의 부분 유니크 인덱스가
   *  이 값으로 중복 생성을 막는다 — 반드시 채워야 한다. */
  expense_report_payment_id: string
}

interface Args {
  report: Pick<ExpenseReport, 'title' | 'doc_no' | 'drafter_staff_id'>
  /** 해당 문서의 지급정보 전체. expense_id가 이미 채워진 행도 반드시 포함해야 한다 —
   *  제목의 거래처명 접미사 여부를 필터링 전 행 수로 판정하기 때문이다.
   *  만약 DB에서 expense_id IS NULL 조건으로 걸러서 넘기면 제목 형식이 달라져 지출의 일관성이 깨진다. */
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
        expense_report_payment_id: p.id,
      },
    }))
}
