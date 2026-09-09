import { describe, it, expect } from 'vitest'
import { pickReceiptUrl } from './receipt'

describe('pickReceiptUrl', () => {
  it('직접 올린 파일 중 첫 번째를 고른다', () => {
    expect(pickReceiptUrl([
      { file_url: 'vendors/사업자등록증.pdf', source: 'vendor' },
      { file_url: 'vendors/통장사본.pdf', source: 'vendor' },
      { file_url: 'approval/세금계산서.pdf', source: 'manual' },
      { file_url: 'approval/견적서.pdf', source: 'manual' },
    ])).toBe('approval/세금계산서.pdf')
  })

  it('거래처 서류밖에 없으면 null을 돌려준다', () => {
    expect(pickReceiptUrl([
      { file_url: 'vendors/사업자등록증.pdf', source: 'vendor' },
    ])).toBeNull()
  })

  it('첨부가 없으면 null을 돌려준다', () => {
    expect(pickReceiptUrl([])).toBeNull()
  })

  it('source가 비어 있는 예전 행은 직접 올린 것으로 본다', () => {
    expect(pickReceiptUrl([
      { file_url: 'approval/영수증.jpg', source: '' },
    ])).toBe('approval/영수증.jpg')
  })
})
