import { describe, it, expect } from 'vitest'
import { groupLaborRows, assertWorkTargetAssigned, type LaborGroupRow } from './laborGroups'

const row = (o: Partial<LaborGroupRow> & { id: string }): LaborGroupRow => ({
  site_id: null, project_id: null, sort_order: 0, ...o,
})

describe('groupLaborRows', () => {
  it('공사건별로 묶고 미지정은 맨 뒤에 둔다', () => {
    const groups = groupLaborRows([
      row({ id: 'a', site_id: 'S1', sort_order: 0 }),
      row({ id: 'b', site_id: 'S2', sort_order: 1 }),
      row({ id: 'c', site_id: 'S1', sort_order: 2 }),
      row({ id: 'd', project_id: 'P1', sort_order: 3 }),
      row({ id: 'e', sort_order: 4 }),
    ])

    expect(groups.map(g => [g.key, g.rows.map(r => r.id)])).toEqual([
      ['site:S1', ['a', 'c']],
      ['site:S2', ['b']],
      ['project:P1', ['d']],
      ['none', ['e']],
    ])
  })
})

describe('assertWorkTargetAssigned', () => {
  it('공사건 미지정 행이 섞여 있으면 막는다', () => {
    const r = assertWorkTargetAssigned([
      row({ id: 'a', site_id: 'S1' }),
      row({ id: 'b' }),
      row({ id: 'c' }),
    ])
    expect(r).toEqual({ ok: false, error: '공사건이 지정되지 않은 행이 2개 있습니다. 공사건을 먼저 지정해 주세요.' })
  })

  it('전부 공사건이 있으면 통과한다', () => {
    const r = assertWorkTargetAssigned([
      row({ id: 'a', site_id: 'S1' }),
      row({ id: 'b', project_id: 'P1' }),
    ])
    expect(r).toEqual({ ok: true })
  })
})
