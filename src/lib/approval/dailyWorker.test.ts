import { describe, expect, it } from 'vitest'
import { attachDailyWorkerFiles, hydrateDailyPayments } from './dailyWorker'

const daily = {
  id: 'v1',
  name: '홍길동',
  vendor_type: '일용직',
  phone: '010-1111-2222',
  resident_id: '900101-1234567',
  id_card_url: 'https://example.com/id',
  bankbook_url: 'https://example.com/bank',
  safety_cert_url: 'https://example.com/safety',
}

describe('attachDailyWorkerFiles', () => {
  it('일용직이 아니면 목록을 그대로 둔다', () => {
    const files = [{ file_name: 'a', file_url: 'u', size: 1 }]
    expect(attachDailyWorkerFiles(files, { ...daily, vendor_type: '협력업체' })).toBe(files)
  })

  it('일용직이면 서류 3개를 붙인다', () => {
    const next = attachDailyWorkerFiles([], daily)
    expect(next.map(f => f.file_name)).toEqual(['신분증_홍길동', '통장사본_홍길동', '안전교육이수증_홍길동'])
  })

  it('이미 같은 URL이 있으면 다시 넣지 않는다', () => {
    const existing = [{ file_name: '신분증_홍길동', file_url: 'https://example.com/id', size: 0 }]
    const next = attachDailyWorkerFiles(existing, daily)
    expect(next.filter(f => f.file_url === 'https://example.com/id')).toHaveLength(1)
    expect(next).toHaveLength(3)
  })
})

describe('hydrateDailyPayments', () => {
  it('일용직 이름이면 주민번호·연락처를 붙인다', () => {
    const next = hydrateDailyPayments(
      [{ vendor_name: '홍길동', business_no: '' }],
      [daily],
    )
    expect(next[0]).toMatchObject({
      vendor_type: '일용직',
      phone: '010-1111-2222',
      resident_id: '900101-1234567',
      business_no: '900101-1234567',
    })
  })

  it('일용직이 아니면 행을 그대로 둔다', () => {
    const row = { vendor_name: '기원건설', business_no: '123' }
    expect(hydrateDailyPayments([row], [{ ...daily, name: '기원건설', vendor_type: '협력업체' }])).toEqual([row])
  })
})
