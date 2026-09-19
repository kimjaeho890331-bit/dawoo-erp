import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

// 접수대장 엑셀 내보내기 — 화면에서 필터된 목록을 그대로 표로 생성

interface ExportRow {
  staff_name: string
  building_name: string
  dong: string
  ho: string
  owner_name: string
  owner_phone: string
  road_address: string
  city_name: string
  program: string
  status: string
  receipt_date: string
  survey_date: string
  approval_received_date: string
  construction_date: string
  total_cost: number
  collected: number
  outstanding: number
  note: string
}

const THIN = { style: 'thin' as const, color: { argb: 'FF999999' } }
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
const MONEY = '#,##0'

const COLUMNS: { key: keyof ExportRow; label: string; width: number; money?: boolean }[] = [
  { key: 'staff_name', label: '담당', width: 8 },
  { key: 'building_name', label: '빌라명', width: 16 },
  { key: 'dong', label: '동', width: 6 },
  { key: 'ho', label: '호', width: 6 },
  { key: 'owner_name', label: '소유주', width: 10 },
  { key: 'owner_phone', label: '연락처', width: 14 },
  { key: 'road_address', label: '주소', width: 30 },
  { key: 'city_name', label: '지역', width: 8 },
  { key: 'program', label: '지원사업/종류', width: 14 },
  { key: 'status', label: '단계', width: 11 },
  { key: 'receipt_date', label: '접수일', width: 11 },
  { key: 'survey_date', label: '실측일', width: 11 },
  { key: 'approval_received_date', label: '승인일', width: 11 },
  { key: 'construction_date', label: '시공일', width: 11 },
  { key: 'total_cost', label: '총공사비', width: 12, money: true },
  { key: 'collected', label: '수금액', width: 12, money: true },
  { key: 'outstanding', label: '미수금', width: 12, money: true },
  { key: 'note', label: '상담내역', width: 30 },
]

export async function POST(req: NextRequest) {
  try {
    const { category, yearLabel, statusLabel, rows } = (await req.json()) as {
      category: string; yearLabel: string; statusLabel: string; rows: ExportRow[]
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return new NextResponse('내보낼 데이터가 없습니다.', { status: 400 })
    }

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(`${category} 접수대장`, { views: [{ state: 'frozen', ySplit: 3 }] })

    COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })

    // 제목/조건
    ws.getCell('A1').value = `${category} 접수대장`
    ws.getCell('A1').font = { name: '맑은 고딕', size: 14, bold: true }
    ws.getCell('A2').value = `기준: ${yearLabel} / ${statusLabel} / 총 ${rows.length}건 (생성일 ${new Date().toISOString().slice(0, 10)})`
    ws.getCell('A2').font = { name: '맑은 고딕', size: 9, color: { argb: 'FF777777' } }

    // 헤더
    const headerRow = ws.getRow(3)
    COLUMNS.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = c.label
      cell.fill = HEADER_FILL
      cell.font = { name: '맑은 고딕', size: 9, bold: true }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = BORDER
    })

    // 데이터
    rows.forEach((r, ri) => {
      const row = ws.getRow(4 + ri)
      COLUMNS.forEach((c, ci) => {
        const cell = row.getCell(ci + 1)
        cell.value = c.money ? (r[c.key] as number) || 0 : String(r[c.key] ?? '')
        cell.font = { name: '맑은 고딕', size: 9 }
        cell.border = BORDER
        cell.alignment = { horizontal: c.money ? 'right' : 'left', vertical: 'middle', wrapText: false }
        if (c.money) cell.numFmt = MONEY
      })
    })

    // 합계 행
    const sumRowIdx = 4 + rows.length
    const sumRow = ws.getRow(sumRowIdx)
    sumRow.getCell(1).value = '합계'
    COLUMNS.forEach((c, ci) => {
      const cell = sumRow.getCell(ci + 1)
      cell.border = BORDER
      cell.font = { name: '맑은 고딕', size: 9, bold: true }
      cell.fill = HEADER_FILL
      if (c.money) {
        const colLetter = ws.getColumn(ci + 1).letter
        cell.value = { formula: `SUM(${colLetter}4:${colLetter}${sumRowIdx - 1})` }
        cell.numFmt = MONEY
        cell.alignment = { horizontal: 'right' }
      }
    })

    const buf = await wb.xlsx.writeBuffer()
    const filename = `${category}접수대장_${yearLabel}.xlsx`
    return new NextResponse(Buffer.from(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (err) {
    console.error('접수대장 엑셀 생성 실패:', err)
    return new NextResponse('엑셀 생성 중 오류가 발생했습니다.', { status: 500 })
  }
}
