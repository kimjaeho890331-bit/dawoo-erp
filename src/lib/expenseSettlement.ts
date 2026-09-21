import { completionMargin } from './expenseCategory'
import {
  isSiteCompleted,
  projectLabel,
  siteContractSource,
  workSourceLabel,
  type WorkProjectOption,
  type WorkSiteOption,
  type WorkSourceFilter,
  type WorkTargetSource,
} from './workTarget'

export type SettlementKind = 'site' | 'project' | 'none'

export type SettlementSource = WorkTargetSource | 'none'

export type SettlementExpense = {
  id: string
  site_id?: string | null
  project_id?: string | null
  amount: number | null | undefined
  title?: string
  item?: string | null
  category?: string
  expense_date?: string
  staff_id?: string | null
  memo?: string | null
}

export type SettlementGroup = {
  key: string
  kind: SettlementKind
  id: string | null
  name: string
  source: SettlementSource
  sourceLabel: string
  completed: boolean
  total: number
  count: number
}

/**
 * expenses 실지출만 합친다. sites.spent는 쓰지 않는다.
 * site_id가 있으면 현장, site_id 없이 project_id만 있으면 지원사업, 둘 다 없으면 현장 없음.
 */
export function settlementKeyOf(e: Pick<SettlementExpense, 'site_id' | 'project_id'>): {
  key: string
  kind: SettlementKind
  id: string | null
} {
  const siteId = e.site_id || null
  if (siteId) return { key: `site:${siteId}`, kind: 'site', id: siteId }
  const projectId = e.project_id || null
  if (projectId) return { key: `project:${projectId}`, kind: 'project', id: projectId }
  return { key: 'none', kind: 'none', id: null }
}

export function buildSettlementGroups(opts: {
  expenses: SettlementExpense[]
  sites: WorkSiteOption[]
  projects: WorkProjectOption[]
}): SettlementGroup[] {
  const siteMap = new Map(opts.sites.map(s => [s.id, s]))
  const projectMap = new Map(opts.projects.map(p => [p.id, p]))
  const acc = new Map<string, SettlementGroup>()

  for (const e of opts.expenses) {
    const { key, kind, id } = settlementKeyOf(e)
    const amount = Number(e.amount) || 0
    const existing = acc.get(key)
    if (existing) {
      existing.total += amount
      existing.count += 1
      continue
    }

    if (kind === 'site' && id) {
      const site = siteMap.get(id)
      const source = siteContractSource(site?.contract_type)
      acc.set(key, {
        key, kind, id,
        name: (site?.name || '').trim() || '현장',
        source,
        sourceLabel: workSourceLabel(source),
        completed: isSiteCompleted(site?.status),
        total: amount,
        count: 1,
      })
      continue
    }

    if (kind === 'project' && id) {
      const project = projectMap.get(id)
      acc.set(key, {
        key, kind, id,
        name: project ? projectLabel(project) : '지원사업',
        source: 'project',
        sourceLabel: workSourceLabel('project'),
        completed: false,
        total: amount,
        count: 1,
      })
      continue
    }

    acc.set(key, {
      key, kind: 'none', id: null,
      name: '현장 없음',
      source: 'none',
      sourceLabel: '현장 없음',
      completed: false,
      total: amount,
      count: 1,
    })
  }

  return [...acc.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ko'))
}

export function filterSettlementGroups(
  groups: SettlementGroup[],
  opts: { query?: string; source?: WorkSourceFilter; includeCompleted?: boolean },
): SettlementGroup[] {
  const query = (opts.query ?? '').trim().toLowerCase()
  const source = opts.source ?? 'all'
  const includeCompleted = opts.includeCompleted ?? false

  return groups.filter(g => {
    if (g.completed && !includeCompleted) return false
    if (source === 'bid' && g.source !== 'bid') return false
    if (source === 'private' && g.source !== 'private') return false
    if (source === 'project' && g.source !== 'project') return false
    if (query && !g.name.toLowerCase().includes(query)) return false
    return true
  })
}

export function expensesForGroup(
  expenses: SettlementExpense[],
  group: Pick<SettlementGroup, 'kind' | 'id'>,
): SettlementExpense[] {
  return expenses.filter(e => {
    const k = settlementKeyOf(e)
    return k.kind === group.kind && k.id === group.id
  }).sort((a, b) => (b.expense_date || '').localeCompare(a.expense_date || ''))
}

export function settlementTotals(groups: SettlementGroup[]): { total: number; count: number } {
  return groups.reduce((s, g) => ({ total: s.total + g.total, count: s.count + g.count }), { total: 0, count: 0 })
}

/** 그룹의 계약금액. 현장은 budget, 지원사업은 total_cost. 없으면 0 — 추정하지 않는다. */
export function groupContractAmount(
  group: Pick<SettlementGroup, 'kind' | 'id'>,
  sites: WorkSiteOption[],
  projects: WorkProjectOption[],
): number {
  if (group.kind === 'site' && group.id) {
    return Number(sites.find(s => s.id === group.id)?.budget) || 0
  }
  if (group.kind === 'project' && group.id) {
    return Number(projects.find(p => p.id === group.id)?.total_cost) || 0
  }
  return 0
}

/** 준공 가정산. 노무는 category=노무비만 사용한다. */
export function groupCompletionMargin(
  group: Pick<SettlementGroup, 'kind' | 'id'>,
  expenses: SettlementExpense[],
  sites: WorkSiteOption[],
  projects: WorkProjectOption[],
) {
  return completionMargin({
    contract: groupContractAmount(group, sites, projects),
    expenses: expensesForGroup(expenses, group),
  })
}

