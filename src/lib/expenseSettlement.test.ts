import { describe, expect, it } from 'vitest'
import {
  buildSettlementGroups,
  expensesForGroup,
  filterSettlementGroups,
  settlementKeyOf,
  settlementTotals,
} from './expenseSettlement'

const sites = [
  { id: 's-bid', name: '잠원초', contract_type: '입찰', status: '공사중' },
  { id: 's-priv', name: '화서동 단독', contract_type: '수의계약', status: '착공' },
  { id: 's-done', name: '정산된 학교', contract_type: '입찰', status: '정산완료' },
  { id: 's-null', name: '미분류 현장', contract_type: null, status: '공사중' },
]

const projects = [
  { id: 'p1', building_name: '대광빌라', dong: 'F동', ho: '302' },
]

const expenses = [
  { id: 'e1', site_id: 's-bid', project_id: null, amount: 1000, title: '자재', expense_date: '2026-09-01' },
  { id: 'e2', site_id: 's-bid', project_id: 'p1', amount: 2500, title: '노무', expense_date: '2026-09-02' },
  { id: 'e3', site_id: null, project_id: 'p1', amount: 400, title: '지원', expense_date: '2026-08-01' },
  { id: 'e4', site_id: 's-done', project_id: null, amount: 900, title: '완료분', expense_date: '2026-07-01' },
  { id: 'e5', site_id: null, project_id: null, amount: 50, title: '미지정', expense_date: '2026-09-03' },
  { id: 'e6', site_id: 's-priv', project_id: null, amount: 300, title: '수의', expense_date: '2026-09-04' },
]

describe('expenseSettlement', () => {
  it('site_id가 있으면 현장, 없으면 project_id, 둘 다 없으면 현장 없음', () => {
    expect(settlementKeyOf({ site_id: 's1', project_id: 'p1' })).toEqual({ key: 'site:s1', kind: 'site', id: 's1' })
    expect(settlementKeyOf({ site_id: null, project_id: 'p1' })).toEqual({ key: 'project:p1', kind: 'project', id: 'p1' })
    expect(settlementKeyOf({ site_id: '', project_id: null })).toEqual({ key: 'none', kind: 'none', id: null })
  })

  it('expenses 실금액만 합치고 sites.spent는 쓰지 않는다', () => {
    const groups = buildSettlementGroups({ expenses, sites, projects })
    const byKey = Object.fromEntries(groups.map(g => [g.key, g]))

    expect(byKey['site:s-bid']).toEqual(expect.objectContaining({
      name: '잠원초', sourceLabel: '입찰', total: 3500, count: 2, completed: false,
    }))
    expect(byKey['project:p1']).toEqual(expect.objectContaining({
      name: '대광빌라 F동 302호', sourceLabel: '지원사업', total: 400, count: 1,
    }))
    expect(byKey['site:s-done']).toEqual(expect.objectContaining({
      total: 900, completed: true, sourceLabel: '입찰',
    }))
    expect(byKey['none']).toEqual(expect.objectContaining({
      name: '현장 없음', total: 50, count: 1,
    }))
    expect(groups.some(g => g.total === 9999)).toBe(false)
  })

  it('정산완료는 기본 숨기고, 입찰/수의계약/지원사업으로 가른다', () => {
    const groups = buildSettlementGroups({ expenses, sites, projects })

    const hidden = filterSettlementGroups(groups, {})
    expect(hidden.map(g => g.key)).not.toContain('site:s-done')

    const withDone = filterSettlementGroups(groups, { includeCompleted: true })
    expect(withDone.map(g => g.key)).toContain('site:s-done')

    expect(filterSettlementGroups(groups, { source: 'bid' }).map(g => g.key)).toEqual(['site:s-bid'])
    expect(filterSettlementGroups(groups, { source: 'private' }).map(g => g.id)).toEqual(['s-priv'])
    expect(filterSettlementGroups(groups, { source: 'project' }).map(g => g.id)).toEqual(['p1'])
    expect(filterSettlementGroups(groups, { query: '잠원' }).map(g => g.id)).toEqual(['s-bid'])
  })

  it('펼친 내역은 그 그룹의 지출만, 날짜 최신이 위', () => {
    const groups = buildSettlementGroups({ expenses, sites, projects })
    const bid = groups.find(g => g.key === 'site:s-bid')!
    const rows = expensesForGroup(expenses, bid)
    expect(rows.map(r => r.id)).toEqual(['e2', 'e1'])
    expect(rows.reduce((s, r) => s + (r.amount || 0), 0)).toBe(bid.total)
  })

  it('표시 합계는 필터된 그룹의 실합이다', () => {
    const groups = filterSettlementGroups(
      buildSettlementGroups({ expenses, sites, projects }),
      { source: 'bid' },
    )
    expect(settlementTotals(groups)).toEqual({ total: 3500, count: 2 })
  })
})
