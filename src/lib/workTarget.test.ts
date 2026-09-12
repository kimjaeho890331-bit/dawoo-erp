import { describe, expect, it } from 'vitest'
import {
  isSiteCompleted,
  projectLabel,
  searchWorkTargets,
  selectedWorkTarget,
  siteContractSource,
  workKindFromIds,
  workSourceLabel,
  workTargetLabel,
} from './workTarget'

const sites = [
  { id: 's-bid', name: '잠원초', contract_type: '입찰', status: '공사중' },
  { id: 's-priv', name: '화서동 단독', contract_type: '수의계약', status: '착공' },
  { id: 's-priv-short', name: '수의현장', contract_type: '수의', status: '계약' },
  { id: 's-done', name: '정산된 학교', contract_type: '입찰', status: '정산완료' },
  { id: 's-null', name: '미분류 현장', contract_type: null, status: '공사중' },
  { id: 's-other', name: '기타계약', contract_type: '기타', status: '공사중' },
]

const projects = [
  { id: 'p1', building_name: '대광빌라', dong: 'F동', ho: '302' },
  { id: 'p2', building_name: '권선 101', dong: null, ho: null },
]

describe('workTarget', () => {
  it('둘 다 비면 현장 없음으로 표시한다', () => {
    expect(workKindFromIds(null, null)).toBe('')
    expect(workTargetLabel({})).toEqual({ text: '현장 없음', missing: true })
  })

  it('현장 또는 접수건이 있으면 그 이름을 쓴다', () => {
    expect(workKindFromIds('s1', null)).toBe('site')
    expect(workTargetLabel({ siteId: 's1', siteName: '잠원초' })).toEqual({ text: '잠원초', missing: false })
    expect(workTargetLabel({ projectId: 'p1', projectName: '권선 101' })).toEqual({ text: '권선 101', missing: false })
  })

  it('접수 라벨은 있는 칸만 붙인다', () => {
    expect(projectLabel({ building_name: 'OO빌라', ho: '101' })).toBe('OO빌라 101호')
    expect(projectLabel({})).toBe('접수')
  })

  it('정산완료만 완료 현장으로 본다', () => {
    expect(isSiteCompleted('정산완료')).toBe(true)
    expect(isSiteCompleted('준공서류')).toBe(false)
    expect(isSiteCompleted('공사중')).toBe(false)
    expect(isSiteCompleted(null)).toBe(false)
  })

  it('입찰·수의는 구분하고 null/기타는 미분류다', () => {
    expect(siteContractSource('입찰')).toBe('bid')
    expect(siteContractSource('수의계약')).toBe('private')
    expect(siteContractSource('수의')).toBe('private')
    expect(siteContractSource(null)).toBe('unclassified')
    expect(siteContractSource('기타')).toBe('unclassified')
    expect(workSourceLabel('unclassified')).toBe('미분류')
  })

  it('빈 검색어는 긴 목록을 만들지 않는다', () => {
    expect(searchWorkTargets({ sites, projects, query: '' })).toEqual([])
    expect(searchWorkTargets({ sites, projects, query: '   ' })).toEqual([])
  })

  it('전체 검색은 입찰·수의·미분류·지원사업을 이름으로 찾는다', () => {
    const hits = searchWorkTargets({ sites, projects, query: '현장' })
    expect(hits.map(h => h.id).sort()).toEqual(['s-null', 's-priv-short'])
    expect(hits.find(h => h.id === 's-null')?.sourceLabel).toBe('미분류')

    const villa = searchWorkTargets({ sites, projects, query: '대광' })
    expect(villa).toEqual([expect.objectContaining({
      kind: 'project', id: 'p1', label: '대광빌라 F동 302호', sourceLabel: '지원사업',
    })])
  })

  it('입찰·수의 칩은 해당 contract_type만, 미분류는 전체에만 남긴다', () => {
    expect(searchWorkTargets({ sites, projects, query: '잠원', source: 'bid' }).map(h => h.id)).toEqual(['s-bid'])
    expect(searchWorkTargets({ sites, projects, query: '화서', source: 'private' }).map(h => h.id)).toEqual(['s-priv'])
    expect(searchWorkTargets({ sites, projects, query: '수의', source: 'private' }).map(h => h.id)).toEqual(['s-priv-short'])
    expect(searchWorkTargets({ sites, projects, query: '미분류', source: 'bid' })).toEqual([])
    expect(searchWorkTargets({ sites, projects, query: '미분류', source: 'all' }).map(h => h.id)).toEqual(['s-null'])
    expect(searchWorkTargets({ sites, projects, query: '대광', source: 'project' }).map(h => h.id)).toEqual(['p1'])
    expect(searchWorkTargets({ sites, projects, query: '잠원', source: 'project' })).toEqual([])
  })

  it('정산완료 현장은 기본 검색에서 빼고, 완료 포함이거나 이미 고른 건은 남긴다', () => {
    expect(searchWorkTargets({ sites, projects, query: '정산' })).toEqual([])
    expect(searchWorkTargets({ sites, projects, query: '정산', includeCompleted: true }).map(h => h.id)).toEqual(['s-done'])
    expect(searchWorkTargets({
      sites, projects, query: '정산', selectedSiteId: 's-done',
    }).map(h => h.id)).toEqual(['s-done'])
  })

  it('이미 고른 완료 현장은 라벨을 유지한다', () => {
    const hit = selectedWorkTarget({ sites, projects, siteId: 's-done' })
    expect(hit).toEqual(expect.objectContaining({
      id: 's-done', label: '정산된 학교', completed: true, sourceLabel: '입찰',
    }))
  })
})
