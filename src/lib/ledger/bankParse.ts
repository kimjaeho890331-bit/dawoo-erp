/**
 * 통장 거래내역(기업은행 엑셀·CSV)을 DB에 넣을 줄로 바꾸는 순수 함수.
 *
 * 파일을 여는 일(엑셀·CSV → 글자 표)은 서버(src/lib/ledger/bankFile.ts)가 하고,
 * 여기서는 「글자 표(string[][])」만 다룬다. 그래서 화면에서도 그대로 불러 쓸 수 있다 —
 * 머리글을 못 찾았을 때 사용자가 칸을 직접 고르면, 서버에 다시 보내지 않고 화면에서 바로 다시 읽는다.
 *
 * 은행 엑셀은 맨 위에 제목·계좌번호·조회기간 같은 줄이 몇 줄 있고 그 아래에 머리글이 온다.
 * 은행·메뉴마다 머리글 이름이 조금씩 달라(거래일시/거래일자, 출금/찾으신금액 …) 낱말로 찾는다.
 */

export const BANK_FIELDS = ['date', 'time', 'out', 'in', 'balance', 'counterparty', 'description', 'memo'] as const
export type BankField = (typeof BANK_FIELDS)[number]

/** 칸 번호(0부터). 없는 칸은 빠진다. */
export type BankMapping = Partial<Record<BankField, number>>

export const BANK_FIELD_LABELS: Record<BankField, string> = {
  date: '날짜',
  time: '시간',
  out: '출금(나간 돈)',
  in: '입금(들어온 돈)',
  balance: '잔액',
  counterparty: '받는 분·상대',
  description: '거래내용',
  memo: '메모',
}

/** DB에 넣을 한 줄 (bank_transactions에서 id·created_at 뺀 것) */
export interface ParsedBankRow {
  account: string
  tx_at: string               // '2026-10-08T14:22:01+09:00' — 한국 시각
  direction: 'out' | 'in'
  amount: number              // 늘 양수
  balance: number | null
  counterparty: string | null
  description: string | null
  memo: string | null
  raw: Record<string, string>
}

// ---------------- 머리글 찾기 ----------------

interface FieldRule {
  field: BankField
  include: string[]
  exclude?: string[]
}

/**
 * 머리글 낱말 규칙. 위에서부터 차례로 본다(먼저 맞는 것이 이긴다).
 * - 잔액을 먼저 본다: '거래후잔액'이 다른 규칙에 걸리지 않게.
 * - 출금·입금은 '입금자명'·'출금은행'·'상대계좌번호' 같은 칸을 금액으로 잘못 잡지 않게 뺄 낱말을 둔다.
 * - '상대'는 '상대계좌번호'·'상대은행'이 아니라 '상대계좌예금주명' 같은 이름 칸만.
 */
const FIELD_RULES: FieldRule[] = [
  { field: 'balance', include: ['잔액', 'balance'] },
  { field: 'memo', include: ['메모', '비고', 'memo'] },
  { field: 'time', include: ['거래시간', '시간', '시각', 'time'], exclude: ['일시'] },
  { field: 'date', include: ['거래일시', '거래일자', '거래일', '일시', '날짜', '일자', 'date'], exclude: ['기산'] },
  { field: 'out', include: ['출금', '찾으신', '지급'], exclude: ['은행', '계좌', '명', '자', '처', '번호', '구분', '일'] },
  { field: 'in', include: ['입금', '맡기신'], exclude: ['은행', '계좌', '명', '자', '처', '번호', '구분', '일'] },
  {
    field: 'counterparty',
    include: ['받는분', '보낸분', '받는사람', '보낸사람', '예금주', '상대방', '상대', '입금자', '의뢰인', '거래처'],
    exclude: ['번호', '은행', '코드'],
  },
  { field: 'description', include: ['거래내용', '적요', '기재내용', '내용', '통장표시', '표시내용'], exclude: ['구분'] },
]

/** 머리글 비교용: 공백·괄호 속 단위('(원)')를 빼고 소문자로 */
export function normalizeHeader(h: string | null | undefined): string {
  return (h ?? '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/** 머리글 한 칸이 어느 항목인가. 머리글이 아닌 긴 글(거래내용 값 등)은 null */
export function matchHeaderField(header: string): BankField | null {
  const h = normalizeHeader(header)
  // 머리글은 짧다. 긴 글은 데이터 칸(거래내용 등)이므로 머리글로 보지 않는다.
  if (!h || h.length > 14) return null
  for (const rule of FIELD_RULES) {
    if (!rule.include.some(k => h.includes(k))) continue
    if (rule.exclude?.some(k => h.includes(k))) continue
    return rule.field
  }
  return null
}

/** 머리글 줄의 칸들을 항목에 짝짓는다. 같은 항목이 두 번 나오면 앞의 것. 짝 못 지은 머리글은 unmapped */
export function mapHeaderColumns(headerCells: string[]): { mapping: BankMapping; unmapped: string[] } {
  const mapping: BankMapping = {}
  const unmapped: string[] = []
  headerCells.forEach((cell, i) => {
    const text = (cell ?? '').trim()
    if (!text) return
    const field = matchHeaderField(text)
    if (field && mapping[field] === undefined) mapping[field] = i
    else unmapped.push(text)
  })
  return { mapping, unmapped }
}

/** 읽을 수 있는 짝인가: 날짜와 금액(출금 또는 입금)은 꼭 있어야 한다 */
export function isUsableMapping(m: BankMapping): boolean {
  return m.date !== undefined && (m.out !== undefined || m.in !== undefined)
}

/**
 * 맨 위 몇 줄 중 머리글 줄을 찾는다(0부터). 못 찾으면 null — 화면이 「칸 직접 고르기」를 연다.
 * 날짜·금액 칸이 있고 항목이 셋 이상 맞는 첫 줄. 데이터 줄이 우연히 낱말 하나 둘에 걸려도
 * (거래내용 '이자입금' 등) 셋이 동시에 맞기는 어렵다.
 */
export function detectHeaderRow(grid: string[][], maxScan = 30): number | null {
  const limit = Math.min(maxScan, grid.length)
  for (let r = 0; r < limit; r++) {
    const { mapping } = mapHeaderColumns(grid[r] ?? [])
    if (isUsableMapping(mapping) && Object.keys(mapping).length >= 3) return r
  }
  return null
}

/** 머리글을 못 찾았을 때 「칸 직접 고르기」의 첫 머리글 줄: 칸이 셋 이상 찬 첫 줄 */
export function firstWideRow(grid: string[][]): number {
  const i = grid.findIndex(row => row.filter(c => (c ?? '').trim()).length >= 3)
  return i >= 0 ? i : 0
}

// ---------------- 값 읽기 ----------------

/**
 * 금액 글자 → 숫자. 쉼표·'원'·공백을 무시한다. 빈 칸·'-'는 null(0이 아니라 '없음').
 * '(1,000)'은 회계식 음수.
 */
export function parseAmount(s: string | null | undefined): number | null {
  let t = (s ?? '').trim()
  if (!t || /^[-−–—]$/.test(t)) return null
  let negative = false
  const paren = /^\((.*)\)$/.exec(t)
  if (paren) { negative = true; t = paren[1] }
  t = t.replace(/[,\s원₩]/g, '').replace(/^[−–—]/, '-')
  if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function parseTime(s: string | null | undefined): string | null {
  const t = (s ?? '').trim()
  if (!t) return null
  const m = /^(\d{1,2}):?(\d{2})(?::?(\d{2}))?$/.exec(t)
  if (!m) return null
  const hh = Number(m[1]), mm = Number(m[2]), ss = Number(m[3] ?? 0)
  if (hh > 23 || mm > 59 || ss > 59) return null
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`
}

export interface ParsedDateTime {
  date: string          // 'YYYY-MM-DD'
  time: string | null   // 'HH:MM:SS'
}

/**
 * 날짜(+시간) 글자 → { date, time }. 못 읽으면 null.
 * '2026.10.08 14:22:01', '2026-10-08', '2026/10/08 14:22', '20261008', '20261008142201',
 * '2026년 10월 8일', '26.10.08', 엑셀 날짜 일련번호(46303.5)를 읽는다.
 * 시간이 따로 칸에 있으면 timeText로 받는다(거래일자 + 거래시간).
 */
export function parseDateTime(text: string | null | undefined, timeText?: string | null): ParsedDateTime | null {
  const s = (text ?? '').trim()
  if (!s) return null
  let y: number, mo: number, d: number
  let time: string | null = null

  // 일 뒤 공백은 '일' 글자가 있을 때만 먹는다 — 그냥 \s*로 두면 시간 앞 공백까지 삼켜 시간을 놓친다
  let m = /^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:\s*일)?\.?(?:[T\s]+(\d{1,2}:\d{2}(?::\d{2})?))?/.exec(s)
  if (m) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3])
    time = m[4] ? parseTime(m[4]) : null
  } else if ((m = /^(\d{4})(\d{2})(\d{2})(?:\s*(\d{2}:?\d{2}(?::?\d{2})?))?$/.exec(s))) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3])
    time = m[4] ? parseTime(m[4]) : null
  } else if ((m = /^(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/.exec(s))) {
    y = 2000 + Number(m[1]); mo = Number(m[2]); d = Number(m[3])
    time = m[4] ? parseTime(m[4]) : null
  } else if (/^\d{5}(\.\d+)?$/.test(s)) {
    // 엑셀 날짜 일련번호(1900 체계). 25569 = 1970-01-01. 30000~80000(1982~2119)만 날짜로 본다.
    const serial = Number(s)
    if (serial < 30000 || serial > 80000) return null
    const ms = Math.round((serial - 25569) * 86400000)
    const dt = new Date(ms)
    y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate()
    const secs = dt.getUTCHours() * 3600 + dt.getUTCMinutes() * 60 + dt.getUTCSeconds()
    time = secs > 0 ? `${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}:${pad2(dt.getUTCSeconds())}` : null
  } else {
    return null
  }
  if (!validDate(y, mo, d)) return null
  if (timeText != null && timeText.trim()) time = parseTime(timeText) ?? time
  return { date: `${y}-${pad2(mo)}-${pad2(d)}`, time }
}

/** DB에 넣을 일시. 은행 파일의 시각은 한국 시각이므로 +09:00을 붙인다(서버·브라우저 시간대와 무관) */
export function toTxAt(dt: ParsedDateTime): string {
  return `${dt.date}T${dt.time ?? '00:00:00'}+09:00`
}

// ---------------- 줄 읽기 ----------------

export interface ParseBankResult {
  rows: ParsedBankRow[]
  /** 날짜나 금액이 없어 건너뛴 줄 수(합계 줄·빈 줄 제외한 실제 내용이 있는 줄) */
  skipped: number
}

function cellAt(row: string[], col: number | undefined): string {
  if (col === undefined) return ''
  return (row[col] ?? '').trim()
}

/**
 * 머리글 아래 줄들을 DB 줄로. 날짜를 못 읽는 줄(합계·안내문)과 금액이 없는 줄은 건너뛴다.
 * 한 줄에 출금과 입금이 둘 다 있으면(드묾) 두 줄로 나눈다 — 열쇠에 방향이 들어 있어 겹치지 않는다.
 */
export function parseBankRows(
  grid: string[][],
  headerRow: number,
  mapping: BankMapping,
  account: string,
): ParseBankResult {
  const header = grid[headerRow] ?? []
  const rows: ParsedBankRow[] = []
  let skipped = 0
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    if (!row.some(c => (c ?? '').trim())) continue
    const dt = parseDateTime(cellAt(row, mapping.date), mapping.time !== undefined ? cellAt(row, mapping.time) : null)
    const outAmt = Math.abs(parseAmount(cellAt(row, mapping.out)) ?? 0)
    const inAmt = Math.abs(parseAmount(cellAt(row, mapping.in)) ?? 0)
    if (!dt || (outAmt === 0 && inAmt === 0)) { skipped++; continue }

    const raw: Record<string, string> = {}
    row.forEach((c, i) => {
      const v = (c ?? '').trim()
      if (v) raw[(header[i] ?? '').trim() || `열${i + 1}`] = v
    })
    const base = {
      account,
      tx_at: toTxAt(dt),
      balance: parseAmount(cellAt(row, mapping.balance)),
      counterparty: cellAt(row, mapping.counterparty) || null,
      description: cellAt(row, mapping.description) || null,
      memo: cellAt(row, mapping.memo) || null,
      raw,
    }
    if (outAmt > 0) rows.push({ ...base, direction: 'out', amount: outAmt })
    if (inAmt > 0) rows.push({ ...base, direction: 'in', amount: inAmt })
  }
  return { rows, skipped }
}

export interface BankRowsSummary {
  count: number
  outCount: number
  outTotal: number
  inCount: number
  inTotal: number
  from: string | null   // 'YYYY-MM-DD'
  to: string | null
}

/** 미리보기 맨 아래 합계 줄 */
export function summarizeBankRows(rows: ParsedBankRow[]): BankRowsSummary {
  const s: BankRowsSummary = { count: rows.length, outCount: 0, outTotal: 0, inCount: 0, inTotal: 0, from: null, to: null }
  for (const r of rows) {
    if (r.direction === 'out') { s.outCount++; s.outTotal += r.amount }
    else { s.inCount++; s.inTotal += r.amount }
    const d = r.tx_at.slice(0, 10)
    if (s.from === null || d < s.from) s.from = d
    if (s.to === null || d > s.to) s.to = d
  }
  return s
}

// ---------------- 한 번에 ----------------

export interface BankGridAnalysis {
  /** 머리글 줄(0부터). 못 찾았으면 null — 화면이 칸을 직접 고르게 한다 */
  headerRow: number | null
  mapping: BankMapping
  /** 머리글 중 어느 항목에도 짝짓지 못한 칸(상대계좌번호·CMS코드 등). 화면에 「읽지 않은 칸」으로 보인다 */
  unmapped: string[]
  rows: ParsedBankRow[]
  skipped: number
  /** 제목 줄의 계좌번호로 만든 통장 이름 기본값('기업 1234'). 못 찾으면 null */
  accountGuess: string | null
}

/** POST /api/ledger/bank-import 응답. 저장은 화면이 grid에서 다시 읽은 줄로 한다(통장 이름·칸을 고친 뒤) */
export interface BankImportResponse extends Omit<BankGridAnalysis, 'rows'> {
  fileName: string
  sheetName: string | null
  grid: string[][]
  rows: Omit<ParsedBankRow, 'raw'>[]
}

/**
 * 표 하나를 처음 읽을 때: 머리글 찾기 → 칸 짝짓기 → 줄 읽기.
 * account가 비었으면 제목 줄에서 찾은 이름(없으면 '통장')을 임시로 쓴다 — 화면에서 확인·수정한 뒤 저장한다.
 */
export function analyzeBankGrid(grid: string[][], account?: string): BankGridAnalysis {
  const headerRow = detectHeaderRow(grid)
  const accountGuess = guessAccountLabel(grid, headerRow)
  if (headerRow === null) {
    return { headerRow: null, mapping: {}, unmapped: [], rows: [], skipped: 0, accountGuess }
  }
  const { mapping, unmapped } = mapHeaderColumns(grid[headerRow])
  const { rows, skipped } = parseBankRows(grid, headerRow, mapping, account?.trim() || accountGuess || '통장')
  return { headerRow, mapping, unmapped, rows, skipped, accountGuess }
}

// ---------------- 통장 이름 ----------------

const BANK_NAMES: [RegExp, string][] = [
  [/기업|ibk/i, '기업'], [/국민|kb/i, '국민'], [/신한/, '신한'], [/우리/, '우리'],
  [/하나/, '하나'], [/농협|nh/i, '농협'],
]

/**
 * 머리글 위 제목 줄에서 계좌번호를 찾아 통장 이름 기본값을 만든다('기업 1234').
 * 계좌번호 전체는 DB·화면에 남기지 않는다 — 끝 4자리만으로 통장을 구분하기에 충분하다.
 * 못 찾으면 null(화면에서 직접 적는다).
 */
export function guessAccountLabel(grid: string[][], headerRow: number | null): string | null {
  const end = Math.min(headerRow ?? 10, grid.length)
  const text = grid.slice(0, end).map(r => r.join(' ')).join(' ')
  // 계좌번호는 10~14자리. 제목 줄의 조회기간('2026-01-01')은 8자리라 걸러진다.
  // '계좌' 낱말 바로 뒤의 번호를 먼저 보고, 없으면 하이픈으로 나뉜 긴 번호를 본다.
  const candidates: string[] = []
  const near = /계좌[^\d]{0,15}([\d][\d -]{8,22}\d)/.exec(text)
  if (near) candidates.push(near[1])
  for (const m of text.matchAll(/\d{2,6}-\d{2,7}-\d{2,7}(?:-\d{1,6})?/g)) candidates.push(m[0])
  const digits = candidates.map(c => c.replace(/\D/g, '')).find(d => d.length >= 10 && d.length <= 16)
  if (!digits) return null
  const bank = BANK_NAMES.find(([re]) => re.test(text))?.[1] ?? '기업'
  return `${bank} ${digits.slice(-4)}`
}
