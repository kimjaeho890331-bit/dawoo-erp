// ============================================
// 지출결의서 전자결재 타입
// DB: supabase/migrations/012_expense_approval.sql
// ============================================

export const APPROVAL_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'withdrawn'] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  draft: '저장된',
  pending: '진행중',
  approved: '완료',
  rejected: '반려된',
  withdrawn: '회수된',
}

export const LINE_ROLES = ['approval', 'cooperation'] as const
export type LineRole = (typeof LINE_ROLES)[number]

export const LINE_ROLE_LABEL: Record<LineRole, string> = {
  approval: '결재',
  cooperation: '협조',
}

export const LINE_STATES = ['waiting', 'approved', 'rejected'] as const
export type LineState = (typeof LINE_STATES)[number]

export const LINE_STATE_LABEL: Record<LineState, string> = {
  waiting: '대기',
  approved: '승인',
  rejected: '반려',
}

// 계정과목 — ExpensesPage.tsx의 EXPENSE_CATS와 동일해야 한다
export const EXPENSE_CATEGORIES = [
  '식대', '교통비', '자재비', '현장경비', '노무비', '사무용품', '기타',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const FORM_ABBR = 'CDV'

export interface ExpenseReport {
  id: string
  doc_no: string | null
  title: string
  status: ApprovalStatus
  drafter_staff_id: string
  submitted_at: string | null
  completed_at: string | null
  total_amount: number
  category: string | null
  body_html: string | null
  retention_years: number
  created_at: string
  updated_at: string
}

export interface ExpenseReportPayment {
  id: string
  report_id: string
  seq: number
  vendor_name: string
  amount: number
  pay_request_date: string
  bank: string
  account_no: string
  business_no: string | null
  expense_id: string | null
}

export interface ExpenseReportDetail {
  id: string
  report_id: string
  seq: number
  vendor_name: string | null
  account: string | null
  content: string | null
  dept_name: string | null
  amount: number | null
  note: string | null
}

export interface ExpenseReportLine {
  id: string
  report_id: string
  seq: number
  staff_id: string
  role: LineRole
  state: LineState
  acted_at: string | null
  comment: string | null
}

export interface ExpenseReportFile {
  id: string
  report_id: string
  file_name: string
  file_url: string
  size: number
  uploaded_at: string
}

export interface ExpenseReportRef {
  id: string
  report_id: string
  ref_report_id: string
}

// --- 화면 입력용 행 ---
// 컴포넌트가 아니라 여기에 둔다. 서버 전용 모듈(excel.ts)이 'use client' 파일을
// import 하면 모듈 그래프가 섞인다.

export interface PaymentRow {
  vendor_name: string
  amount: number
  pay_request_date: string
  bank: string
  account_no: string
  business_no: string
}

export interface DetailRow {
  vendor_name: string
  account: string
  content: string
  dept_name: string
  amount: number
  note: string
}

export const EMPTY_PAYMENT: PaymentRow = {
  vendor_name: '', amount: 0, pay_request_date: '',
  bank: '', account_no: '', business_no: '',
}

export const EMPTY_DETAIL: DetailRow = {
  vendor_name: '', account: '', content: '', dept_name: '', amount: 0, note: '',
}
