import { describe, expect, it } from 'vitest'
import { projectLabel, workKindFromIds, workTargetLabel } from './workTarget'

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
})
