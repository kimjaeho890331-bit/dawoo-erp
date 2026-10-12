import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { cellText, decodeText, excelDateText, isOle2, looksLikeHtml, parseCsvText, parseHtmlTable, worksheetToGrid } from './bankFile'
import { analyzeBankGrid } from './bankParse'

describe('parseCsvText', () => {
  it('따옴표 안의 쉼표·줄바꿈·"" 를 지킨다', () => {
    const text = '거래일시,출금,거래내용\r\n2026-10-08,"1,000","KT ""요금"""\r\n2026-10-09,"2,000","여러\n줄"\r\n'
    expect(parseCsvText(text)).toEqual([
      ['거래일시', '출금', '거래내용'],
      ['2026-10-08', '1,000', 'KT "요금"'],
      ['2026-10-09', '2,000', '여러\n줄'],
    ])
  })

  it('탭으로 나뉜 파일도 읽고 빈 줄은 뺀다', () => {
    expect(parseCsvText('a\tb\n\n1\t2\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('decodeText', () => {
  it('UTF-8(BOM 포함)은 그대로', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('거래일시')])
    expect(decodeText(bytes)).toBe('거래일시')
  })

  it('EUC-KR(한글 윈도우 CSV)도 읽는다', () => {
    // '출금' = C3E2 B1DD (EUC-KR)
    expect(decodeText(new Uint8Array([0xc3, 0xe2, 0xb1, 0xdd]))).toBe('출금')
  })
})

describe('HTML 표(.xls로 저장된 은행 파일)', () => {
  const html = `<html><head><meta charset="euc-kr"></head><body>
    <table><tr><td colspan="3">거래내역조회</td></tr>
    <tr><th>거래일시</th><th>출금</th><th>입금</th><th>거래내용</th></tr>
    <tr><td class="d">2026.10.08 14:22:01</td><td>55,000</td><td>&nbsp;</td><td>KT&amp;G <b>요금</b></td></tr>
    </table></body></html>`

  it('HTML인지 알아본다', () => {
    expect(looksLikeHtml(html)).toBe(true)
    expect(looksLikeHtml('거래일시,출금\n2026-10-08,1000')).toBe(false)
  })

  it('<tr>/<td>를 표로, 태그·엔터티를 글자로', () => {
    const grid = parseHtmlTable(html)
    expect(grid).toEqual([
      ['거래내역조회'],
      ['거래일시', '출금', '입금', '거래내용'],
      ['2026.10.08 14:22:01', '55,000', '', 'KT&G 요금'],
    ])
    const a = analyzeBankGrid(grid, '기업 1')
    expect(a.rows).toEqual([expect.objectContaining({ amount: 55000, description: 'KT&G 요금', direction: 'out' })])
  })

  it('진짜 옛 엑셀(.xls 바이너리)은 알아본다', () => {
    expect(isOle2(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toBe(true)
    expect(isOle2(new TextEncoder().encode('<html>'))).toBe(false)
  })
})

describe('엑셀(.xlsx) → 표', () => {
  it('날짜 칸은 적힌 시각 그대로(UTC 필드), 0시는 날짜만', () => {
    expect(excelDateText(new Date(Date.UTC(2026, 9, 8, 14, 22, 1)))).toBe('2026-10-08 14:22:01')
    expect(excelDateText(new Date(Date.UTC(2026, 9, 8)))).toBe('2026-10-08')
  })

  it('수식 결과·서식 글자·숫자', () => {
    expect(cellText({ formula: 'A1+1', result: 55000 })).toBe('55000')
    expect(cellText({ richText: [{ text: 'KT' }, { text: '요금' }] })).toBe('KT요금')
    expect(cellText(1234.5)).toBe('1234.5')
    expect(cellText(null)).toBe('')
  })

  it('제목 줄 + 머리글 + Date 칸이 있는 시트를 읽어 줄로 바꾼다', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('거래내역')
    ws.getCell('A1').value = '거래내역조회'
    ws.getCell('A2').value = '계좌번호'
    ws.getCell('B2').value = '123-456789-01-012'
    ws.addRow([])
    ws.getRow(4).values = ['거래일시', '출금', '입금', '거래후잔액', '거래내용']
    ws.getRow(5).values = [new Date(Date.UTC(2026, 9, 8, 14, 22, 1)), 55000, null, 1000000, 'KT통신요금']
    ws.getRow(6).values = ['2026.10.09 09:00:00', '-', '3,000,000', 4000000, '수원시']
    // 저장했다 다시 연다 — 실제 업로드처럼
    const buf = await wb.xlsx.writeBuffer()
    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(buf)
    const grid = worksheetToGrid(wb2.worksheets[0])
    expect(grid[0]).toEqual(['거래내역조회'])
    expect(grid[2]).toEqual(['거래일시', '출금', '입금', '거래후잔액', '거래내용'])
    expect(grid[3]).toEqual(['2026-10-08 14:22:01', '55000', '', '1000000', 'KT통신요금'])

    const a = analyzeBankGrid(grid)
    expect(a.headerRow).toBe(2)
    expect(a.accountGuess).toBe('기업 1012')
    expect(a.rows.map(r => [r.tx_at, r.direction, r.amount, r.balance])).toEqual([
      ['2026-10-08T14:22:01+09:00', 'out', 55000, 1000000],
      ['2026-10-09T09:00:00+09:00', 'in', 3000000, 4000000],
    ])
  })
})
