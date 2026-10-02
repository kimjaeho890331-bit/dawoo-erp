import type ExcelJS from 'exceljs'
import { parseBankInfo } from '@/lib/approval/vendorBank'

/**
 * 사내 「노무비지급내역」 엑셀을 일용직 근무관리 행으로 읽는다.
 * 근무자 한 명이 두 줄(윗줄 1~15일, 아랫줄 16~31일·일급·계좌번호)이고 「소계」에서 끝난다.
 * DB에는 손대지 않는다 — 읽은 결과만 돌려준다.
 */

export const DEDUCTION_KEYS = ['income', 'resident', 'employment', 'pension', 'health', 'longterm'] as const
export type DeductionKey = (typeof DEDUCTION_KEYS)[number]
export type Deductions = Record<DeductionKey, number>

export interface ImportedLaborRow {
  worker_name: string
  resident_id: string | null
  phone: string | null
  bank_name: string | null
  account_number: string | null
  day_values: Record<string, number>
  daily_wage: number
  vehicle_cost: number | null
  payment_date: string | null
  site_name: string | null
  work_type: string | null
  note: string | null
  /** 엑셀에 적힌 공제액 그대로. 빈 칸은 0(공제 안 함). */
  deductions: Deductions
  /** 엑셀의 차감지급액. 검산용. */
  excel_net: number | null
}

export interface LaborImportResult {
  sheetName: string
  year: number
  month: number
  /** 머리글의 요율(% 단위). 하나라도 못 읽으면 null. */
  rates: Deductions | null
  rows: ImportedLaborRow[]
  warnings: string[]
}

const DEDUCTION_LABELS: Record<DeductionKey, string> = {
  income: '갑근세',
  resident: '주민세',
  employment: '고용보험',
  pension: '국민연금',
  health: '건강보험',
  longterm: '장기요양',
}

const HEADER_SCAN_ROWS = 15

function raw(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown }
    if ('result' in o) return o.result
    if (Array.isArray(o.richText)) return o.richText.map(t => t.text).join('')
    if ('formula' in o || 'sharedFormula' in o) return null
    if (typeof o.text === 'string') return o.text
    return null
  }
  return v
}

function text(cell: ExcelJS.Cell): string {
  const v = raw(cell)
  if (v == null || v instanceof Date) return ''
  return String(v).trim()
}

function num(cell: ExcelJS.Cell): number | null {
  const v = raw(cell)
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** 머리글 비교용: 공백을 모두 뺀다 ("성  명" → "성명"). */
function label(cell: ExcelJS.Cell): string {
  return text(cell).replace(/\s+/g, '')
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

function findHeaderRow(ws: ExcelJS.Worksheet): number | null {
  for (let r = 1; r <= Math.min(HEADER_SCAN_ROWS, ws.rowCount); r++) {
    let hasName = false
    let hasRid = false
    ws.getRow(r).eachCell(cell => {
      const l = label(cell)
      if (l === '성명') hasName = true
      if (l === '주민등록번호' || l === '주민번호') hasRid = true
    })
    if (hasName && hasRid) return r
  }
  return null
}

function findPeriod(ws: ExcelJS.Worksheet, headerRow: number): { year: number; month: number } | null {
  for (let r = 1; r < headerRow; r++) {
    const row = ws.getRow(r)
    let isPeriodRow = false
    row.eachCell(cell => { if (label(cell).includes('기간')) isPeriodRow = true })
    if (!isPeriodRow) continue
    let found: { year: number; month: number } | null = null
    row.eachCell(cell => {
      if (found) return
      const v = raw(cell)
      if (v instanceof Date) {
        found = { year: v.getUTCFullYear(), month: v.getUTCMonth() + 1 }
        return
      }
      const m = /(\d{4})\D+(\d{1,2})\D+\d{1,2}/.exec(String(v ?? ''))
      if (m) {
        const month = Number(m[2])
        if (month >= 1 && month <= 12) found = { year: Number(m[1]), month }
      }
    })
    if (found) return found
  }
  return null
}

interface Columns {
  name: number
  rid: number
  days: Map<number, number>   // 일(1~31) → 열
  wage: number
  vehicle: number | null
  ded: Partial<Record<DeductionKey, number>>
  net: number | null
  payDate: number | null
  site: number | null
  bank: number | null
  phone: number | null
  work: number | null
}

function mapColumns(ws: ExcelJS.Worksheet, h: number): { cols: Columns | null; rates: Deductions | null } {
  const top = ws.getRow(h)
  const bottom = ws.getRow(h + 1)
  const days = new Map<number, number>()
  const found: Record<string, number> = {}
  const ded: Partial<Record<DeductionKey, number>> = {}
  const rates: Partial<Deductions> = {}
  const lastCol = Math.max(top.cellCount, bottom.cellCount)

  for (let c = 1; c <= lastCol; c++) {
    const t = top.getCell(c)
    const b = bottom.getCell(c)
    const tn = num(t)
    const bn = num(b)
    if (tn != null && Number.isInteger(tn) && tn >= 1 && tn <= 15 && !days.has(tn)) days.set(tn, c)
    if (bn != null && Number.isInteger(bn) && bn >= 16 && bn <= 31 && !days.has(bn)) days.set(bn, c)

    for (const l of [label(t), label(b)]) {
      if (!l) continue
      const set = (key: string) => { if (found[key] == null) found[key] = c }
      if (l === '성명') set('name')
      else if (l === '주민등록번호' || l === '주민번호') set('rid')
      else if (l === '일수' || l === '일급') set('wage')
      else if (l.includes('차량')) set('vehicle')
      else if (l.includes('차감지급')) set('net')
      else if (l === '지급일') set('payDate')
      else if (l === '현장명') set('site')
      else if (l.includes('계좌') || l === '은행') set('bank')
      else if (l === '연락처') set('phone')
      else if (l.includes('공종') || l === '실제작업') set('work')
      else {
        for (const key of DEDUCTION_KEYS) {
          if (l === DEDUCTION_LABELS[key] && ded[key] == null) {
            ded[key] = c
            // 요율은 같은 열의 다른 머리글 줄에 소수로 적혀 있다 (0.027 = 2.7%)
            const rate = [tn, bn].find(n => n != null && n > 0 && n < 1)
            if (rate != null) rates[key] = Math.round(rate * 1e6) / 1e4
          }
        }
      }
    }
  }

  if (found.name == null || found.rid == null || found.wage == null || days.size === 0) {
    return { cols: null, rates: null }
  }
  const allRates = DEDUCTION_KEYS.every(k => rates[k] != null)
  return {
    cols: {
      name: found.name, rid: found.rid, days, wage: found.wage,
      vehicle: found.vehicle ?? null, ded, net: found.net ?? null,
      payDate: found.payDate ?? null, site: found.site ?? null,
      bank: found.bank ?? null, phone: found.phone ?? null, work: found.work ?? null,
    },
    rates: allRates ? (rates as Deductions) : null,
  }
}

function isSubtotalRow(row: ExcelJS.Row, nameCol: number): boolean {
  for (let c = 1; c <= nameCol; c++) {
    const l = label(row.getCell(c))
    if (l === '소계' || l === '합계' || l === '총계') return true
  }
  return false
}

function optText(row: ExcelJS.Row, col: number | null): string | null {
  if (col == null) return null
  return text(row.getCell(col)) || null
}

function readBank(top: ExcelJS.Row, bottom: ExcelJS.Row, col: number | null) {
  if (col == null) return { bank_name: null, account_number: null }
  const a = text(top.getCell(col))
  const b = text(bottom.getCell(col))
  // 두 줄로 나눠 적은 양식: 윗줄 은행, 아랫줄 계좌번호
  if (a && b && a !== b) return { bank_name: a, account_number: b }
  const one = a || b
  if (!one) return { bank_name: null, account_number: null }
  const parsed = parseBankInfo(one)
  if (parsed) return { bank_name: parsed.bank, account_number: parsed.account }
  return /\d/.test(one)
    ? { bank_name: null, account_number: one }
    : { bank_name: one, account_number: null }
}

function readPayDate(row: ExcelJS.Row, col: number | null): { payment_date: string | null; note: string | null } {
  if (col == null) return { payment_date: null, note: null }
  const v = raw(row.getCell(col))
  if (v instanceof Date) return { payment_date: ymd(v), note: null }
  const s = v == null ? '' : String(v).trim()
  if (!s) return { payment_date: null, note: null }
  const m = /^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?$/.exec(s)
  if (m) {
    return { payment_date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, note: null }
  }
  return { payment_date: null, note: `지급일: ${s}` }
}

export function parseLaborWorkbook(wb: ExcelJS.Workbook): LaborImportResult {
  const warnings: string[] = []
  let hiddenCount = 0
  let target: { ws: ExcelJS.Worksheet; headerRow: number } | null = null
  const skippedVisible: string[] = []

  for (const ws of wb.worksheets) {
    if (ws.state !== 'visible') { hiddenCount++; continue }
    const headerRow = findHeaderRow(ws)
    if (headerRow == null) continue
    if (target) skippedVisible.push(ws.name)
    else target = { ws, headerRow }
  }

  if (!target) {
    throw new Error('노무비 지급내역 양식을 찾지 못했습니다. 「성명 · 주민등록번호」 머리글이 있는 시트가 보이는 상태여야 합니다.')
  }
  const { ws, headerRow } = target

  const period = findPeriod(ws, headerRow)
  if (!period) {
    throw new Error('기간을 읽지 못했습니다. 표 위의 「기간」 칸에 "2025. 12. 01. ~ 2025. 12. 31." 형식으로 적어 주세요.')
  }
  const { year, month } = period

  const { cols, rates } = mapColumns(ws, headerRow)
  if (!cols) {
    throw new Error('노무비 지급내역 양식의 머리글(날짜 · 일급)을 읽지 못했습니다.')
  }

  if (hiddenCount > 0) warnings.push(`숨겨진 시트 ${hiddenCount}개는 읽지 않았습니다.`)
  if (skippedVisible.length > 0) {
    warnings.push(`「${ws.name}」 시트만 읽었습니다. 읽지 않은 시트: ${skippedVisible.join(', ')}`)
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const rows: ImportedLaborRow[] = []

  for (let r = headerRow + 2; r <= ws.rowCount; r += 2) {
    const top = ws.getRow(r)
    const bottom = ws.getRow(r + 1)
    if (isSubtotalRow(top, cols.name) || isSubtotalRow(bottom, cols.name)) break

    const worker_name = text(top.getCell(cols.name))
    if (!worker_name) continue

    const day_values: Record<string, number> = {}
    const dropped: number[] = []
    for (const [day, col] of [...cols.days].sort((a, b) => a[0] - b[0])) {
      const v = num((day <= 15 ? top : bottom).getCell(col))
      if (v == null || v <= 0) continue
      if (day > daysInMonth) dropped.push(day)
      else day_values[String(day)] = v
    }
    if (dropped.length > 0) {
      warnings.push(`${worker_name}: ${month}월에 없는 ${dropped.map(d => `${d}일`).join(', ')} 출역은 제외했습니다.`)
    }

    const vehicle = cols.vehicle != null ? num(top.getCell(cols.vehicle)) : null
    const deductions = {} as Deductions
    for (const key of DEDUCTION_KEYS) {
      const col = cols.ded[key]
      deductions[key] = col != null ? Math.round(num(top.getCell(col)) ?? 0) : 0
    }
    const net = cols.net != null ? num(top.getCell(cols.net)) : null

    rows.push({
      worker_name,
      resident_id: optText(top, cols.rid),
      phone: optText(top, cols.phone),
      ...readBank(top, bottom, cols.bank),
      day_values,
      daily_wage: num(bottom.getCell(cols.wage)) ?? 0,
      vehicle_cost: vehicle != null && vehicle > 0 ? vehicle : null,
      ...readPayDate(top, cols.payDate),
      site_name: optText(top, cols.site),
      work_type: optText(top, cols.work),
      deductions,
      excel_net: net != null ? Math.round(net) : null,
    })
  }

  return { sheetName: ws.name, year, month, rates, rows, warnings }
}

/**
 * 엑셀 공제액을 화면의 공제 칸 값으로 바꾼다.
 * 자동계산과 같으면 null(자동)로 두어 나중에 요율을 바꿔도 따라가게 하고,
 * 다르면 엑셀 값을 직접 입력값으로 넣어 차감지급액이 엑셀과 같게 한다.
 */
export function reconcileDeductions(excel: Deductions, auto: Deductions): Record<DeductionKey, number | null> {
  const out = {} as Record<DeductionKey, number | null>
  for (const key of DEDUCTION_KEYS) out[key] = excel[key] === auto[key] ? null : excel[key]
  return out
}

interface RowIdentity {
  worker_name: string
  site_name?: string | null
  daily_wage?: number | null
  day_values?: Record<string, number> | null
}

function dayKey(days: Record<string, number> | null | undefined): string {
  return Object.entries(days ?? {})
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([d, v]) => `${d}:${Number(v)}`)
    .join(',')
}

/** 이미 등록된 줄인지: 이름·현장·일급·출역이 모두 같을 때만 같은 줄로 본다. */
export function isSameLaborRow(a: RowIdentity, b: RowIdentity): boolean {
  return (
    a.worker_name.trim() === b.worker_name.trim() &&
    (a.site_name ?? '').trim() === (b.site_name ?? '').trim() &&
    Number(a.daily_wage ?? 0) === Number(b.daily_wage ?? 0) &&
    dayKey(a.day_values) === dayKey(b.day_values)
  )
}
