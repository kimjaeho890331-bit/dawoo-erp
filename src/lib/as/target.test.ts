import { describe, expect, it } from 'vitest'
import {
  AS_YEAR_ALL,
  asProjectAddress,
  asProjectHits,
  asProjectLabel,
  asProjectYears,
  asSiteHits,
  isProjectCategory,
} from './target'

const sites = [
  { id: 's1', name: '잠원초', address: '서울 서초구 잠원로 1', contract_type: '입찰' },
  { id: 's2', name: '화서동 단독', address: '수원시 팔달구 화서동 2', contract_type: '수의계약' },
  { id: 's3', name: null, address: null, contract_type: null },
]

const projects = [
  { id: 'p1', building_name: '대광빌라', dong: 'F동', ho: '302', road_address: '수원시 덕영대로 1', jibun_address: '수원시 매산로 9', year: 2026 },
  { id: 'p2', building_name: '권선 101', dong: null, ho: null, road_address: null, jibun_address: '수원시 권선동 3', year: 2025 },
  { id: 'p3', building_name: '광명연립', dong: '나동', ho: '103', road_address: null, jibun_address: null, year: null },
  { id: 'p4', building_name: '대광빌라', dong: 'A동', ho: '101', road_address: '수원시 덕영대로 1', jibun_address: null, year: 2025 },
]

describe('as/target', () => {
  it('지원사업 구분만 접수대장에서 고른다', () => {
    expect(isProjectCategory('수도')).toBe(true)
    expect(isProjectCategory('소규모')).toBe(true)
    expect(isProjectCategory('입찰수의계약')).toBe(false)
  })

  it('접수 이름에 동·호를 붙인다', () => {
    expect(asProjectLabel(projects[0])).toBe('대광빌라 F동 302호')
    expect(asProjectLabel(projects[1])).toBe('권선 101')
    expect(asProjectLabel({ id: 'x' })).toBe('(이름없음)')
  })

  it('도로명이 없으면 지번을, 둘 다 없으면 빈 칸을 준다', () => {
    expect(asProjectAddress(projects[0])).toBe('수원시 덕영대로 1')
    expect(asProjectAddress(projects[1])).toBe('수원시 권선동 3')
    expect(asProjectAddress(projects[2])).toBe('')
  })

  it('연도 목록은 실제 적힌 연도만 최근 순으로 준다', () => {
    expect(asProjectYears(projects)).toEqual([2026, 2025])
  })

  it('현장은 검색어가 없어도 전부 보인다', () => {
    expect(asSiteHits(sites, '').map(h => h.site_name)).toEqual(['잠원초', '화서동 단독', '(이름없음)'])
  })

  it('현장을 고르면 이름·주소·계약구분이 따라온다', () => {
    const [hit] = asSiteHits(sites, '잠원')
    expect(hit).toMatchObject({
      site_id: 's1',
      project_id: null,
      site_name: '잠원초',
      address: '서울 서초구 잠원로 1',
      note: '입찰',
    })
  })

  it('연도를 안 고르고 검색어도 없으면 접수 목록을 비운다', () => {
    expect(asProjectHits(projects, AS_YEAR_ALL, '')).toEqual([])
    expect(asProjectHits(projects, AS_YEAR_ALL, '대광').length).toBe(2)
  })

  it('연도를 고르면 그 해 접수만, 검색어 없이도 보여 준다', () => {
    expect(asProjectHits(projects, 2025, '').map(h => h.site_name)).toEqual(['권선 101', '대광빌라 A동 101호'])
    expect(asProjectHits(projects, 2025, '대광').map(h => h.project_id)).toEqual(['p4'])
  })

  it('연도가 비어 있는 접수는 전체에서만 찾힌다', () => {
    expect(asProjectHits(projects, 2026, '광명')).toEqual([])
    const [hit] = asProjectHits(projects, AS_YEAR_ALL, '광명')
    expect(hit).toMatchObject({ project_id: 'p3', site_name: '광명연립 나동 103호', address: '', note: '연도 없음' })
  })
})
