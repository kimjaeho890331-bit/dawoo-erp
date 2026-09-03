import { describe, expect, it } from 'vitest'
import { projectCreateRegionRefuseReason, regionNameFromCityId } from './projectRegion'

const CITIES = [
  { id: 'c1', name: '수원' },
  { id: 'c2', name: ' 성남 ' },
]

describe('regionNameFromCityId', () => {
  it('고른 시의 이름만 쓰고 추측하지 않는다', () => {
    expect(regionNameFromCityId('c1', CITIES)).toBe('수원')
    expect(regionNameFromCityId('c2', CITIES)).toBe('성남')
    expect(regionNameFromCityId('', CITIES)).toBeNull()
    expect(regionNameFromCityId('missing', CITIES)).toBeNull()
  })
})

describe('projectCreateRegionRefuseReason', () => {
  it('신규 접수는 region이 있어야 한다', () => {
    expect(projectCreateRegionRefuseReason(null)).toBe('지역을 선택해 주세요')
    expect(projectCreateRegionRefuseReason('')).toBe('지역을 선택해 주세요')
    expect(projectCreateRegionRefuseReason('수원')).toBeNull()
  })
})
