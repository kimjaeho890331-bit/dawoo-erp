import { describe, expect, it } from 'vitest'
import {
  LABOR_CATEGORY,
  MATERIAL_CATEGORY,
  SITE_OVERHEAD_CATEGORY,
  completionMargin,
  isLaborExpense,
  laborReviewRows,
  looksLikeLabor,
  looksLikeStatutoryCharge,
  suggestedLaborCategory,
  validateLaborApproval,
  validateLaborExpense,
} from './expenseCategory'

describe('looksLikeLabor / statutory', () => {
  it('노무·일당·일용·근로를 노무로 본다', () => {
    expect(looksLikeLabor('8월 일용직 노무비')).toBe(true)
    expect(looksLikeLabor('일당 정산')).toBe(true)
    expect(looksLikeLabor('근로자 지급')).toBe(true)
    expect(looksLikeLabor('자재 선금')).toBe(false)
  })

  it('건강보험·퇴직공제는 후불 공과로 본다', () => {
    expect(looksLikeStatutoryCharge('국민건강보험료 7월')).toBe(true)
    expect(looksLikeStatutoryCharge('노무비 및 퇴직공제')).toBe(true)
    expect(looksLikeStatutoryCharge('8월 일용직 노무비')).toBe(false)
  })
})

describe('validateLaborExpense', () => {
  const ok = {
    category: LABOR_CATEGORY,
    title: '8월 일용직 노무비',
    amount: 264010,
    expense_date: '2026-08-03',
    site_id: 'site-1',
    project_id: null as string | null,
  }

  it('노무가 아니면 통과', () => {
    expect(validateLaborExpense({ category: '자재비', title: '철물', amount: 1, expense_date: '2026-01-01' })).toBeNull()
  })

  it('제목이 노무인데 기타면 막는다', () => {
    expect(validateLaborExpense({ ...ok, category: '기타', site_id: 's' })).toMatch(/노무비/)
  })

  it('노무비인데 현장·접수 둘 다 없으면 막는다', () => {
    expect(validateLaborExpense({ ...ok, site_id: null, project_id: null })).toMatch(/현장/)
  })

  it('접수만 있어도 통과', () => {
    expect(validateLaborExpense({ ...ok, site_id: null, project_id: 'p1' })).toBeNull()
  })

  it('금액·날짜·적요 없으면 막는다', () => {
    expect(validateLaborExpense({ ...ok, amount: 0 })).toMatch(/금액/)
    expect(validateLaborExpense({ ...ok, expense_date: '' })).toMatch(/지출일/)
    expect(validateLaborExpense({ ...ok, title: '  ' })).toMatch(/적요/)
  })

  it('후불 공과를 노무비로 저장하지 못한다. 기타로 두면 통과(검토 목록)', () => {
    expect(validateLaborExpense({ ...ok, title: '노무비 및 퇴직공제' })).toMatch(/공과/)
    expect(validateLaborExpense({ ...ok, title: '국민건강보험료' })).toMatch(/공과/)
    expect(validateLaborExpense({
      ...ok, category: '기타', title: '노무비 및 퇴직공제', site_id: null,
    })).toBeNull()
  })

  it('지급 대상이 필요한 화면에서 비어 있으면 막는다', () => {
    expect(validateLaborExpense({ ...ok, requirePayee: true, payee: '' })).toMatch(/지급 대상/)
    expect(validateLaborExpense({ ...ok, requirePayee: true, payee: '김창식' })).toBeNull()
  })
})

describe('validateLaborApproval', () => {
  const pay = { vendor_name: '김창식', amount: 1000, pay_request_date: '2026-09-01' }

  it('임시저장은 노무 제목이면 현장만 강제한다', () => {
    expect(validateLaborApproval({
      title: '8월 일용직 노무비', site_id: null, project_id: null, payments: [], mode: 'save',
    })).toMatch(/현장/)
    expect(validateLaborApproval({
      title: '8월 일용직 노무비', site_id: 's1', payments: [], mode: 'save',
    })).toBeNull()
  })

  it('상신·승인은 지급 대상·금액·날짜가 있어야 한다', () => {
    expect(validateLaborApproval({
      title: '8월 일용직 노무비', site_id: 's1', payments: [], mode: 'submit',
    })).toMatch(/지급 대상/)
    expect(validateLaborApproval({
      title: '8월 일용직 노무비', site_id: 's1', payments: [pay], mode: 'submit',
    })).toBeNull()
    expect(validateLaborApproval({
      title: '8월 일용직 노무비', site_id: 's1', category: '기타', payments: [pay], mode: 'approve',
    })).toMatch(/노무비/)
    expect(validateLaborApproval({
      title: '8월 일용직 노무비', site_id: 's1', category: LABOR_CATEGORY, payments: [pay], mode: 'approve',
    })).toBeNull()
  })

  it('일반 자재 결의는 손대지 않는다', () => {
    expect(validateLaborApproval({
      title: '잠원초 자재 선금', site_id: null, payments: [], mode: 'submit',
    })).toBeNull()
  })
})

describe('laborReviewRows / completionMargin', () => {
  it('제목만 노무·카테고리 기타, 미연결을 목록에 넣고 site를 추정하지 않는다', () => {
    const rows = laborReviewRows([
      { id: 'a', title: '노무비 및 퇴직공제', category: '기타', site_id: null, project_id: null },
      { id: 'b', title: '8월 노무비', category: LABOR_CATEGORY, site_id: null, project_id: null },
      { id: 'c', title: '8월 노무비', category: LABOR_CATEGORY, site_id: 's1', project_id: null },
      { id: 'd', title: '철물', category: MATERIAL_CATEGORY, site_id: null, project_id: null },
    ])
    expect(rows.map(r => r.id)).toEqual(['a', 'b'])
    expect(rows[0].reviewReasons).toEqual(['wrong_category', 'unlinked'])
    expect(rows[1].reviewReasons).toEqual(['unlinked'])
  })

  it('가정산은 노무비 키만 빼고, 제목만 노무인 건은 빼지 않는다', () => {
    const m = completionMargin({
      contract: 10_000_000,
      expenses: [
        { category: MATERIAL_CATEGORY, amount: 1_000_000 },
        { category: LABOR_CATEGORY, amount: 2_000_000 },
        { category: SITE_OVERHEAD_CATEGORY, amount: 500_000 },
        { category: '기타', amount: 9_000_000 },
        { category: '기타', title: '일용직', amount: 3_000_000 } as { category: string; amount: number },
      ],
    })
    expect(m).toEqual({
      contract: 10_000_000,
      material: 1_000_000,
      labor: 2_000_000,
      overhead: 500_000,
      margin: 6_500_000,
    })
  })

  it('제목이 노무면 계정과목 후보를 노무비로 준다', () => {
    expect(suggestedLaborCategory('8월 일용직 노무비')).toBe(LABOR_CATEGORY)
    expect(suggestedLaborCategory('노무비 및 퇴직공제')).toBeNull()
    expect(isLaborExpense({ category: '기타', title: '일당' })).toBe(true)
  })
})
