import { contractTypeKind } from './siteContract'

export type WorkKind = '' | 'site' | 'project'

/** 현장 고르기 출처 필터. 입찰·수의는 sites.contract_type, 지원사업은 projects. */
export type WorkSourceFilter = 'all' | 'bid' | 'private' | 'project'

export type WorkSiteSource = 'bid' | 'private' | 'unclassified'

export type WorkTargetSource = WorkSiteSource | 'project'

export type WorkSiteOption = {
  id: string
  name: string
  contract_type?: string | null
  status?: string | null
}

export type WorkProjectOption = {
  id: string
  building_name?: string | null
  ho?: string | null
  dong?: string | null
}

export type WorkTargetHit = {
  kind: 'site' | 'project'
  id: string
  label: string
  source: WorkTargetSource
  sourceLabel: string
  completed: boolean
}

/** sites.status 완료류. 최소 정산완료 — 그 외 완료 값은 여기만 늘린다. */
export const SITE_COMPLETED_STATUSES = ['정산완료'] as const

export const WORK_SOURCE_FILTERS: { key: WorkSourceFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'bid', label: '입찰' },
  { key: 'private', label: '수의' },
  { key: 'project', label: '지원사업' },
]

export const WORK_SEARCH_LIMIT = 20

export function workKindFromIds(siteId?: string | null, projectId?: string | null): WorkKind {
  if (siteId) return 'site'
  if (projectId) return 'project'
  return ''
}

export function projectLabel(p: { building_name?: string | null; ho?: string | null; dong?: string | null }): string {
  const name = (p.building_name || '').trim() || '접수'
  const ho = (p.ho || '').trim()
  const dong = (p.dong || '').trim()
  const loc = [dong, ho ? `${ho}호` : ''].filter(Boolean).join(' ')
  return loc ? `${name} ${loc}` : name
}

export function workTargetLabel(opts: {
  siteName?: string | null
  projectName?: string | null
  siteId?: string | null
  projectId?: string | null
}): { text: string; missing: boolean } {
  if (opts.siteId && opts.siteName) return { text: opts.siteName, missing: false }
  if (opts.projectId && opts.projectName) return { text: opts.projectName, missing: false }
  if (opts.siteId) return { text: '현장', missing: false }
  if (opts.projectId) return { text: '지원사업', missing: false }
  return { text: '현장 없음', missing: true }
}

export function isSiteCompleted(status?: string | null): boolean {
  return SITE_COMPLETED_STATUSES.includes((status ?? '').trim() as (typeof SITE_COMPLETED_STATUSES)[number])
}

export function siteContractSource(contractType?: string | null): WorkSiteSource {
  const kind = contractTypeKind(contractType)
  if (kind === 'bid') return 'bid'
  if (kind === 'private') return 'private'
  return 'unclassified'
}

export function workSourceLabel(source: WorkTargetSource): string {
  if (source === 'bid') return '입찰'
  if (source === 'private') return '수의'
  if (source === 'project') return '지원사업'
  return '미분류'
}

function matchesQuery(label: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return label.toLowerCase().includes(q)
}

function siteHit(site: WorkSiteOption): WorkTargetHit {
  const source = siteContractSource(site.contract_type)
  return {
    kind: 'site',
    id: site.id,
    label: (site.name || '').trim() || '현장',
    source,
    sourceLabel: workSourceLabel(source),
    completed: isSiteCompleted(site.status),
  }
}

function projectHit(project: WorkProjectOption): WorkTargetHit {
  return {
    kind: 'project',
    id: project.id,
    label: projectLabel(project),
    source: 'project',
    sourceLabel: workSourceLabel('project'),
    completed: false,
  }
}

export function selectedWorkTarget(opts: {
  sites: WorkSiteOption[]
  projects: WorkProjectOption[]
  siteId?: string | null
  projectId?: string | null
}): WorkTargetHit | null {
  if (opts.siteId) {
    const site = opts.sites.find(s => s.id === opts.siteId)
    return site ? siteHit(site) : null
  }
  if (opts.projectId) {
    const project = opts.projects.find(p => p.id === opts.projectId)
    return project ? projectHit(project) : null
  }
  return null
}

/**
 * 입찰·수의(sites)와 지원사업을 이름(접수 건은 projectLabel)으로 찾는다.
 * 완료 현장은 기본 제외. 이미 고른 완료 현장은 selectedSiteId로 남겨 둔다.
 * 빈 검색어는 결과를 비운다 — 긴 목록을 드롭다운으로 쏟지 않기 위함.
 */
export function searchWorkTargets(opts: {
  sites: WorkSiteOption[]
  projects: WorkProjectOption[]
  query: string
  source?: WorkSourceFilter
  includeCompleted?: boolean
  selectedSiteId?: string | null
  limit?: number
}): WorkTargetHit[] {
  const query = opts.query.trim()
  if (!query) return []

  const source = opts.source ?? 'all'
  const includeCompleted = opts.includeCompleted ?? false
  const limit = opts.limit ?? WORK_SEARCH_LIMIT
  const hits: WorkTargetHit[] = []

  if (source !== 'project') {
    for (const site of opts.sites) {
      const hit = siteHit(site)
      if (source === 'bid' && hit.source !== 'bid') continue
      if (source === 'private' && hit.source !== 'private') continue
      const keepCompleted = includeCompleted || site.id === opts.selectedSiteId
      if (hit.completed && !keepCompleted) continue
      if (!matchesQuery(hit.label, query)) continue
      hits.push(hit)
    }
  }

  if (source === 'all' || source === 'project') {
    for (const project of opts.projects) {
      const hit = projectHit(project)
      if (!matchesQuery(hit.label, query)) continue
      hits.push(hit)
    }
  }

  return hits.slice(0, limit)
}
