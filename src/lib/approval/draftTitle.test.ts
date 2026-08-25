import { describe, it, expect } from 'vitest'
import { draftTitleFromTarget } from './draftTitle'

describe('draftTitleFromTarget', () => {
  it('대상 이름 뒤에 집행 요청의 건을 붙인다', () => {
    expect(draftTitleFromTarget('아름학교 인방보수공사'))
      .toBe('아름학교 인방보수공사 집행 요청의 건')
  })

  it('50자를 넘으면 잘라낸다', () => {
    const long = '가'.repeat(60)
    expect(draftTitleFromTarget(long)).toHaveLength(50)
  })

  it('앞뒤 공백을 정리한다', () => {
    expect(draftTitleFromTarget('  한수중학교 옥상 방수공사  '))
      .toBe('한수중학교 옥상 방수공사 집행 요청의 건')
  })

  it('이름이 비어 있으면 빈 문자열을 돌려준다', () => {
    expect(draftTitleFromTarget('')).toBe('')
    expect(draftTitleFromTarget('   ')).toBe('')
  })
})
