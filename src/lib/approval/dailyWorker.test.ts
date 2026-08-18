import { describe, expect, it } from 'vitest'
import { attachDailyWorkerFiles } from './dailyWorker'

const daily = {
  name: '홍길동',
  vendor_type: '일용직',
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
