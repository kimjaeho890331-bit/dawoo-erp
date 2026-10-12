'use client'

// 통장 거래내역 올리기 — 파일 → 서버가 표로 읽음(/api/ledger/bank-import) → 미리보기 확인 → 저장.
// 은행 파일은 양식이 제각각이라, 머리글을 못 찾으면 막다른 길 대신 「칸 직접 고르기」를 연다.
// 칸을 바꾸면 서버에 다시 보내지 않고 화면에서 바로 다시 읽는다(bankParse.ts는 순수 함수).

import { useMemo, useRef, useState, type DragEvent } from 'react'
import { FileSpreadsheet, Settings2, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isMissingTableOrColumn } from '@/lib/staff/ghost'
import {
  BANK_FIELDS,
  BANK_FIELD_LABELS,
  firstWideRow,
  isUsableMapping,
  mapHeaderColumns,
  parseBankRows,
  summarizeBankRows,
  type BankField,
  type BankImportResponse,
  type BankMapping,
} from '@/lib/ledger/bankParse'
import { shortDate, won } from '@/components/ledger/LeakSections'

/** 한 번에 넣는 줄 수. 너무 크면 요청이 무거워지고, 너무 작으면 1년치가 오래 걸린다 */
const BATCH = 500
/** DB의 중복 막는 열쇠(sql/leak_check.sql bank_transactions_dedupe)와 같아야 한다 */
const DEDUPE_KEY = 'account,tx_at,direction,amount,balance'

/** 0 → 'A', 26 → 'AA' (엑셀 열 이름 — 사용자가 엑셀 화면과 맞춰 보게) */
function colName(i: number): string {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return '다시 시도해 주세요'
}

export default function BankUpload({ onSaved, onDbMissing }: { onSaved: () => void; onDbMissing: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [file, setFile] = useState<BankImportResponse | null>(null)
  const [account, setAccount] = useState('')
  const [headerRow, setHeaderRow] = useState(0)
  const [mapping, setMapping] = useState<BankMapping>({})
  const [manual, setManual] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(
    () => (file ? parseBankRows(file.grid, headerRow, mapping, account.trim() || '통장') : null),
    [file, headerRow, mapping, account],
  )
  const summary = useMemo(() => (parsed ? summarizeBankRows(parsed.rows) : null), [parsed])
  const usable = isUsableMapping(mapping)

  // 칸 고르기 목록: 머리글 줄 아래 몇 줄에서 가장 긴 줄만큼
  const colCount = useMemo(() => {
    if (!file) return 0
    return Math.max(0, ...file.grid.slice(headerRow, headerRow + 30).map(r => r.length))
  }, [file, headerRow])

  const readFile = async (f: File) => {
    if (!/\.(xlsx|xls|csv|txt)$/i.test(f.name)) {
      setError('엑셀(.xlsx·.xls) 또는 CSV 파일만 올릴 수 있습니다')
      return
    }
    setReading(true); setError(null); setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/ledger/bank-import', { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      const data = json as BankImportResponse
      setFile(data)
      setAccount(data.accountGuess ?? '')
      if (data.headerRow !== null && isUsableMapping(data.mapping)) {
        setHeaderRow(data.headerRow)
        setMapping(data.mapping)
        setManual(false)
      } else {
        // 머리글을 못 찾음 — 칸이 셋 이상 찬 첫 줄을 머리글로 두고 직접 고르게 연다
        const h = data.headerRow ?? firstWideRow(data.grid)
        setHeaderRow(h)
        setMapping(mapHeaderColumns(data.grid[h] ?? []).mapping)
        setManual(true)
      }
    } catch (e) {
      setError(`파일을 읽지 못했습니다: ${errorMessage(e)}`)
    }
    setReading(false)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void readFile(f)
  }

  const changeHeaderRow = (r: number) => {
    if (!file) return
    setHeaderRow(r)
    setMapping(mapHeaderColumns(file.grid[r] ?? []).mapping)
  }

  const changeField = (field: BankField, value: string) => {
    setMapping(prev => {
      const next = { ...prev }
      if (value === '') delete next[field]
      else next[field] = Number(value)
      return next
    })
  }

  const cancel = () => { setFile(null); setError(null) }

  const save = async () => {
    if (!file) return
    const label = account.trim()
    if (!label) { setError('통장 이름을 적어 주세요 (예: 기업 1234)'); return }
    // 저장할 줄은 지금 화면의 통장 이름·칸으로 다시 만든다(원본 칸 raw 포함)
    const rows = parseBankRows(file.grid, headerRow, mapping, label).rows
    if (rows.length === 0) return
    setSaving(true); setError(null)
    let inserted = 0
    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        // 이미 있는 줄(같은 통장·일시·방향·금액·잔액)은 DB가 건너뛴다. 돌려받는 것은 새로 들어간 줄뿐.
        const { data, error: err } = await supabase
          .from('bank_transactions')
          .upsert(rows.slice(i, i + BATCH), { onConflict: DEDUPE_KEY, ignoreDuplicates: true })
          .select('id')
        if (err) throw err
        inserted += data?.length ?? 0
      }
      const skipped = rows.length - inserted
      setResult(skipped > 0
        ? `「${label}」 ${inserted.toLocaleString()}건 저장, ${skipped.toLocaleString()}건은 이미 있어 건너뜀`
        : `「${label}」 ${inserted.toLocaleString()}건 저장했습니다`)
      setFile(null)
      onSaved()
    } catch (e) {
      if (isMissingTableOrColumn(e as { code?: string; message?: string })) {
        onDbMissing()
        return
      }
      setError(`저장하지 못했습니다${inserted > 0 ? ` (${inserted.toLocaleString()}건까지는 저장됨 — 같은 파일을 다시 올리면 나머지만 들어갑니다)` : ''}: ${errorMessage(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {!file && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !reading && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
          className={`cursor-pointer rounded-[10px] border-2 border-dashed p-5 text-center transition-colors ${
            dragging ? 'border-accent bg-accent-light' : 'border-border-primary hover:border-border-secondary hover:bg-surface-secondary'
          }`}
        >
          {reading ? (
            <div className="text-sm text-txt-secondary">파일 읽는 중...</div>
          ) : (
            <>
              <div className="mb-2 flex justify-center"><FileSpreadsheet size={24} className="text-txt-tertiary" /></div>
              <div className="text-sm font-medium text-txt-secondary">통장 거래내역 올리기</div>
              <div className="mt-1 text-xs text-txt-tertiary">
                기업은행 인터넷뱅킹 → 조회 → 거래내역조회 → 엑셀 저장한 파일(.xlsx·.xls·.csv)
              </div>
              <div className="mt-0.5 text-xs text-txt-tertiary">1년치를 올리면 가장 정확합니다 · 같은 파일을 두 번 올려도 겹치지 않습니다</div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f) }}
          />
        </div>
      )}

      {result && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border-primary bg-surface-secondary px-4 py-2 text-sm text-txt-primary">
          <span>{result}</span>
          <button type="button" onClick={() => setResult(null)} aria-label="닫기" className="btn-icon"><X size={14} /></button>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-danger-border bg-danger-bg px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="닫기" className="btn-icon"><X size={14} /></button>
        </div>
      )}

      {file && parsed && summary && (
        <div className="overflow-hidden rounded-[10px] border border-accent bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-tertiary bg-accent-light px-4 py-3">
            <h3 className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold text-txt-primary">
              <Upload size={16} className="shrink-0 text-txt-tertiary" />
              <span className="truncate">{file.fileName}</span>
              {file.sheetName && <span className="shrink-0 text-[12px] font-normal text-txt-tertiary">({file.sheetName})</span>}
            </h3>
            <div className="flex gap-2">
              <button type="button" onClick={cancel} className="btn-secondary text-xs">취소</button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !usable || parsed.rows.length === 0 || !account.trim()}
                className="btn-primary text-xs disabled:opacity-50"
              >
                {saving ? '저장 중...' : `${parsed.rows.length.toLocaleString()}건 저장`}
              </button>
            </div>
          </div>

          <div className="space-y-3 px-4 py-3">
            {/* 통장 이름 — 여러 통장을 올려도 구분되게. 계좌번호 전체 대신 끝 4자리 */}
            <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="shrink-0 text-[13px] font-medium text-txt-secondary">통장 이름</span>
              <input
                value={account}
                onChange={e => setAccount(e.target.value)}
                placeholder="예: 기업 1234 (계좌 끝 4자리)"
                className="input-field w-full sm:max-w-[240px]"
              />
              {!account.trim() && <span className="text-[12px] text-danger">통장 이름을 적어야 저장됩니다</span>}
            </label>

            {/* 읽은 칸 */}
            <div className="text-[12px] text-txt-secondary">
              {usable && !manual ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-txt-tertiary">읽은 칸</span>
                  {BANK_FIELDS.filter(f => mapping[f] !== undefined).map(f => (
                    <span key={f}>
                      {BANK_FIELD_LABELS[f]}: <b className="font-medium text-txt-primary">{file.grid[headerRow]?.[mapping[f]!] || `${colName(mapping[f]!)}열`}</b>
                    </span>
                  ))}
                  <button type="button" onClick={() => setManual(true)} className="btn-inline inline-flex items-center gap-1">
                    <Settings2 size={12} /> 칸 직접 고르기
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-border-primary bg-surface-secondary p-3">
                  <div className="mb-2 text-[13px] text-txt-primary">
                    {file.headerRow === null
                      ? '머리글(거래일시·출금·입금…)을 찾지 못했습니다. 아래에서 어느 칸이 무엇인지 골라 주세요.'
                      : '어느 칸이 무엇인지 고릅니다. 날짜와 출금(또는 입금)은 꼭 골라야 합니다.'}
                  </div>
                  <label className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <span className="shrink-0 text-txt-tertiary">머리글 줄</span>
                    <select
                      value={headerRow}
                      onChange={e => changeHeaderRow(Number(e.target.value))}
                      className="input-field w-full text-[12px] sm:max-w-[420px]"
                    >
                      {file.grid.slice(0, 30).map((row, i) => (
                        <option key={i} value={i}>{i + 1}번째 줄: {row.filter(Boolean).join(' | ').slice(0, 60)}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {BANK_FIELDS.map(f => (
                      <label key={f} className="flex flex-col gap-0.5">
                        <span className="text-txt-tertiary">
                          {BANK_FIELD_LABELS[f]}{(f === 'date' || f === 'out') && <span className="text-danger"> *</span>}
                        </span>
                        <select
                          value={mapping[f] ?? ''}
                          onChange={e => changeField(f, e.target.value)}
                          className="input-field text-[12px]"
                        >
                          <option value="">(없음)</option>
                          {Array.from({ length: colCount }, (_, c) => {
                            const head = file.grid[headerRow]?.[c] ?? ''
                            const sample = file.grid[headerRow + 1]?.[c] ?? ''
                            return (
                              <option key={c} value={c}>
                                {colName(c)}열{head ? ` ${head}` : ''}{sample ? ` (예: ${sample.slice(0, 16)})` : ''}
                              </option>
                            )
                          })}
                        </select>
                      </label>
                    ))}
                  </div>
                  {!usable && <div className="mt-2 text-danger">날짜 칸과 출금(또는 입금) 칸을 골라 주세요.</div>}
                  {usable && file.headerRow !== null && (
                    <button type="button" onClick={() => setManual(false)} className="btn-inline mt-2">고르기 닫기</button>
                  )}
                </div>
              )}
              {file.unmapped.length > 0 && !manual && (
                <div className="mt-1 text-txt-tertiary">읽지 않은 칸: {file.unmapped.join(', ')}</div>
              )}
            </div>

            {/* 요약 */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-txt-secondary tabular-nums">
              {summary.from && <span>{summary.from} ~ {summary.to}</span>}
              <span>나간 돈 {summary.outCount.toLocaleString()}건 {won(summary.outTotal)}</span>
              <span>들어온 돈 {summary.inCount.toLocaleString()}건 {won(summary.inTotal)}</span>
              {parsed.skipped > 0 && <span className="text-txt-tertiary">날짜·금액 없는 {parsed.skipped}줄은 뺌(합계 줄 등)</span>}
            </div>
          </div>

          {/* 미리보기 — 폰에서는 옆으로 밀어 본다 */}
          {parsed.rows.length === 0 ? (
            <div className="border-t border-border-tertiary px-4 py-6 text-center text-[13px] text-txt-tertiary">
              읽은 줄이 없습니다. 칸을 다시 골라 보세요.
            </div>
          ) : (
            <div className="max-h-[320px] overflow-auto border-t border-border-tertiary">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border-primary bg-surface-secondary">
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-tertiary">일시</th>
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-tertiary">받는 분·내용</th>
                    <th className="px-3 py-2 text-right text-[11px] font-medium text-txt-tertiary">나간 돈</th>
                    <th className="px-3 py-2 text-right text-[11px] font-medium text-txt-tertiary">들어온 돈</th>
                    <th className="px-3 py-2 text-right text-[11px] font-medium text-txt-tertiary">잔액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-secondary">
                  {parsed.rows.slice(0, 100).map((r, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap px-3 py-2 text-[12px] text-txt-secondary tabular-nums">
                        {shortDate(r.tx_at.slice(0, 10))} {r.tx_at.slice(11, 16)}
                      </td>
                      <td className="px-3 py-2 text-[13px] text-txt-primary">
                        {[r.counterparty, r.description].filter(Boolean).join(' · ') || '-'}
                        {r.memo && <span className="ml-1 text-[12px] text-txt-tertiary">({r.memo})</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-[13px] tabular-nums text-txt-primary">{r.direction === 'out' ? won(r.amount) : ''}</td>
                      <td className="px-3 py-2 text-right text-[13px] tabular-nums text-txt-secondary">{r.direction === 'in' ? won(r.amount) : ''}</td>
                      <td className="px-3 py-2 text-right text-[12px] tabular-nums text-txt-tertiary">{r.balance !== null ? won(r.balance) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 100 && (
                <div className="py-2 text-center text-xs text-txt-tertiary">외 {(parsed.rows.length - 100).toLocaleString()}건 더 있음</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
