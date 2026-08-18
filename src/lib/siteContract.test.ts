import { describe, expect, it } from 'vitest'
import { contractTypeKind, contractTypeLabel, isContractTypeChosen } from './siteContract'

describe('siteContract', () => {
  it('빈 값은 추정하지 않고 비어 있다고 본다', () => {
    expect(contractTypeKind(null)).toBe('empty')
    expect(contractTypeKind('')).toBe('empty')
    expect(contractTypeKind('   ')).toBe('empty')
    expect(contractTypeLabel(null)).toBe('')
    expect(isContractTypeChosen(null)).toBe(false)
  })

  it('입찰/수의만 정규 라벨로 보여 준다', () => {
    expect(contractTypeLabel('입찰')).toBe('입찰')
    expect(contractTypeLabel('수의계약')).toBe('수의')
    expect(contractTypeLabel('수의')).toBe('수의')
    expect(isContractTypeChosen('입찰')).toBe(true)
    expect(isContractTypeChosen('수의계약')).toBe(true)
  })

  it('알 수 없는 값은 추측하지 않고 원문을 둔다', () => {
    expect(contractTypeKind('기타')).toBe('other')
    expect(contractTypeLabel('기타')).toBe('기타')
    expect(isContractTypeChosen('기타')).toBe(false)
  })
})
