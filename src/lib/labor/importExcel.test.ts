import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseLaborWorkbook, reconcileDeductions, isSameLaborRow } from './importExcel'

// 사내 「노무비지급내역」 양식을 흉내 낸다. 이름·주민번호는 전부 가짜다.
// 근무자 한 명이 두 줄: 윗줄 1~15일, 아랫줄 16~31일 + 일급 + 계좌번호.
interface W {
  name?: string
  rid?: string
  top?: Record<number, number>      // 1~15일
  bottom?: Record<number, number>   // 16~31일
  wage?: number
  income?: unknown
  resident?: unknown
  employment?: unknown
  pension?: unknown
  net?: number
  payDate?: unknown
  site?: string
  bankTop?: string
  bankBottom?: string
  phone?: string
  work?: string
}

function addSheet(wb: ExcelJS.Workbook, name: string, opts: {
  hidden?: boolean; period?: string; workers?: W[]; noHeader?: boolean
}) {
  const ws = wb.addWorksheet(name)
  if (opts.hidden) ws.state = 'hidden'
  if (opts.noHeader) { ws.getCell('A1').value = '신분증 및 통장사본'; return ws }

  ws.getCell('B2').value = '기   간'
  ws.getCell('E2').value = opts.period ?? '2025. 12. 01. ~ 2025. 12. 31.'
  ws.getCell('B3').value = 'no'
  ws.getCell('C3').value = '성  명'
  ws.getCell('D3').value = '주민등록번호'
  for (let d = 1; d <= 15; d++) ws.getRow(3).getCell(4 + d).value = d          // E~S
  for (let d = 16; d <= 31; d++) ws.getRow(4).getCell(d - 11).value = d        // E~T
  ws.getCell('U3').value = '일수'; ws.getCell('U4').value = '일급'
  ws.getCell('V3').value = '노무비'; ws.getCell('V4').value = '총  액'
  ws.getCell('W3').value = '차량 유지비'
  ws.getCell('X3').value = 0.027; ws.getCell('X4').value = '갑근세'
  ws.getCell('Y3').value = 0.1; ws.getCell('Y4').value = '주민세'
  ws.getCell('Z3').value = 0.009; ws.getCell('Z4').value = '고용보험'
  ws.getCell('AA3').value = 0.045; ws.getCell('AA4').value = '국민연금'
  ws.getCell('AB3').value = 0.0343; ws.getCell('AB4').value = '건강보험'
  ws.getCell('AC3').value = 0.1152; ws.getCell('AC4').value = '장기요양'
  ws.getCell('AD3').value = '합계'
  ws.getCell('AE3').value = '차 감 지 급 액'
  ws.getCell('AF3').value = '지급일'
  ws.getCell('AG3').value = '현장명'
  ws.getCell('AH3').value = '은행'; ws.getCell('AH4').value = '계좌번호'
  ws.getCell('AI3').value = '연락처'
  ws.getCell('AJ3').value = '실제공종'

  let r = 5
  for (const w of opts.workers ?? []) {
    ws.getCell(`B${r}`).value = (r - 3) / 2
    if (w.name) ws.getCell(`C${r}`).value = w.name
    if (w.rid) ws.getCell(`D${r}`).value = w.rid
    for (const [d, v] of Object.entries(w.top ?? {})) ws.getRow(r).getCell(4 + Number(d)).value = v
    for (const [d, v] of Object.entries(w.bottom ?? {})) ws.getRow(r + 1).getCell(Number(d) - 11).value = v
    ws.getCell(`U${r}`).value = { formula: `SUM(E${r}:T${r + 1})`, result: undefined } as ExcelJS.CellValue
    if (w.wage !== undefined) ws.getCell(`U${r + 1}`).value = w.wage
    if (w.income !== undefined) ws.getCell(`X${r}`).value = w.income as ExcelJS.CellValue
    if (w.resident !== undefined) ws.getCell(`Y${r}`).value = w.resident as ExcelJS.CellValue
    if (w.employment !== undefined) ws.getCell(`Z${r}`).value = w.employment as ExcelJS.CellValue
    if (w.pension !== undefined) ws.getCell(`AA${r}`).value = w.pension as ExcelJS.CellValue
    if (w.net !== undefined) ws.getCell(`AE${r}`).value = { formula: `V${r}-X${r}`, result: w.net }
    if (w.payDate !== undefined) ws.getCell(`AF${r}`).value = w.payDate as ExcelJS.CellValue
    if (w.site) ws.getCell(`AG${r}`).value = w.site
    if (w.bankTop) ws.getCell(`AH${r}`).value = w.bankTop
    if (w.bankBottom) ws.getCell(`AH${r + 1}`).value = w.bankBottom
    if (w.phone) ws.getCell(`AI${r}`).value = w.phone
    if (w.work) ws.getCell(`AJ${r}`).value = w.work
    r += 2
  }
  ws.getCell(`B${r}`).value = '소   계'
  ws.getCell(`D${r + 2}`).value = '실근무일⇒ 10/1, 10/2'
  return ws
}

const f = (formula: string, result: number) => ({ formula, result })

describe('parseLaborWorkbook', () => {
  it('표준 양식에서 근무자 한 명을 읽는다', () => {
    const wb = new ExcelJS.Workbook()
    addSheet(wb, '현장A', {
      workers: [{
        name: '홍길동', rid: '900101-1000000',
        bottom: { 23: 1 }, wage: 260000,
        income: f('ROUNDDOWN(...)', 2970), resident: f('ROUNDDOWN(X5*10%,-1)', 290),
        employment: f('ROUNDDOWN(V5*0.9%,-1)', 2340),
        net: 254400, payDate: new Date(Date.UTC(2025, 11, 23)),
        site: '가나다 지점', bankTop: '하나은행', bankBottom: '111-222222-33333',
        phone: '010-0000-0000', work: '전기',
      }],
    })

    const res = parseLaborWorkbook(wb)

    expect(res.sheetName).toBe('현장A')
    expect(res.year).toBe(2025)
    expect(res.month).toBe(12)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0]).toEqual({
      worker_name: '홍길동',
      resident_id: '900101-1000000',
      phone: '010-0000-0000',
      bank_name: '하나은행',
      account_number: '111-222222-33333',
      day_values: { '23': 1 },
      daily_wage: 260000,
      vehicle_cost: null,
      payment_date: '2025-12-23',
      site_name: '가나다 지점',
      work_type: '전기',
      note: null,
      deductions: { income: 2970, resident: 290, employment: 2340, pension: 0, health: 0, longterm: 0 },
      excel_net: 254400,
    })
  })

  it('머리글의 요율을 % 단위로 돌려준다', () => {
    const wb = new ExcelJS.Workbook()
    addSheet(wb, 's', { workers: [{ name: '홍길동', wage: 100000, top: { 1: 1 } }] })
    expect(parseLaborWorkbook(wb).rates).toEqual({
      income: 2.7, resident: 10, employment: 0.9, pension: 4.5, health: 3.43, longterm: 11.52,
    })
  })

  it('윗줄(1~15일)과 아랫줄(16~31일)을 날짜로 합치고 반일도 읽는다', () => {
    const wb = new ExcelJS.Workbook()
    addSheet(wb, 's', {
      period: '2025. 11. 01. ~ 2025. 11. 30.',
      workers: [{ name: '홍길동', wage: 90000, top: { 3: 1, 15: 0.5 }, bottom: { 16: 1, 30: 1 } }],
    })
    const res = parseLaborWorkbook(wb)
    expect(res.month).toBe(11)
    expect(res.rows[0].day_values).toEqual({ '3': 1, '15': 0.5, '16': 1, '30': 1 })
  })

  it('공제 칸에 수식 대신 숫자를 직접 적은 것도 그 값으로 읽는다', () => {
    const wb = new ExcelJS.Workbook()
    addSheet(wb, 's', {
      workers: [{ name: '홍길동', wage: 400000, top: { 1: 1 }, income: f('x', 6750), employment: 0, pension: 12000 }],
    })
    expect(parseLaborWorkbook(wb).rows[0].deductions).toEqual({
      income: 6750, resident: 0, employment: 0, pension: 12000, health: 0, longterm: 0,
    })
  })

  it('숨겨진 시트와 머리글 없는 시트는 읽지 않는다', () => {
    const wb = new ExcelJS.Workbook()
    addSheet(wb, '사진', { noHeader: true })
    addSheet(wb, '옛날', { hidden: true, period: '2023. 02. 01 ~ 2023. 02. 28', workers: [{ name: '옛사람', wage: 1, top: { 1: 1 } }] })
    addSheet(wb, '이번달', { workers: [{ name: '홍길동', wage: 100000, top: { 1: 1 } }] })

    const res = parseLaborWorkbook(wb)

    expect(res.sheetName).toBe('이번달')
    expect(res.rows.map(r => r.worker_name)).toEqual(['홍길동'])
    expect(res.warnings.join(' ')).toContain('숨겨진 시트 1개')
  })

  it('은행과 계좌를 한 칸에 적은 것을 나눈다', () => {
    const wb = new ExcelJS.Workbook()
    addSheet(wb, 's', { workers: [{ name: '홍길동', wage: 90000, top: { 1: 1 }, bankTop: '국민 123456-00-123456' }] })
    const row = parseLaborWorkbook(wb).rows[0]
    expect(row.bank_name).toBe('국민')
    expect(row.account_number).toBe('123456-00-123456')
  })

  it('지급일이 날짜가 아니면 비고로 넘긴다', () => {
    const wb = new ExcelJS.Workbook()
    addSheet(wb, 's', { workers: [{ name: '홍길동', wage: 375000, top: { 2: 1 }, payDate: '02-02(350,000), 02-20(400,000)' }] })
    const row = parseLaborWorkbook(wb).rows[0]
    expect(row.payment_date).toBeNull()
    expect(row.note).toBe('지급일: 02-02(350,000), 02-20(400,000)')
  })

  it('이름 없는 줄은 건너뛰고 소계에서 멈춘다', () => {
    const wb = new ExcelJS.Workbook()
    addSheet(wb, 's', {
      workers: [
        { name: '홍길동', wage: 100000, top: { 1: 1 } },
        {},
        { name: '김철수', wage: 120000, top: { 2: 1 } },
      ],
    })
    expect(parseLaborWorkbook(wb).rows.map(r => r.worker_name)).toEqual(['홍길동', '김철수'])
  })

  it('같은 사람이 두 번 나와도 두 줄로 읽는다', () => {
    const wb = new ExcelJS.Workbook()
    addSheet(wb, 's', {
      workers: [
        { name: '홍길동', wage: 375000, top: { 2: 1 }, site: '관산초' },
        { name: '홍길동', wage: 300000, bottom: { 19: 1 }, site: '대야초' },
      ],
    })
    expect(parseLaborWorkbook(wb).rows.map(r => r.site_name)).toEqual(['관산초', '대야초'])
  })

  it('그 달에 없는 날짜는 버리고 알린다', () => {
    const wb = new ExcelJS.Workbook()
    addSheet(wb, 's', {
      period: '2025. 11. 01. ~ 2025. 11. 30.',
      workers: [{ name: '홍길동', wage: 100000, bottom: { 30: 1, 31: 1 } }],
    })
    const res = parseLaborWorkbook(wb)
    expect(res.rows[0].day_values).toEqual({ '30': 1 })
    expect(res.warnings.join(' ')).toContain('31일')
  })

  it('양식이 아닌 파일은 이유를 말하며 거부한다', () => {
    const wb = new ExcelJS.Workbook()
    addSheet(wb, '사진', { noHeader: true })
    expect(() => parseLaborWorkbook(wb)).toThrow('노무비 지급내역 양식')
  })

  it('기간을 못 읽으면 거부한다', () => {
    const wb = new ExcelJS.Workbook()
    addSheet(wb, 's', { period: '기간 미정', workers: [{ name: '홍길동', wage: 1, top: { 1: 1 } }] })
    expect(() => parseLaborWorkbook(wb)).toThrow('기간')
  })
})

describe('reconcileDeductions', () => {
  const auto = { income: 2970, resident: 290, employment: 2340, pension: 11700, health: 8910, longterm: 1020 }

  it('엑셀 값이 자동계산과 같으면 자동(null)으로, 다르면 엑셀 값으로 둔다', () => {
    const excel = { income: 2970, resident: 290, employment: 0, pension: 0, health: 0, longterm: 0 }
    expect(reconcileDeductions(excel, auto)).toEqual({
      income: null, resident: null, employment: 0, pension: 0, health: 0, longterm: 0,
    })
  })
})

describe('isSameLaborRow', () => {
  const base = { worker_name: '홍길동', site_name: '관산초', daily_wage: 300000, day_values: { '2': 1, '19': 1 } }

  it('이름·현장·일급·출역이 모두 같으면 같은 줄이다', () => {
    expect(isSameLaborRow(base, { ...base, day_values: { '19': 1, '2': 1 } })).toBe(true)
  })

  it('하나라도 다르면 다른 줄이다', () => {
    expect(isSameLaborRow(base, { ...base, site_name: '대야초' })).toBe(false)
    expect(isSameLaborRow(base, { ...base, day_values: { '2': 1 } })).toBe(false)
    expect(isSameLaborRow(base, { ...base, daily_wage: 250000 })).toBe(false)
  })

  it('현장이 비어 있는 것끼리는 같다고 본다', () => {
    expect(isSameLaborRow({ ...base, site_name: null }, { ...base, site_name: '' })).toBe(true)
  })
})
