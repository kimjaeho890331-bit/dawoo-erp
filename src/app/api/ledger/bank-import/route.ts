import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getAuthUser } from '@/lib/auth'
import {
  decodeText,
  isOle2,
  looksLikeHtml,
  parseCsvText,
  parseHtmlTable,
  worksheetToGrid,
} from '@/lib/ledger/bankFile'
import { analyzeBankGrid, detectHeaderRow, type BankImportResponse } from '@/lib/ledger/bankParse'

// 통장 거래내역 파일(.xlsx·.csv·은행 .xls) → 미리보기.
// 읽기만 한다. DB 저장은 화면에서 대표가 미리보기·통장 이름을 확인한 뒤 화면이 따로 한다
// (노무비 엑셀 가져오기와 같은 방식 — 잘못 읽은 파일이 확인 없이 쌓이지 않게).

const MAX_BYTES = 15 * 1024 * 1024
/** 통장 1년치는 수천 줄. 이보다 크면 응답이 무거워 화면이 멈춘다 — 기간을 나눠 올리게 한다. */
const MAX_ROWS = 20000

const XLS_HELP = '옛 엑셀(.xls) 파일은 바로 읽지 못합니다. 엑셀에서 열어 「다른 이름으로 저장 → Excel 통합 문서(.xlsx)」로 저장한 뒤 올려 주세요.'

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status })
}

/** 시트가 여러 개면 머리글을 찾은 첫 시트, 없으면 내용이 있는 첫 시트(숨긴 시트 제외) */
function pickSheet(wb: ExcelJS.Workbook): { grid: string[][]; sheetName: string | null } {
  let fallback: { grid: string[][]; sheetName: string | null } | null = null
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== 'visible') continue
    const grid = worksheetToGrid(ws)
    if (grid.length === 0) continue
    if (detectHeaderRow(grid) !== null) return { grid, sheetName: ws.name }
    fallback ??= { grid, sheetName: ws.name }
  }
  return fallback ?? { grid: [], sheetName: null }
}

async function readXlsx(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  return pickSheet(wb)
}

/** 글자 파일: 속이 HTML이면 표로, 아니면 CSV(쉼표·탭) */
function readText(bytes: Uint8Array): string[][] {
  const text = decodeText(bytes)
  return looksLikeHtml(text) ? parseHtmlTable(text) : parseCsvText(text)
}

export async function POST(req: NextRequest) {
  // 미들웨어도 막지만, 거래내역은 민감하므로 여기서 한 번 더 확인한다
  const user = await getAuthUser()
  if (!user) return bad('로그인이 필요합니다', 401)

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return bad('통장 거래내역 파일을 선택해 주세요.')
  if (file.size > MAX_BYTES) return bad('파일이 너무 큽니다. (15MB 이하)')

  const name = file.name.toLowerCase()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b   // 'PK' — .xlsx는 zip이다

  let grid: string[][] = []
  let sheetName: string | null = null
  try {
    if (name.endsWith('.xlsx') || (name.endsWith('.xls') && isZip)) {
      ({ grid, sheetName } = await readXlsx(bytes))
    } else if (name.endsWith('.xls')) {
      // 은행 「엑셀 저장」 .xls는 속이 HTML 표인 경우가 많다. 진짜 옛 엑셀(바이너리)만 안내한다.
      if (isOle2(bytes)) return bad(XLS_HELP)
      grid = readText(bytes)
    } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
      grid = readText(bytes)
    } else {
      return bad('엑셀(.xlsx) 또는 CSV 파일만 읽을 수 있습니다.')
    }
  } catch {
    return bad('파일을 열지 못했습니다. 파일이 손상됐거나 암호가 걸려 있을 수 있습니다. (암호를 풀고 다시 저장해 주세요)')
  }

  if (grid.length === 0) return bad('파일에서 표를 찾지 못했습니다. 은행에서 받은 거래내역 파일이 맞는지 확인해 주세요.')
  if (grid.length > MAX_ROWS) return bad(`줄이 너무 많습니다(${grid.length.toLocaleString()}줄). 기간을 나눠 6개월씩 올려 주세요.`)

  const analysis = analyzeBankGrid(grid)
  const body: BankImportResponse = {
    fileName: file.name,
    sheetName,
    grid,
    headerRow: analysis.headerRow,
    mapping: analysis.mapping,
    unmapped: analysis.unmapped,
    skipped: analysis.skipped,
    accountGuess: analysis.accountGuess,
    // 원본 칸(raw)은 표(grid)와 같은 내용이라 응답을 가볍게 하려고 뺀다 — 화면이 저장할 때 표에서 다시 만든다
    rows: analysis.rows.map(r => ({
      account: r.account, tx_at: r.tx_at, direction: r.direction, amount: r.amount, balance: r.balance,
      counterparty: r.counterparty, description: r.description, memo: r.memo,
    })),
  }
  return NextResponse.json(body)
}
