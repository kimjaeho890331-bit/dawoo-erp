import type ExcelJS from 'exceljs'

/**
 * 은행 파일(엑셀·CSV) → 글자 표(string[][]). 서버(/api/ledger/bank-import)에서 쓴다.
 * 표가 되고 나면 머리글 찾기·줄 읽기는 bankParse.ts(순수 함수)가 맡는다.
 *
 * 은행 파일은 형식이 제각각이라 여기서 맞춘다.
 * - .xlsx: 날짜 칸은 Date로 온다 → 'YYYY-MM-DD HH:MM:SS' 글자로.
 * - .csv: 은행 CSV는 대개 EUC-KR(한글 윈도우)이다. UTF-8로 먼저 읽어 보고 깨지면 EUC-KR로 다시 읽는다.
 * - .xls: 은행 「엑셀 저장」 중에는 실제로는 HTML 표인 파일이 많다. 그런 파일은 표를 읽고,
 *         진짜 옛 엑셀(.xls 바이너리)은 읽을 도구가 없어 .xlsx로 다시 저장해 달라고 안내한다.
 */

/** 너무 큰 파일로 서버가 멈추지 않게. 통장 1년치는 수천 줄이다. */
export const MAX_GRID_ROWS = 50000
export const MAX_GRID_COLS = 60

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * exceljs 날짜는 엑셀에 적힌 시각을 UTC 필드에 담아 준다 — getUTC*로 읽어야 적힌 그대로다.
 * 0시 정각이면 날짜만(시간 칸이 따로 있는 파일에서 '00:00:00'이 덧붙지 않게).
 */
export function excelDateText(d: Date): string {
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  const h = d.getUTCHours(), m = d.getUTCMinutes(), s = d.getUTCSeconds()
  if (h === 0 && m === 0 && s === 0) return date
  return `${date} ${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

/** 엑셀 칸 값 → 글자. 수식은 계산 결과, 서식 글자는 이어 붙인 글자 */
export function cellText(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return excelDateText(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'object') {
    const o = value as { result?: unknown; richText?: { text: string }[]; text?: unknown; error?: unknown }
    if ('result' in o) return cellText(o.result)
    if (Array.isArray(o.richText)) return o.richText.map(t => t.text).join('').trim()
    if (typeof o.text === 'string') return o.text.trim()
  }
  return ''
}

/** 시트 → 표. 완전히 빈 줄은 뺀다(줄 번호보다 내용이 중요하다) */
export function worksheetToGrid(ws: ExcelJS.Worksheet): string[][] {
  const grid: string[][] = []
  const lastCol = Math.min(ws.columnCount || 0, MAX_GRID_COLS)
  const lastRow = Math.min(ws.rowCount || 0, MAX_GRID_ROWS + 50)
  for (let r = 1; r <= lastRow; r++) {
    const row = ws.getRow(r)
    const cells: string[] = []
    for (let c = 1; c <= lastCol; c++) cells.push(cellText(row.getCell(c).value))
    while (cells.length > 0 && !cells[cells.length - 1]) cells.pop()
    if (cells.length > 0) grid.push(cells)
    if (grid.length >= MAX_GRID_ROWS) break
  }
  return grid
}

// ---------------- CSV ----------------

/** 바이트 → 글자. UTF-8(BOM 포함)로 읽어 보고 깨진 글자가 있으면 EUC-KR(CP949)로 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('euc-kr').decode(bytes)
  }
}

/** 첫 몇 줄에서 쉼표·탭·세미콜론 중 많이 나온 것을 구분자로 */
function guessDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 30).join('\n')
  const count = (ch: string) => sample.split(ch).length - 1
  const options: [string, number][] = [[',', count(',')], ['\t', count('\t')], [';', count(';')]]
  options.sort((a, b) => b[1] - a[1])
  return options[0][1] > 0 ? options[0][0] : ','
}

/** CSV 글자 → 표. 따옴표 안의 쉼표·줄바꿈·"" 이스케이프를 지킨다 */
export function parseCsvText(text: string, delimiter = guessDelimiter(text)): string[][] {
  const grid: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const pushRow = () => {
    row.push(field.trim())
    field = ''
    while (row.length > 0 && !row[row.length - 1]) row.pop()
    if (row.length > 0) grid.push(row.slice(0, MAX_GRID_COLS))
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field.trim()); field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      pushRow()
      if (grid.length >= MAX_GRID_ROWS) return grid
    } else {
      field += ch
    }
  }
  if (field || row.length > 0) pushRow()
  return grid
}

// ---------------- HTML 표 (.xls로 저장된 은행 파일) ----------------

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : all
    }
    return ENTITIES[code.toLowerCase()] ?? all
  })
}

/** 글자가 HTML 문서인가 (.xls라고 저장됐지만 속은 HTML인 은행 파일) */
export function looksLikeHtml(text: string): boolean {
  return /^\s*(<!doctype html|<html|<table|<meta|<head|<body)/i.test(text.slice(0, 2000)) || /<table[\s>]/i.test(text.slice(0, 20000))
}

/** HTML 안의 모든 <tr>을 줄로, <td>/<th>를 칸으로. 태그는 지우고 글자만 남긴다 */
export function parseHtmlTable(html: string): string[][] {
  const grid: string[][] = []
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  for (const tr of body.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)) {
    const cells: string[] = []
    for (const td of tr[0].matchAll(/<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi)) {
      const text = decodeEntities(td[2].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''))
        .replace(/\s+/g, ' ').trim()
      cells.push(text)
    }
    while (cells.length > 0 && !cells[cells.length - 1]) cells.pop()
    if (cells.length > 0) grid.push(cells.slice(0, MAX_GRID_COLS))
    if (grid.length >= MAX_GRID_ROWS) break
  }
  return grid
}

/** 옛 엑셀(.xls 바이너리, OLE2) 파일인가 — 첫 8바이트가 D0 CF 11 E0 A1 B1 1A E1 */
export function isOle2(bytes: Uint8Array): boolean {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  return bytes.length >= 8 && sig.every((b, i) => bytes[i] === b)
}
