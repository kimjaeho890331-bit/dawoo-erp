/**
 * 지출 계정과목 — 준공 가정산(계약−자재−노무−경비)과 입력 검증이 같은 키를 쓴다.
 * UI 옵션(EXPENSE_CATEGORIES)과 맞춰 두고, 노무는 「노무비」만 인정한다.
 */

export const EXPENSE_CATEGORIES = [
  '식대', '교통비', '자재비', '현장경비', '노무비', '사무용품', '기타',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const LABOR_CATEGORY = '노무비' as const
export const MATERIAL_CATEGORY = '자재비' as const
export const SITE_OVERHEAD_CATEGORY = '현장경비' as const

/** 제목·적요에서 노무로 보이는 단어. 카테고리 추정·검토 목록에만 쓴다. */
export const LABOR_HINT_RE = /노무|일당|일용|근로/
/** 월말·분기 후불 공과. 노무비 줄에 섞지 않는다. */
export const STATUTORY_CHARGE_RE = /건강보험|국민건강|국민연금|고용보험|산재보험|장기요양|퇴직공제/

export function laborTextOf(...parts: Array<string | null | undefined>): string {
  return parts.filter(p => (p ?? '').trim()).join(' ')
}

export function looksLikeLabor(text?: string | null): boolean {
  return LABOR_HINT_RE.test((text ?? '').trim())
}

export function looksLikeStatutoryCharge(text?: string | null): boolean {
  return STATUTORY_CHARGE_RE.test((text ?? '').trim())
}

export function isLaborCategory(category?: string | null): boolean {
  return (category ?? '').trim() === LABOR_CATEGORY
}

export function hasWorkTarget(siteId?: string | null, projectId?: string | null): boolean {
  return Boolean((siteId ?? '').trim() || (projectId ?? '').trim())
}

/** 계정과목이 노무비이거나, 제목/적요가 노무로 보인다. */
export function isLaborExpense(input: {
  category?: string | null
  title?: string | null
  item?: string | null
}): boolean {
  if (isLaborCategory(input.category)) return true
  return looksLikeLabor(laborTextOf(input.title, input.item))
}

export function suggestedLaborCategory(text?: string | null): typeof LABOR_CATEGORY | null {
  const t = (text ?? '').trim()
  if (!looksLikeLabor(t) || looksLikeStatutoryCharge(t)) return null
  return LABOR_CATEGORY
}

export type LaborValidateMode = 'save' | 'submit' | 'approve'

const MSG = {
  mixStatutory: '국민건강보험·퇴직공제 등 후불 공과는 노무비 줄에 섞을 수 없습니다. 별도 정산하세요.',
  needLaborCat: '노무 관련 지출은 계정과목을 노무비로 저장해야 합니다.',
  needTarget: '노무비는 현장 또는 지원사업을 연결해야 합니다.',
  needAmount: '노무비 금액을 입력해 주세요.',
  needDate: '노무비 지출일(또는 지급요청일)을 입력해 주세요.',
  needTitle: '노무비 적요/공종을 한 줄 입력해 주세요.',
  needPayee: '노무비 지급 대상(일용·업체명·성명)을 입력해 주세요.',
} as const

function hasAmount(amount?: number | null): boolean {
  return Number.isFinite(Number(amount)) && Number(amount) > 0
}

function hasDate(value?: string | null): boolean {
  return Boolean((value ?? '').trim())
}

/**
 * expenses 행 검증. 노무가 아니면 null.
 * 지급 대상 칸이 있는 화면만 requirePayee를 켠다(지출결의 지급정보).
 */
export function validateLaborExpense(input: {
  category?: string | null
  title?: string | null
  item?: string | null
  amount?: number | null
  expense_date?: string | null
  site_id?: string | null
  project_id?: string | null
  payee?: string | null
  requirePayee?: boolean
}): string | null {
  const text = laborTextOf(input.title, input.item, input.payee)
  const laborCat = isLaborCategory(input.category)
  const laborish = looksLikeLabor(text)
  const statutory = looksLikeStatutoryCharge(text)

  if (laborCat && statutory) return MSG.mixStatutory
  // 제목에 노무+공과가 섞여 기타로 두는 건 검토 목록에만 남긴다. 노무비로 강제하지 않는다.
  if (!laborCat && (!laborish || statutory)) return null
  if (laborish && !laborCat) return MSG.needLaborCat
  if (!hasWorkTarget(input.site_id, input.project_id)) return MSG.needTarget
  if (!hasAmount(input.amount)) return MSG.needAmount
  if (!hasDate(input.expense_date)) return MSG.needDate
  if (!laborTextOf(input.title, input.item)) return MSG.needTitle
  if (input.requirePayee && !laborTextOf(input.payee)) return MSG.needPayee
  return null
}

/**
 * 지출결의서 검증.
 * save: 노무면 현장 연결·제목 필수. 채워 둔 지급 줄은 대상·금액·날짜도 본다.
 * submit/approve: 지급 줄이 하나 이상 있어야 하고, 각 줄에 대상·금액·날짜가 있어야 한다.
 * approve: 계정과목이 있으면 노무비여야 한다.
 */
export function validateLaborApproval(input: {
  title?: string | null
  category?: string | null
  site_id?: string | null
  project_id?: string | null
  payments?: Array<{
    vendor_name?: string | null
    amount?: number | null
    pay_request_date?: string | null
  }>
  mode: LaborValidateMode
}): string | null {
  const title = (input.title ?? '').trim()
  const laborCat = isLaborCategory(input.category)
  const laborish = looksLikeLabor(title)
  const statutory = looksLikeStatutoryCharge(title)
  const labor = laborCat || (laborish && !statutory)

  if (laborCat && statutory) return MSG.mixStatutory
  if (!labor) return null
  if (input.mode === 'approve' && input.category && !laborCat) return MSG.needLaborCat
  if (laborish && !statutory && input.category && !laborCat) return MSG.needLaborCat
  if (!hasWorkTarget(input.site_id, input.project_id)) return MSG.needTarget
  if (!title) return MSG.needTitle

  const payments = input.payments ?? []
  const filled = payments.filter(p =>
    laborTextOf(p.vendor_name) || hasAmount(p.amount) || hasDate(p.pay_request_date),
  )

  if (input.mode === 'save' && filled.length === 0) return null

  if (input.mode !== 'save' && filled.length === 0) return MSG.needPayee

  for (const p of filled) {
    if (!laborTextOf(p.vendor_name)) return MSG.needPayee
    if (!hasAmount(p.amount)) return MSG.needAmount
    if (!hasDate(p.pay_request_date)) return MSG.needDate
  }
  return null
}

export type LaborReviewReason = 'wrong_category' | 'unlinked'

export type LaborReviewRow<T> = T & { reviewReasons: LaborReviewReason[] }

/** 제목만 노무·카테고리 불일치, 또는 노무/노무성인데 현장 미연결. site를 추정하지 않는다. */
export function laborReviewRows<T extends {
  category?: string | null
  title?: string | null
  item?: string | null
  site_id?: string | null
  project_id?: string | null
}>(rows: T[]): LaborReviewRow<T>[] {
  const out: LaborReviewRow<T>[] = []
  for (const row of rows) {
    const text = laborTextOf(row.title, row.item)
    const laborish = looksLikeLabor(text)
    const laborCat = isLaborCategory(row.category)
    if (!laborish && !laborCat) continue
    const reasons: LaborReviewReason[] = []
    if (laborish && !laborCat) reasons.push('wrong_category')
    if (!hasWorkTarget(row.site_id, row.project_id)) reasons.push('unlinked')
    if (reasons.length > 0) out.push({ ...row, reviewReasons: reasons })
  }
  return out
}

export function laborReviewReasonLabel(reason: LaborReviewReason): string {
  return reason === 'wrong_category' ? '제목은 노무·계정과목 다름' : '현장 미연결'
}

/** 준공 가정산. 노무는 노무비 행만 뺀다 — 제목만 노무인 건은 넣지 않는다. */
export function completionMargin(opts: {
  contract: number
  expenses: Array<{ category?: string | null; amount?: number | null }>
}): {
  contract: number
  material: number
  labor: number
  overhead: number
  margin: number
} {
  let material = 0
  let labor = 0
  let overhead = 0
  for (const e of opts.expenses) {
    const amount = Number(e.amount) || 0
    const cat = (e.category ?? '').trim()
    if (cat === MATERIAL_CATEGORY) material += amount
    else if (cat === LABOR_CATEGORY) labor += amount
    else if (cat === SITE_OVERHEAD_CATEGORY) overhead += amount
  }
  const contract = Number(opts.contract) || 0
  return {
    contract,
    material,
    labor,
    overhead,
    margin: contract - material - labor - overhead,
  }
}
