import { describe, it, expect } from 'vitest'
import { vendorDocsToAttachments } from './vendorDocs'

const vendor = {
  name: '기원건설',
  biz_license_url: 'https://x/vendors/biz.pdf',
  bankbook_url: 'https://x/vendors/bank.pdf',
}

describe('vendorDocsToAttachments', () => {
  it('사업자등록증과 통장사본을 거래처 출처로 만든다', () => {
    expect(vendorDocsToAttachments(vendor, [])).toEqual([
      { file_name: '기원건설 사업자등록증', file_url: 'https://x/vendors/biz.pdf', size: 0, source: 'vendor' },
      { file_name: '기원건설 통장사본', file_url: 'https://x/vendors/bank.pdf', size: 0, source: 'vendor' },
    ])
  })

  it('이미 붙어 있는 파일은 다시 붙이지 않는다', () => {
    const existing = [
      { file_name: '기원건설 사업자등록증', file_url: 'https://x/vendors/biz.pdf', size: 0, source: 'vendor' as const },
    ]
    expect(vendorDocsToAttachments(vendor, existing).map(f => f.file_url))
      .toEqual(['https://x/vendors/bank.pdf'])
  })

  it('서류가 없는 거래처면 빈 배열을 돌려준다', () => {
    expect(vendorDocsToAttachments(
      { name: '노나', biz_license_url: null, bankbook_url: null }, [],
    )).toEqual([])
  })

  it('한쪽만 등록돼 있으면 그것만 돌려준다', () => {
    expect(vendorDocsToAttachments(
      { name: '노나', biz_license_url: null, bankbook_url: 'https://x/vendors/b.pdf' }, [],
    ).map(f => f.file_name)).toEqual(['노나 통장사본'])
  })
})
