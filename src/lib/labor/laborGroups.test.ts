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

// 작업대에는 년/월 고르는 칸이 없다(2026-10-15). 여러 달 행이 한 화면에 섞이므로
// 달이 다르면 따로 묶는다 — 결의서는 달 단위이고 날짜 칸(1~31)도 달마다 다르다.
describe('groupLaborRows — 달까지 나누기', () => {
  it('같은 공사건이라도 달이 다르면 따로 묶는다', () => {
    const groups = groupLaborRows([
      row({ id: 'a', site_id: 'S1', year: 2026, month: 8, sort_order: 0 }),
      row({ id: 'b', site_id: 'S1', year: 2026, month: 9, sort_order: 1 }),
      row({ id: 'c', site_id: 'S1', year: 2026, month: 8, sort_order: 2 }),
    ], { byPeriod: true })

    expect(groups.map(g => [g.key, g.year, g.month, g.rows.map(r => r.id)])).toEqual([
      ['2026-8|site:S1', 2026, 8, ['a', 'c']],
      ['2026-9|site:S1', 2026, 9, ['b']],
    ])
  })

  it('끄면 달을 가리지 않고 공사건으로만 묶는다', () => {
    const groups = groupLaborRows([
      row({ id: 'a', site_id: 'S1', year: 2026, month: 8 }),
      row({ id: 'b', site_id: 'S1', year: 2026, month: 9 }),
    ])
    expect(groups.map(g => g.rows.map(r => r.id))).toEqual([['a', 'b']])
  })
})
