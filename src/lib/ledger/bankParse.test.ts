import { describe, expect, it } from 'vitest'
import {
  analyzeBankGrid,
  detectHeaderRow,
  firstWideRow,
  guessAccountLabel,
  isUsableMapping,
  mapHeaderColumns,
  matchHeaderField,
  parseAmount,
  parseBankRows,
  parseDateTime,
  summarizeBankRows,
  toTxAt,
} from './bankParse'

// 기업은행 인터넷뱅킹 「거래내역조회 → 엑셀저장」을 흉내 낸 표. 계좌번호·이름은 가짜다.
const IBK_GRID: string[][] = [
  ['거래내역조회'],
  ['계좌번호', '123-456789-01-012', '예금주', '다우건설(주)'],
  ['조회기간', '2026-01-01 ~ 2026-10-08'],
  ['No', '거래일시', '출금', '입금', '거래후 잔액', '거래내용', '상대계좌번호', '상대은행', '메모', '거래구분', 'CMS코드', '상대계좌예금주명'],
  ['1', '2026.10.08 14:22:01', '55,000', '-', '12,345,000', 'KT통신요금', '', '', '', '자동이체', 'K123', ''],
  ['2', '2026.10.07 09:01:00', '-', '3,000,000', '12,400,000', '수원시청', '1234567890', '농협', '공사대금', '타행입금', '', '수원시'],
  ['3', '2026.10.05 10:00:00', '1,200,000', '', '9,400,000', '김철수', '9876543210', '국민', '9월 급여', '인터넷', '', '김철수'],
  ['합계', '', '1,255,000', '3,000,000'],
]

describe('matchHeaderField', () => {
  it('은행마다 다른 머리글 이름을 같은 항목으로 본다', () => {
    expect(matchHeaderField('거래일시')).toBe('date')
    expect(matchHeaderField('거래일자')).toBe('date')
    expect(matchHeaderField('날짜')).toBe('date')
    expect(matchHeaderField('거래시간')).toBe('time')
    expect(matchHeaderField('출금')).toBe('out')
    expect(matchHeaderField('찾으신금액')).toBe('out')
    expect(matchHeaderField('지급금액(원)')).toBe('out')
    expect(matchHeaderField('입금액')).toBe('in')
    expect(matchHeaderField('맡기신 금액')).toBe('in')
    expect(matchHeaderField('거래후 잔액')).toBe('balance')
    expect(matchHeaderField('잔액(원)')).toBe('balance')
    expect(matchHeaderField('적요')).toBe('description')
    expect(matchHeaderField('기재내용')).toBe('description')
    expect(matchHeaderField('받는분')).toBe('counterparty')
    expect(matchHeaderField('상대계좌예금주명')).toBe('counterparty')
    expect(matchHeaderField('송금메모')).toBe('memo')
    expect(matchHeaderField('비고')).toBe('memo')
  })

  it('금액이 아닌 비슷한 칸은 금액으로 잡지 않는다', () => {
    expect(matchHeaderField('입금자명')).toBe('counterparty')
    expect(matchHeaderField('상대계좌번호')).toBeNull()
    expect(matchHeaderField('상대은행')).toBeNull()
    expect(matchHeaderField('출금은행')).toBeNull()
    expect(matchHeaderField('거래구분')).toBeNull()
    expect(matchHeaderField('CMS코드')).toBeNull()
  })

  it('긴 글(데이터 칸)은 머리글로 보지 않는다', () => {
    expect(matchHeaderField('2026년 10월 공사대금 입금 확인 부탁드립니다')).toBeNull()
  })
})

describe('detectHeaderRow / mapHeaderColumns', () => {
  it('제목 줄 아래의 머리글 줄을 찾는다', () => {
    expect(detectHeaderRow(IBK_GRID)).toBe(3)
  })

  it('칸을 짝짓고 못 짝지은 머리글을 돌려준다', () => {
    const { mapping, unmapped } = mapHeaderColumns(IBK_GRID[3])
    expect(mapping).toEqual({ date: 1, out: 2, in: 3, balance: 4, description: 5, memo: 8, counterparty: 11 })
    expect(unmapped).toEqual(['No', '상대계좌번호', '상대은행', '거래구분', 'CMS코드'])
    expect(isUsableMapping(mapping)).toBe(true)
  })

  it('날짜·시간이 따로인 다른 양식도 찾는다', () => {
    const grid = [
      ['기업은행 통장 거래내역'],
      ['거래일자', '거래시간', '적요', '찾으신금액', '맡기신금액', '잔액', '거래점'],
      ['20261008', '142201', '에스케이텔레콤', '33,000', '', '1,000,000', '인터넷'],
    ]
    expect(detectHeaderRow(grid)).toBe(1)
    const { mapping } = mapHeaderColumns(grid[1])
    expect(mapping).toEqual({ date: 0, time: 1, description: 2, out: 3, in: 4, balance: 5 })
  })

  it('머리글이 없으면 null — 화면이 칸을 직접 고르게 한다', () => {
    const grid = [['가', '나', '다'], ['2026-10-08', '1000', '메모']]
    expect(detectHeaderRow(grid)).toBeNull()
    expect(firstWideRow(grid)).toBe(0)
  })

  it('날짜만 있고 금액 칸이 없으면 머리글로 보지 않는다', () => {
    expect(detectHeaderRow([['거래일시', '거래내용', '메모']])).toBeNull()
  })
})

describe('parseAmount', () => {
  it('쉼표·원·공백을 무시한다', () => {
    expect(parseAmount('1,234,000')).toBe(1234000)
    expect(parseAmount(' 55,000원 ')).toBe(55000)
    expect(parseAmount('₩3,000')).toBe(3000)
    expect(parseAmount('0')).toBe(0)
    expect(parseAmount('1234.5')).toBe(1234.5)
  })

  it("빈 칸·'-'는 없음(null)", () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('-')).toBeNull()
    expect(parseAmount(null)).toBeNull()
    expect(parseAmount('없음')).toBeNull()
  })

  it('음수와 회계식 괄호', () => {
    expect(parseAmount('-5,000')).toBe(-5000)
    expect(parseAmount('(5,000)')).toBe(-5000)
  })
})

describe('parseDateTime', () => {
  it('은행 파일에 나오는 날짜 꼴을 읽는다', () => {
    expect(parseDateTime('2026.10.08 14:22:01')).toEqual({ date: '2026-10-08', time: '14:22:01' })
    expect(parseDateTime('2026-10-08')).toEqual({ date: '2026-10-08', time: null })
    expect(parseDateTime('20261008')).toEqual({ date: '2026-10-08', time: null })
    expect(parseDateTime('20261008142201')).toEqual({ date: '2026-10-08', time: '14:22:01' })
    expect(parseDateTime('2026/10/8 9:05')).toEqual({ date: '2026-10-08', time: '09:05:00' })
    expect(parseDateTime('2026. 10. 08.')).toEqual({ date: '2026-10-08', time: null })
    expect(parseDateTime('2026년 10월 8일')).toEqual({ date: '2026-10-08', time: null })
    expect(parseDateTime('26.10.08')).toEqual({ date: '2026-10-08', time: null })
    expect(parseDateTime('2026-10-08T14:22:01+09:00')).toEqual({ date: '2026-10-08', time: '14:22:01' })
  })

  it('엑셀 날짜 일련번호', () => {
    // 46303 = 2026-10-08, .5 = 정오
    expect(parseDateTime('46303')).toEqual({ date: '2026-10-08', time: null })
    expect(parseDateTime('46303.5')).toEqual({ date: '2026-10-08', time: '12:00:00' })
  })

  it('시간 칸이 따로 있으면 합친다', () => {
    expect(parseDateTime('2026-10-08', '14:22:01')).toEqual({ date: '2026-10-08', time: '14:22:01' })
    expect(parseDateTime('20261008', '142201')).toEqual({ date: '2026-10-08', time: '14:22:01' })
  })

  it('날짜가 아니면 null (합계 줄·없는 날짜)', () => {
    expect(parseDateTime('합계')).toBeNull()
    expect(parseDateTime('')).toBeNull()
    expect(parseDateTime('2026-02-30')).toBeNull()
    expect(parseDateTime('2026-13-01')).toBeNull()
    expect(parseDateTime('1234')).toBeNull()
  })

  it('DB 일시는 한국 시각(+09:00)', () => {
    expect(toTxAt({ date: '2026-10-08', time: '14:22:01' })).toBe('2026-10-08T14:22:01+09:00')
    expect(toTxAt({ date: '2026-10-08', time: null })).toBe('2026-10-08T00:00:00+09:00')
  })
})

describe('parseBankRows', () => {
  it('머리글 아래 줄을 출금·입금 줄로 읽고 합계 줄은 건너뛴다', () => {
    const { mapping } = mapHeaderColumns(IBK_GRID[3])
    const { rows, skipped } = parseBankRows(IBK_GRID, 3, mapping, '기업 1012')
    expect(rows).toHaveLength(3)
    expect(skipped).toBe(1)
    expect(rows[0]).toMatchObject({
      account: '기업 1012', tx_at: '2026-10-08T14:22:01+09:00', direction: 'out', amount: 55000,
      balance: 12345000, description: 'KT통신요금', counterparty: null, memo: null,
    })
    expect(rows[0].raw['거래내용']).toBe('KT통신요금')
    expect(rows[0].raw['CMS코드']).toBe('K123')
    expect(rows[1]).toMatchObject({ direction: 'in', amount: 3000000, counterparty: '수원시', memo: '공사대금' })
    expect(rows[2]).toMatchObject({ direction: 'out', amount: 1200000, counterparty: '김철수' })
  })

  it('한 줄에 출금·입금이 둘 다 있으면 두 줄', () => {
    const grid = [['날짜', '출금', '입금'], ['2026-10-01', '1,000', '2,000']]
    const { rows } = parseBankRows(grid, 0, { date: 0, out: 1, in: 2 }, 'A')
    expect(rows.map(r => [r.direction, r.amount])).toEqual([['out', 1000], ['in', 2000]])
  })

  it('직접 고른 칸(머리글 없음)으로도 읽는다', () => {
    const grid = [['가', '나', '다', '라'], ['2026-10-08', '쿠팡', '12,000', '88,000']]
    const { rows } = parseBankRows(grid, 0, { date: 0, description: 1, out: 2, balance: 3 }, 'A')
    expect(rows).toEqual([expect.objectContaining({ amount: 12000, description: '쿠팡', balance: 88000 })])
    // 머리글이 비어 있지 않으면 그 이름으로, 비면 '열N'으로 원본을 남긴다
    expect(rows[0].raw).toEqual({ 가: '2026-10-08', 나: '쿠팡', 다: '12,000', 라: '88,000' })
  })

  it('요약: 건수·합계·기간', () => {
    const { mapping } = mapHeaderColumns(IBK_GRID[3])
    const { rows } = parseBankRows(IBK_GRID, 3, mapping, 'A')
    expect(summarizeBankRows(rows)).toEqual({
      count: 3, outCount: 2, outTotal: 1255000, inCount: 1, inTotal: 3000000, from: '2026-10-05', to: '2026-10-08',
    })
  })
})

describe('guessAccountLabel', () => {
  it('제목 줄의 계좌번호 끝 4자리로 이름을 만든다(조회기간 날짜는 계좌로 보지 않는다)', () => {
    expect(guessAccountLabel(IBK_GRID, 3)).toBe('기업 1012')
    expect(guessAccountLabel([['조회기간', '2026-01-01 ~ 2026-10-08']], 1)).toBeNull()
  })

  it('하이픈 없는 계좌번호, 다른 은행 이름', () => {
    expect(guessAccountLabel([['국민은행 계좌번호: 12345678901234']], 1)).toBe('국민 1234')
  })
})

describe('analyzeBankGrid', () => {
  it('처음 읽을 때 한 번에: 머리글·칸·줄·통장 이름', () => {
    const a = analyzeBankGrid(IBK_GRID)
    expect(a.headerRow).toBe(3)
    expect(a.accountGuess).toBe('기업 1012')
    expect(a.rows).toHaveLength(3)
    expect(a.rows[0].account).toBe('기업 1012')
    expect(a.unmapped).toContain('상대계좌번호')
  })

  it('머리글을 못 찾으면 줄 없이 돌려준다(막다른 길 대신 직접 고르기)', () => {
    const a = analyzeBankGrid([['a', 'b', 'c'], ['1', '2', '3']])
    expect(a.headerRow).toBeNull()
    expect(a.rows).toEqual([])
  })
})
