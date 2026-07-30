import ExcelJS from 'exceljs'
import type { PaymentRow, DetailRow } from '@/types/approval'

const PAYMENT_SHEET = '지급정보'
const DETAIL_SHEET = '상세내용'

const PAYMENT_HEADERS = ['거래처명', '지급금액', '지급요청일', '은행', '계좌번호', '사업자등록번호']
const DETAIL_HEADERS = ['거래처명', '계정', '내용', '부서명', '금액', '비고']

export interface ParseError {
  sheet: string
  row: number
  message: string
}

/** 엑셀 날짜를 YYYY-MM-DD로 정규화한다. 실패하면 null. */
export function normalizeDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value !== 'string') return null

  const m = value.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/)
  if (!m) return null
  const [, y, mo, d] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** 금액을 숫자로. 쉼표는 무시한다. 실패하면 null. */
export function toAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const digits = value.replace(/[,\s원]/g, '')
  if (!/^-?\d+$/.test(digits)) return null
  return Number(digits)
}

/** 빈 업로드 양식을 만든다. */
export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  const ps = wb.addWorksheet(PAYMENT_SHEET)
  ps.addRow(PAYMENT_HEADERS)
  ps.getRow(1).font = { bold: true }
  ps.columns = PAYMENT_HEADERS.map(() => ({ width: 20 }))

  const ds = wb.addWorksheet(DETAIL_SHEET)
  ds.addRow(DETAIL_HEADERS)
  ds.getRow(1).font = { bold: true }
  ds.columns = DETAIL_HEADERS.map(() => ({ width: 18 }))

  return Buffer.from(await wb.xlsx.writeBuffer())
}

function cellText(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'text' in v) return String((v as { text: string }).text).trim()
  return String(v).trim()
}

/**
 * 업로드된 xlsx를 읽어 행 배열을 만든다.
 * DB에 바로 쓰지 않는다 — 화면 표에 채워 넣고 사용자가 확인·수정한 뒤 저장한다.
 * 실패한 행은 버리지 않고 errors에 어느 행이 왜 실패했는지 담아 돌려준다.
 */
export async function parseWorkbook(buffer: Buffer): Promise<{
  payments: PaymentRow[]
  details: DetailRow[]
  errors: ParseError[]
}> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)

  const payments: PaymentRow[] = []
  const details: DetailRow[] = []
  const errors: ParseError[] = []

  const ps = wb.getWorksheet(PAYMENT_SHEET)
  if (!ps) {
    errors.push({ sheet: PAYMENT_SHEET, row: 0, message: `${PAYMENT_SHEET} 시트를 찾을 수 없습니다` })
  } else {
    ps.eachRow((row, n) => {
      if (n === 1) return
      const vendor = cellText(row, 1)
      if (!vendor) return   // 완전히 빈 행은 조용히 건너뛴다

      const amount = toAmount(row.getCell(2).value)
      const date = normalizeDate(row.getCell(3).value)
      const bank = cellText(row, 4)
      const account = cellText(row, 5)

      const missing: string[] = []
      if (amount === null) missing.push('지급금액')
      if (date === null) missing.push('지급요청일')
      if (!bank) missing.push('은행')
      if (!account) missing.push('계좌번호')

      if (missing.length > 0) {
        errors.push({ sheet: PAYMENT_SHEET, row: n, message: `${missing.join(', ')} 확인 필요` })
        return
      }

      payments.push({
        vendor_name: vendor, amount: amount!, pay_request_date: date!,
        bank, account_no: account, business_no: cellText(row, 6),
      })
    })
  }

  const ds = wb.getWorksheet(DETAIL_SHEET)
  if (!ds) {
    errors.push({ sheet: DETAIL_SHEET, row: 0, message: `${DETAIL_SHEET} 시트를 찾을 수 없습니다` })
  } else {
    ds.eachRow((row, n) => {
      if (n === 1) return
      const cells = [1, 2, 3, 4, 6].map(c => cellText(row, c))
      const amountRaw = row.getCell(5).value
      if (cells.every(c => !c) && (amountRaw === null || amountRaw === undefined)) return

      const amount = amountRaw === null || amountRaw === undefined ? 0 : toAmount(amountRaw)
      if (amount === null) {
        errors.push({ sheet: DETAIL_SHEET, row: n, message: '금액이 숫자가 아닙니다' })
        return
      }

      details.push({
        vendor_name: cells[0], account: cells[1], content: cells[2],
        dept_name: cells[3], amount, note: cells[4],
      })
    })
  }

  return { payments, details, errors }
}
