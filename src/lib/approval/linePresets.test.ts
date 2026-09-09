import { describe, it, expect } from 'vitest'
import { presetToLines, LINE_PRESETS } from './linePresets'

const staff = [
  { id: 's1', name: '송승란' },
  { id: 's2', name: '조혜진' },
  { id: 's3', name: '김태정' },
]

describe('presetToLines', () => {
  it('프리셋 순서대로 결재선을 만든다', () => {
    const { lines, missing } = presetToLines({ label: 'x', names: ['송승란', '조혜진'] }, staff)
    expect(lines).toEqual([
      { staff_id: 's1', name: '송승란', role: 'approval' },
      { staff_id: 's2', name: '조혜진', role: 'approval' },
    ])
    expect(missing).toEqual([])
  })

  it('직원 목록에 없는 이름은 건너뛰고 missing에 담는다', () => {
    const { lines, missing } = presetToLines({ label: 'x', names: ['송승란', '퇴사자'] }, staff)
    expect(lines.map(l => l.name)).toEqual(['송승란'])
    expect(missing).toEqual(['퇴사자'])
  })

  it('아무도 못 찾으면 빈 결재선과 전체 missing을 돌려준다', () => {
    const { lines, missing } = presetToLines({ label: 'x', names: ['갑', '을'] }, staff)
    expect(lines).toEqual([])
    expect(missing).toEqual(['갑', '을'])
  })

  it('마지막이 결재 역할이라 validateApprovalLine을 통과할 수 있다', () => {
    const { lines } = presetToLines({ label: 'x', names: ['송승란', '조혜진'] }, staff)
    expect(lines[lines.length - 1].role).toBe('approval')
  })
})

describe('LINE_PRESETS', () => {
  it('송승란 → 조혜진 프리셋이 있다', () => {
    const p = LINE_PRESETS.find(x => x.label === '송승란 → 조혜진')
    expect(p?.names).toEqual(['송승란', '조혜진'])
  })

  it('모든 프리셋은 이름이 하나 이상이고 라벨이 비어 있지 않다', () => {
    for (const p of LINE_PRESETS) {
      expect(p.names.length).toBeGreaterThan(0)
      expect(p.label.trim()).not.toBe('')
    }
  })
})
