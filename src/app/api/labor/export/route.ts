import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

// 일용노무비지급명세서 엑셀 생성 (기존 사내 양식 '노무비지급내역' 재현)
// 컬럼: B no | C 성명 | D 주민번호 | E~T 날짜(1~15/16~31) | U 일수/일급 | V 노무비/총액 | W 차량유지비
//       X~AC 공제6종(갑근세~장기요양) | AD 합계 | AE 차감지급액 | AF 지급일 | AG 현장명 | AH 계좌번호 | AI 연락처 | AJ 공종

interface LaborRow {
  worker_name: string
  resident_id: string | null
  phone: string | null
  bank_name: string | null
  account_number: string | null
  day_values: Record<string, number>
  daily_wage: number | null
  vehicle_cost: number | null
  payment_date: string | null
  site_name: string | null
  work_type: string | null
  ded_income_tax: number | null
  ded_resident_tax: number | null
  ded_employment: number | null
  ded_pension: number | null
  ded_health: number | null
  ded_longterm: number | null
}

const THIN = { style: 'thin' as const, color: { argb: 'FF999999' } }
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
const MONEY = '#,##0'

interface LaborRates {
  income: number; resident: number; employment: number
  pension: number; health: number; longterm: number
}

const DEFAULT_RATES: LaborRates = { income: 2.7, resident: 10, employment: 0.9, pension: 4.5, health: 3.43, longterm: 11.52 }

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { year: number; month: number; rates?: LaborRates; records: LaborRow[] }
    const { year, month, records } = body
    const rates = { ...DEFAULT_RATES, ...(body.rates || {}) }
    if (!year || !month || !Array.isArray(records) || records.length === 0) {
      return new NextResponse('요청 데이터가 올바르지 않습니다.', { status: 400 })
    }
    const lastDay = new Date(year, month, 0).getDate()

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(`${month}월`, { views: [{ showGridLines: false }] })

    // 열 너비
    const widths: Record<string, number> = {
      A: 1.5, B: 4, C: 9, D: 15, U: 8.5, V: 11, W: 8, AD: 10, AE: 11, AF: 11, AG: 12, AH: 17, AI: 13, AJ: 12,
    }
    for (const col of ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T']) widths[col] = 3.6
    for (const col of ['X', 'Y', 'Z', 'AA', 'AB', 'AC']) widths[col] = 8.5
    Object.entries(widths).forEach(([col, w]) => { ws.getColumn(col).width = w })

    // 제목/기간/상호
    ws.getCell('C1').value = '인력'
    ws.getCell('C1').font = { name: '맑은 고딕', size: 16, bold: true }
    ws.mergeCells('B2:D2')
    ws.getCell('B2').value = '기     간'
    ws.mergeCells('E2:S2')
    ws.getCell('E2').value = `${year} . ${month}. 01.  ~  ${year} . ${month}. ${lastDay}.`
    ws.mergeCells('AE2:AJ2')
    ws.getCell('AE2').value = ' ㈜ 다우건설'
    ws.getCell('AE2').font = { name: '맑은 고딕', size: 11, bold: true }

    // 헤더 (3~4행)
    const mergeV = (col: string) => ws.mergeCells(`${col}3:${col}4`)
    ws.getCell('B3').value = 'no'; mergeV('B')
    ws.getCell('C3').value = '성    명'; mergeV('C')
    ws.getCell('D3').value = '주민등록번호'; mergeV('D')
    const dayCols = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T']
    dayCols.forEach((col, i) => {
      if (i < 15) ws.getCell(`${col}3`).value = i + 1
      ws.getCell(`${col}4`).value = i + 16
    })
    ws.getCell('U3').value = '일수'; ws.getCell('U4').value = '일급'
    ws.getCell('V3').value = '노무비'; ws.getCell('V4').value = '총    액'
    ws.getCell('W3').value = '차량\n유지비'; mergeV('W')
    const rateHeader: [string, number, string][] = [
      ['X', rates.income / 100, '갑근세'], ['Y', rates.resident / 100, '주민세'], ['Z', rates.employment / 100, '고용보험'],
      ['AA', rates.pension / 100, '국민연금'], ['AB', rates.health / 100, '건강보험'], ['AC', rates.longterm / 100, '장기요양'],
    ]
    rateHeader.forEach(([col, rate, label]) => {
      ws.getCell(`${col}3`).value = rate
      ws.getCell(`${col}4`).value = label
    })
    ws.getCell('AD3').value = '합계'; mergeV('AD')
    ws.getCell('AE3').value = '차    감\n지 급 액'; mergeV('AE')
    ws.getCell('AF3').value = '지급일'; mergeV('AF')
    ws.getCell('AG3').value = '현장명'; mergeV('AG')
    ws.getCell('AH3').value = '계좌번호'; mergeV('AH')
    ws.getCell('AI3').value = '연락처'; mergeV('AI')
    ws.getCell('AJ3').value = '공종'; mergeV('AJ')

    // 데이터 (5행부터 근무자당 2행)
    records.forEach((r, i) => {
      const r0 = 5 + i * 2
      const r1 = r0 + 1
      const mergePair = (col: string) => ws.mergeCells(`${col}${r0}:${col}${r1}`)

      ws.getCell(`B${r0}`).value = i + 1; mergePair('B')
      ws.getCell(`C${r0}`).value = r.worker_name; mergePair('C')
      ws.getCell(`D${r0}`).value = r.resident_id || ''; mergePair('D')

      // 날짜 값
      Object.entries(r.day_values || {}).forEach(([dayStr, v]) => {
        const day = Number(dayStr)
        if (!v || day < 1 || day > 31) return
        const col = dayCols[day <= 15 ? day - 1 : day - 16]
        const row = day <= 15 ? r0 : r1
        ws.getCell(`${col}${row}`).value = v
      })

      ws.getCell(`U${r0}`).value = { formula: `SUM(E${r0}:T${r1})` }
      ws.getCell(`U${r1}`).value = r.daily_wage ?? null
      ws.getCell(`U${r1}`).numFmt = MONEY
      ws.getCell(`V${r0}`).value = { formula: `U${r0}*U${r1}` }; mergePair('V')
      ws.getCell(`W${r0}`).value = r.vehicle_cost ?? null; mergePair('W')

      // 공제: 수동값 있으면 값, 없으면 수식(갑근세/주민세/고용보험) 또는 빈칸(연금/건강/장기요양)
      const ded = (col: string, override: number | null, formula: string | null) => {
        const cell = ws.getCell(`${col}${r0}`)
        if (override != null) cell.value = override
        else if (formula) cell.value = { formula }
        mergePair(col)
        cell.numFmt = MONEY
      }
      ded('X', r.ded_income_tax, `ROUNDDOWN(IF((U${r1}-150000)*$X$3<1000,0,(U${r1}-150000)*$X$3*U${r0}),-1)`)
      ded('Y', r.ded_resident_tax, `ROUNDDOWN(X${r0}*$Y$3,-1)`)
      ded('Z', r.ded_employment, `ROUNDDOWN(V${r0}*$Z$3,-1)`)
      ded('AA', r.ded_pension, `ROUNDDOWN(V${r0}*$AA$3,-1)`)
      ded('AB', r.ded_health, `ROUNDDOWN(V${r0}*$AB$3,-1)`)
      ded('AC', r.ded_longterm, `ROUNDDOWN(AB${r0}*$AC$3,-1)`)

      ws.getCell(`AD${r0}`).value = { formula: `SUM(X${r0}:AC${r1})` }; mergePair('AD')
      ws.getCell(`AE${r0}`).value = { formula: `V${r0}-X${r0}-Y${r0}-Z${r0}-AA${r0}-AB${r0}-AC${r0}` }; mergePair('AE')
      ws.getCell(`AF${r0}`).value = r.payment_date || ''; mergePair('AF')
      ws.getCell(`AG${r0}`).value = r.site_name || ''; mergePair('AG')
      ws.getCell(`AH${r0}`).value = [r.bank_name, r.account_number].filter(Boolean).join('\n'); mergePair('AH')
      ws.getCell(`AI${r0}`).value = r.phone || ''; mergePair('AI')
      ws.getCell(`AJ${r0}`).value = r.work_type || ''; mergePair('AJ')
    })

    const lastRow = 4 + records.length * 2

    // 합계 행
    const sumRow = lastRow + 1
    ws.mergeCells(`B${sumRow}:D${sumRow}`)
    ws.getCell(`B${sumRow}`).value = '합    계'
    const vCells = records.map((_, i) => `V${5 + i * 2}`).join(',')
    const adCells = records.map((_, i) => `AD${5 + i * 2}`).join(',')
    const aeCells = records.map((_, i) => `AE${5 + i * 2}`).join(',')
    ws.getCell(`V${sumRow}`).value = { formula: `SUM(${vCells})` }
    ws.getCell(`AD${sumRow}`).value = { formula: `SUM(${adCells})` }
    ws.getCell(`AE${sumRow}`).value = { formula: `SUM(${aeCells})` }

    // 공통 스타일: 테두리/폰트/정렬
    for (let row = 3; row <= sumRow; row++) {
      for (let col = 2; col <= 36; col++) {
        const cell = ws.getRow(row).getCell(col)
        cell.border = BORDER
        cell.font = cell.font?.bold ? cell.font : { name: '맑은 고딕', size: 9 }
        const colLetter = ws.getColumn(col).letter
        if (row <= 4) {
          cell.fill = HEADER_FILL
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          cell.font = { name: '맑은 고딕', size: 9, bold: true }
        } else {
          const isMoney = ['U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE'].includes(colLetter)
          cell.alignment = {
            horizontal: isMoney ? 'right' : 'center',
            vertical: 'middle', wrapText: true,
          }
          if (isMoney && !cell.numFmt) cell.numFmt = MONEY
        }
      }
    }
    ws.getRow(sumRow).font = { name: '맑은 고딕', size: 9, bold: true }

    const buf = await wb.xlsx.writeBuffer()
    return new NextResponse(Buffer.from(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`노무비지급내역_${month}월.xlsx`)}`,
      },
    })
  } catch (err) {
    console.error('엑셀 생성 실패:', err)
    return new NextResponse('엑셀 생성 중 오류가 발생했습니다.', { status: 500 })
  }
}
