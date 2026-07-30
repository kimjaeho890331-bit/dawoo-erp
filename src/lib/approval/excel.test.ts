import ExcelJS from 'exceljs'
import { describe, it, expect } from 'vitest'
import { buildTemplate, parseWorkbook, normalizeDate, toAmount } from './excel'

const PAYMENT_HEADERS = ['거래처명', '지급금액', '지급요청일', '은행', '계좌번호', '사업자등록번호']
const DETAIL_HEADERS = ['거래처명', '계정', '내용', '부서명', '금액', '비고']

/** 시트 이름·헤더·데이터 행을 받아 메모리에서 xlsx 버퍼를 만든다. */
async function buildWorkbookBuffer(
  sheets: { name: string; headers: string[]; rows: unknown[][] }[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name)
    ws.addRow(s.headers)
    for (const r of s.rows) ws.addRow(r)
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

describe('normalizeDate', () => {
  it('Date를 YYYY-MM-DD로 바꾼다', () => {
    expect(normalizeDate(new Date('2026-07-24T00:00:00Z'))).toBe('2026-07-24')
  })

  it('2026.07.24 형식을 받아준다', () => {
    expect(normalizeDate('2026.07.24')).toBe('2026-07-24')
  })

  it('2026/7/4 형식을 받아준다', () => {
    expect(normalizeDate('2026/7/4')).toBe('2026-07-04')
  })

  it('알 수 없는 값은 null', () => {
    expect(normalizeDate('내일')).toBeNull()
    expect(normalizeDate(null)).toBeNull()
  })
})

describe('toAmount', () => {
  it('숫자를 그대로 돌려준다', () => {
    expect(toAmount(9900000)).toBe(9900000)
  })

  it('9,900,000 같은 문자열에서 숫자만 뽑는다', () => {
    expect(toAmount('9,900,000')).toBe(9900000)
  })

  it('숫자가 없으면 null', () => {
    expect(toAmount('없음')).toBeNull()
    expect(toAmount(null)).toBeNull()
  })
})

describe('buildTemplate + parseWorkbook 왕복', () => {
  it('빈 양식을 만들고 다시 읽으면 행이 0건이다', async () => {
    const buf = await buildTemplate()
    const out = await parseWorkbook(buf)
    expect(out.payments).toEqual([])
    expect(out.details).toEqual([])
    expect(out.errors).toEqual([])
  })
})

describe('parseWorkbook', () => {
  it('지급정보 정상 2행을 읽으면 payments 2건, errors 0건이고 값이 정확히 매핑된다', async () => {
    const buf = await buildWorkbookBuffer([
      {
        name: '지급정보',
        headers: PAYMENT_HEADERS,
        rows: [
          ['㈜다우건설', 9900000, '2026.07.24', '국민은행', '123-456-789', '123-45-67890'],
          ['상수도자재', '5,000,000', '2026/7/4', '신한은행', '987-654-321', ''],
        ],
      },
      { name: '상세내용', headers: DETAIL_HEADERS, rows: [] },
    ])

    const out = await parseWorkbook(buf)

    expect(out.errors).toEqual([])
    expect(out.payments).toEqual([
      {
        vendor_name: '㈜다우건설', amount: 9900000, pay_request_date: '2026-07-24',
        bank: '국민은행', account_no: '123-456-789', business_no: '123-45-67890',
      },
      {
        vendor_name: '상수도자재', amount: 5000000, pay_request_date: '2026-07-04',
        bank: '신한은행', account_no: '987-654-321', business_no: '',
      },
    ])
  })

  it('지급금액이 숫자가 아닌 행은 payments에서 빠지고 errors에 시트·행번호·사유가 담긴다', async () => {
    const buf = await buildWorkbookBuffer([
      {
        name: '지급정보',
        headers: PAYMENT_HEADERS,
        rows: [['㈜다우건설', '금액없음', '2026.07.24', '국민은행', '123-456-789', '']],
      },
      { name: '상세내용', headers: DETAIL_HEADERS, rows: [] },
    ])

    const out = await parseWorkbook(buf)

    expect(out.payments).toEqual([])
    expect(out.errors).toEqual([{ sheet: '지급정보', row: 2, message: '지급금액 확인 필요' }])
  })

  it('지급요청일이 해석되지 않는 행은 payments에서 빠지고 errors에 시트·행번호·사유가 담긴다', async () => {
    const buf = await buildWorkbookBuffer([
      {
        name: '지급정보',
        headers: PAYMENT_HEADERS,
        rows: [['㈜다우건설', 9900000, '내일', '국민은행', '123-456-789', '']],
      },
      { name: '상세내용', headers: DETAIL_HEADERS, rows: [] },
    ])

    const out = await parseWorkbook(buf)

    expect(out.payments).toEqual([])
    expect(out.errors).toEqual([{ sheet: '지급정보', row: 2, message: '지급요청일 확인 필요' }])
  })

  it('거래처명을 포함해 완전히 빈 행은 조용히 건너뛰고 errors에도 담기지 않는다', async () => {
    const buf = await buildWorkbookBuffer([
      {
        name: '지급정보',
        headers: PAYMENT_HEADERS,
        rows: [
          ['', '', '', '', '', ''],
          ['㈜다우건설', 9900000, '2026.07.24', '국민은행', '123-456-789', ''],
        ],
      },
      { name: '상세내용', headers: DETAIL_HEADERS, rows: [] },
    ])

    const out = await parseWorkbook(buf)

    expect(out.errors).toEqual([])
    expect(out.payments).toHaveLength(1)
    expect(out.payments[0].vendor_name).toBe('㈜다우건설')
  })

  it('지급정보 시트를 찾을 수 없는 워크북은 errors에 시트 없음 메시지가 담긴다 (회귀: 문제1)', async () => {
    const buf = await buildWorkbookBuffer([
      { name: 'Sheet1', headers: ['이상한', '헤더'], rows: [['a', 'b']] },
    ])

    const out = await parseWorkbook(buf)

    expect(out.payments).toEqual([])
    expect(out.details).toEqual([])
    expect(out.errors).toEqual([
      { sheet: '지급정보', row: 0, message: '지급정보 시트를 찾을 수 없습니다' },
      { sheet: '상세내용', row: 0, message: '상세내용 시트를 찾을 수 없습니다' },
    ])
  })

  it('상세내용 시트만 있고 지급정보 시트가 없으면 지급정보만 에러로 담기고 상세내용은 정상 파싱된다', async () => {
    const buf = await buildWorkbookBuffer([
      {
        name: '상세내용',
        headers: DETAIL_HEADERS,
        rows: [['㈜다우건설', '자재비', '수도관 자재', '현장1팀', 500000, '']],
      },
    ])

    const out = await parseWorkbook(buf)

    expect(out.payments).toEqual([])
    expect(out.details).toEqual([
      { vendor_name: '㈜다우건설', account: '자재비', content: '수도관 자재', dept_name: '현장1팀', amount: 500000, note: '' },
    ])
    expect(out.errors).toEqual([
      { sheet: '지급정보', row: 0, message: '지급정보 시트를 찾을 수 없습니다' },
    ])
  })
})
