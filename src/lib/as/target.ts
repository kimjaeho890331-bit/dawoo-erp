import { contractTypeLabel } from '../siteContract'

/**
 * A/S 접수에서 "어느 현장인가"를 고르는 규칙.
 *
 * A/S 구분이 곧 현장을 어디서 찾을지를 정한다.
 *  - 입찰·수의계약 → 현장관리(sites). 현장 수가 적어 검색어 없이도 전부 보여 준다.
 *  - 수도·소규모   → 접수대장(projects). 500건이 넘어 연도로 먼저 좁힌 뒤 빌라명으로 찾는다.
 *
 * 고르면 현장명과 주소가 따라 들어간다. 예전에는 둘 다 손으로 쳤고, 같은 현장이
 * 기록마다 다른 이름으로 남아 나중에 묶을 수 없었다.
 *
 * 이름·주소는 고른 시점의 값을 as_records에 그대로 복사해 둔다(site_id·project_id와 함께).
 * 원본이 지워지거나 이름이 바뀌어도 A/S 기록에 남은 현장명은 접수 당시 그대로여야 한다.
 */

export type AsCategory = '입찰수의계약' | '수도' | '소규모'

export type AsSiteOption = {
  id: string
  name?: string | null
  address?: string | null
  contract_type?: string | null
}

export type AsProjectOption = {
  id: string
  building_name?: string | null
  dong?: string | null
  ho?: string | null
  road_address?: string | null
  jibun_address?: string | null
  year?: number | null
}

/** 고른 결과. A/S 기록에 그대로 들어가는 네 칸. */
export type AsTargetPick = {
  site_id: string | null
  project_id: string | null
  site_name: string
  address: string
}

export type AsTargetHit = AsTargetPick & {
  key: string
  /** 목록 오른쪽 보조 설명 — 현장은 계약구분, 접수는 진행연도 */
  note: string
}

/** 연도를 아직 안 고른 상태. select 값으로도 쓴다. */
export const AS_YEAR_ALL = '전체'

/** 지원사업(접수대장)에서 고르는 구분인지 */
export function isProjectCategory(category: AsCategory): boolean {
  return category === '수도' || category === '소규모'
}

function clean(v: string | null | undefined): string {
  return (v ?? '').trim()
}

function matches(text: string, query: string): boolean {
  const q = clean(query).toLowerCase()
  if (!q) return true
  return text.toLowerCase().includes(q)
}

/** 접수 한 건의 표시 이름 — 빌라명에 동·호가 있으면 붙인다 */
export function asProjectLabel(p: AsProjectOption): string {
  const name = clean(p.building_name) || '(이름없음)'
  const dong = clean(p.dong)
  const ho = clean(p.ho)
  const loc = [dong, ho ? `${ho}호` : ''].filter(Boolean).join(' ')
  return loc ? `${name} ${loc}` : name
}

/** 도로명이 있으면 도로명, 없으면 지번. 둘 다 없으면 빈 칸으로 두고 손으로 채우게 한다 */
export function asProjectAddress(p: AsProjectOption): string {
  return clean(p.road_address) || clean(p.jibun_address)
}

/**
 * 연도 선택칸에 넣을 값. 접수에 적힌 진행연도만 모아 최근 순으로 준다.
 * 연도가 비어 있는 접수는 「전체」에서만 보인다 — 없는 연도를 지어내지 않는다.
 */
export function asProjectYears(projects: AsProjectOption[]): number[] {
  const years = new Set<number>()
  for (const p of projects) {
    if (typeof p.year === 'number' && Number.isFinite(p.year)) years.add(p.year)
  }
  return [...years].sort((a, b) => b - a)
}

export function asSiteHits(sites: AsSiteOption[], query: string): AsTargetHit[] {
  const hits: AsTargetHit[] = []
  for (const s of sites) {
    const label = clean(s.name) || '(이름없음)'
    if (!matches(label, query)) continue
    hits.push({
      key: `site-${s.id}`,
      site_id: s.id,
      project_id: null,
      site_name: label,
      address: clean(s.address),
      note: contractTypeLabel(s.contract_type),
    })
  }
  return hits
}

/**
 * 연도로 먼저 거르고 빌라명으로 찾는다.
 * 연도가 「전체」면 검색어를 받기 전에는 목록을 비운다 — 500건을 드롭다운에 쏟지 않기 위함.
 */
export function asProjectHits(
  projects: AsProjectOption[],
  year: number | typeof AS_YEAR_ALL,
  query: string,
): AsTargetHit[] {
  const q = clean(query)
  if (year === AS_YEAR_ALL && !q) return []

  const hits: AsTargetHit[] = []
  for (const p of projects) {
    if (year !== AS_YEAR_ALL && p.year !== year) continue
    const label = asProjectLabel(p)
    if (!matches(label, q)) continue
    hits.push({
      key: `project-${p.id}`,
      site_id: null,
      project_id: p.id,
      site_name: label,
      address: asProjectAddress(p),
      note: p.year == null ? '연도 없음' : `${p.year}년`,
    })
  }
  return hits
}

export const AS_TARGET_LIMIT = 50
