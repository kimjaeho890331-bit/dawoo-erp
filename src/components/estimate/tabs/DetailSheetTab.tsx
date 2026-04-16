'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { WorkType, DetailRow } from '../estimateTypes'
import { WORK_TYPE_LABELS } from '../estimateTypes'
import { calcDetailRow, calcDetailSubtotal, calcWasteTotal, formatNumber } from '../estimateCalc'
import { DETAIL_TEMPLATES, type DetailTemplateRow } from '../estimateData'

// ── ID 생성 ──

function genId(): string {
  return Math.random().toString(36).slice(2, 9)
}

// ── 인라인 편집 셀 ──

function EditableCell({
  value,
  onChange,
  type = 'text',
  readOnly = false,
  align = 'left',
  className: extraClass = '',
}: {
  value: string | number
  onChange: (v: string) => void
  type?: 'text' | 'number'
  readOnly?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'

  if (readOnly) {
    return (
      <td
        className={`border border-border-primary px-1.5 py-1 text-[12px] bg-surface-secondary ${alignClass} tabular-nums ${extraClass}`}
      >
        {type === 'number' && typeof value === 'number' ? formatNumber(value) : value}
      </td>
    )
  }

  if (editing) {
    return (
      <td className={`border border-border-primary px-0 py-0 ${extraClass}`}>
        <input
          autoFocus
          type={type}
          step={type === 'number' ? 'any' : undefined}
          className={`w-full px-1.5 py-1 text-[12px] outline-none bg-accent/5 ${alignClass} tabular-nums`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false)
            onChange(draft)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              setEditing(false)
              onChange(draft)
            }
            if (e.key === 'Escape') {
              setEditing(false)
              setDraft(String(value))
            }
          }}
        />
      </td>
    )
  }

  const displayValue =
    type === 'number' && typeof value === 'number'
      ? value === 0
        ? ''
        : formatNumber(value)
      : value || ''

  return (
    <td
      className={`border border-border-primary px-1.5 py-1 text-[12px] bg-surface cursor-pointer hover:bg-accent/5 ${alignClass} tabular-nums ${extraClass}`}
      onClick={() => setEditing(true)}
    >
      {displayValue || '\u00A0'}
    </td>
  )
}

// ── 읽기 전용 금액 셀 ──

function AmountCell({
  value,
  bold = false,
  className: extraClass = '',
}: {
  value: number
  bold?: boolean
  className?: string
}) {
  return (
    <td
      className={`border border-border-primary px-1.5 py-1 text-[12px] text-right bg-surface-secondary tabular-nums ${
        bold ? 'font-semibold' : ''
      } ${extraClass}`}
    >
      {value === 0 ? '-' : formatNumber(value)}
    </td>
  )
}

// ── 템플릿에서 DetailRow 생성 ──

function templateToRows(template: DetailTemplateRow[], area: number): DetailRow[] {
  return template.map(t => {
    let quantity = 0
    if (t.defaultQty != null) {
      quantity = t.defaultQty
    } else if (t.areaRatio != null) {
      quantity = Math.round(area * t.areaRatio * 100) / 100
    }

    const row: DetailRow = {
      id: genId(),
      name: t.name,
      spec: t.spec,
      quantity,
      unit: t.unit,
      materialPrice: t.materialPrice,
      materialAmount: 0,
      laborPrice: t.laborPrice,
      laborAmount: 0,
      expensePrice: t.expensePrice,
      expenseAmount: 0,
      total: 0,
      memo: t.qtyNote || '',
      isManual: false,
      isWaste: t.isWaste,
      areaRatio: t.areaRatio ?? null,
    }
    return calcDetailRow(row)
  })
}

// ── 메인 컴포넌트 ──

interface Props {
  workType: WorkType
  rows: DetailRow[]
  onRowsChange: (rows: DetailRow[]) => void
  area: number
}

export default function DetailSheetTab({ workType, rows, onRowsChange, area }: Props) {
  const label = WORK_TYPE_LABELS[workType]
  const initialized = useRef(false)

  // 템플릿 자동 채우기: rows가 비어 있으면 템플릿으로 초기화
  useEffect(() => {
    if (rows.length === 0 && !initialized.current) {
      const template = DETAIL_TEMPLATES[workType]
      if (template && template.length > 0) {
        initialized.current = true
        onRowsChange(templateToRows(template, area))
      }
    }
  }, [workType, rows.length, area, onRowsChange])

  // workType 변경 시 ref 리셋
  useEffect(() => {
    initialized.current = false
  }, [workType])

  // 행 금액 재계산 후 반환
  const recalcAndUpdate = useCallback(
    (updatedRows: DetailRow[]) => {
      onRowsChange(updatedRows.map(r => calcDetailRow(r)))
    },
    [onRowsChange],
  )

  // 셀 값 변경
  const updateField = useCallback(
    (rowId: string, field: keyof DetailRow, value: string | number) => {
      const updated = rows.map(r => {
        if (r.id !== rowId) return r
        return { ...r, [field]: value }
      })
      recalcAndUpdate(updated)
    },
    [rows, recalcAndUpdate],
  )

  // 폐기물 행 추가 (폐기물만 추가 가능)
  const addWasteRow = useCallback(() => {
    const newRow: DetailRow = {
      id: genId(),
      name: '',
      spec: '',
      quantity: 0,
      unit: 'EA',
      materialPrice: 0,
      materialAmount: 0,
      laborPrice: 0,
      laborAmount: 0,
      expensePrice: 0,
      expenseAmount: 0,
      total: 0,
      memo: '',
      isManual: true,
      isWaste: true,
    }
    onRowsChange([...rows, newRow])
  }, [rows, onRowsChange])

  // 폐기물 행 삭제 (수기 추가한 폐기물만 삭제 가능)
  const removeWasteRow = useCallback(
    (rowId: string) => {
      onRowsChange(rows.filter(r => r.id !== rowId))
    },
    [rows, onRowsChange],
  )

  // 일반 행과 폐기물 행 분리
  const normalRows = useMemo(() => rows.filter(r => !r.isWaste), [rows])
  const wasteRows = useMemo(() => rows.filter(r => r.isWaste), [rows])

  // 소계
  const subtotal = useMemo(() => calcDetailSubtotal(rows), [rows])
  const wasteTotal = useMemo(() => calcWasteTotal(rows), [rows])

  // areaRatio 변경 핸들러: 비율 변경 시 수량도 재계산
  const updateAreaRatio = useCallback(
    (rowId: string, newPercent: number) => {
      const updated = rows.map(r => {
        if (r.id !== rowId) return r
        const newRatio = newPercent / 100
        const newQty = Math.round(area * newRatio * 100) / 100
        return { ...r, areaRatio: newRatio, quantity: newQty, spec: `${newPercent}%` }
      })
      recalcAndUpdate(updated)
    },
    [rows, area, recalcAndUpdate],
  )

  // 테이블 행 렌더링
  const renderRow = (row: DetailRow, index: number) => {
    // 템플릿 행인 경우: name/spec/unit 읽기 전용
    const isTemplate = !row.isManual
    // areaRatio가 있고 1이 아닌 경우 = 편집 가능한 비율 행
    const hasEditableRatio = isTemplate && row.areaRatio != null && row.areaRatio !== 1 && row.areaRatio > 0

    return (
      <tr key={row.id}>
        {/* 순번 */}
        <td className="border border-border-primary px-1.5 py-1 text-center text-[12px] bg-surface-secondary tabular-nums w-[36px]">
          {index + 1}
        </td>

        {/* 공종/품명 - 템플릿은 읽기 전용 */}
        {isTemplate ? (
          <td className="border border-border-primary px-1.5 py-1 text-[12px] bg-surface-secondary">
            {row.name}
          </td>
        ) : (
          <EditableCell
            value={row.name}
            onChange={v => updateField(row.id, 'name', v)}
          />
        )}

        {/* 규격 - areaRatio < 1 인 행은 편집 가능 % 입력 */}
        {hasEditableRatio ? (
          <td className="border border-border-primary px-0 py-0 w-[72px]">
            <div className="flex items-center">
              <input
                type="number"
                step="1"
                min="1"
                max="100"
                className="w-full px-1.5 py-1 text-[12px] text-right outline-none bg-amber-50/50 tabular-nums focus:bg-amber-100/60"
                value={Math.round((row.areaRatio ?? 0) * 100)}
                onChange={e => {
                  const val = parseInt(e.target.value, 10)
                  if (!isNaN(val) && val >= 0 && val <= 100) {
                    updateAreaRatio(row.id, val)
                  }
                }}
                title="면적 비율 (%) - 수정 가능"
              />
              <span className="pr-1.5 text-[11px] text-txt-tertiary bg-amber-50/50">%</span>
            </div>
          </td>
        ) : isTemplate ? (
          <td className="border border-border-primary px-1.5 py-1 text-[12px] bg-surface-secondary w-[72px]">
            {row.spec || '\u00A0'}
          </td>
        ) : (
          <EditableCell
            value={row.spec}
            onChange={v => updateField(row.id, 'spec', v)}
            className="w-[72px]"
          />
        )}

        {/* 수량 - 항상 편집 가능 */}
        <EditableCell
          value={row.quantity}
          type="number"
          align="right"
          onChange={v => updateField(row.id, 'quantity', parseFloat(v) || 0)}
          className="w-[60px]"
        />

        {/* 단위 - 템플릿은 읽기 전용 */}
        {isTemplate ? (
          <td className="border border-border-primary px-1.5 py-1 text-[12px] text-center bg-surface-secondary w-[40px]">
            {row.unit}
          </td>
        ) : (
          <EditableCell
            value={row.unit}
            align="center"
            onChange={v => updateField(row.id, 'unit', v)}
            className="w-[40px]"
          />
        )}

        {/* 재료비 단가 - 항상 편집 가능 */}
        <EditableCell
          value={row.materialPrice}
          type="number"
          align="right"
          onChange={v => updateField(row.id, 'materialPrice', parseFloat(v) || 0)}
          className="w-[80px]"
        />

        {/* 재료비 금액 */}
        <AmountCell value={row.materialAmount} className="w-[88px]" />

        {/* 노무비 단가 - 항상 편집 가능 */}
        <EditableCell
          value={row.laborPrice}
          type="number"
          align="right"
          onChange={v => updateField(row.id, 'laborPrice', parseFloat(v) || 0)}
          className="w-[80px]"
        />

        {/* 노무비 금액 */}
        <AmountCell value={row.laborAmount} className="w-[88px]" />

        {/* 경비 단가 - 항상 편집 가능 */}
        <EditableCell
          value={row.expensePrice}
          type="number"
          align="right"
          onChange={v => updateField(row.id, 'expensePrice', parseFloat(v) || 0)}
          className="w-[80px]"
        />

        {/* 경비 금액 */}
        <AmountCell value={row.expenseAmount} className="w-[88px]" />

        {/* 합계 */}
        <AmountCell value={row.total} bold className="w-[96px]" />

        {/* 비고 */}
        <td className="border border-border-primary px-1.5 py-1 text-[11px] text-txt-quaternary w-[72px]">
          {row.memo || '\u00A0'}
        </td>

        {/* 삭제: 수기 추가 폐기물만 삭제 가능 */}
        {row.isManual && row.isWaste ? (
          <td className="border border-border-primary px-1 py-1 text-center w-[28px]">
            <button
              onClick={() => removeWasteRow(row.id)}
              className="text-[#dc2626]/40 hover:text-[#dc2626] text-[12px] leading-none"
              title="삭제"
            >
              &times;
            </button>
          </td>
        ) : (
          <td className="border border-border-primary px-1 py-1 w-[28px]" />
        )}
      </tr>
    )
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary">
          {label} 내역서
          <span className="ml-2 text-[11px] font-normal text-txt-tertiary tabular-nums">
            (적용면적: {area.toLocaleString()} m&sup2;)
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={addWasteRow}
            className="px-3 py-1 text-[11px] border border-border-secondary text-txt-tertiary rounded-lg hover:bg-surface-secondary transition-colors"
          >
            + 폐기물 추가
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-secondary text-[11px]">
              <th className="border border-border-primary px-1.5 py-2 text-center w-[36px]">순번</th>
              <th className="border border-border-primary px-1.5 py-2 text-left min-w-[120px]">공종/품명</th>
              <th className="border border-border-primary px-1.5 py-2 text-left w-[72px]">규격</th>
              <th className="border border-border-primary px-1.5 py-2 text-right w-[60px]">수량</th>
              <th className="border border-border-primary px-1.5 py-2 text-center w-[40px]">단위</th>
              <th className="border border-border-primary px-1.5 py-2 text-right w-[80px]">재료비단가</th>
              <th className="border border-border-primary px-1.5 py-2 text-right w-[88px]">재료비금액</th>
              <th className="border border-border-primary px-1.5 py-2 text-right w-[80px]">노무비단가</th>
              <th className="border border-border-primary px-1.5 py-2 text-right w-[88px]">노무비금액</th>
              <th className="border border-border-primary px-1.5 py-2 text-right w-[80px]">경비단가</th>
              <th className="border border-border-primary px-1.5 py-2 text-right w-[88px]">경비금액</th>
              <th className="border border-border-primary px-1.5 py-2 text-right w-[96px]">합계</th>
              <th className="border border-border-primary px-1.5 py-2 text-left w-[72px]">비고</th>
              <th className="border border-border-primary px-1 py-2 text-center w-[28px]"></th>
            </tr>
          </thead>
          <tbody>
            {/* 일반 행 */}
            {normalRows.map((row, i) => renderRow(row, i))}

            {/* 일반 소계 */}
            <tr className="bg-accent/5 font-semibold text-[12px]">
              <td
                colSpan={6}
                className="border border-border-primary px-2 py-1.5 text-right"
              >
                소계 (폐기물 제외)
              </td>
              <td className="border border-border-primary px-1.5 py-1.5 text-right tabular-nums">
                {formatNumber(subtotal.material)}
              </td>
              <td className="border border-border-primary px-1.5 py-1.5"></td>
              <td className="border border-border-primary px-1.5 py-1.5 text-right tabular-nums">
                {formatNumber(subtotal.labor)}
              </td>
              <td className="border border-border-primary px-1.5 py-1.5"></td>
              <td className="border border-border-primary px-1.5 py-1.5 text-right tabular-nums">
                {formatNumber(subtotal.expense)}
              </td>
              <td className="border border-border-primary px-1.5 py-1.5 text-right tabular-nums">
                {formatNumber(subtotal.total)}
              </td>
              <td className="border border-border-primary px-1.5 py-1.5"></td>
              <td className="border border-border-primary px-1 py-1.5"></td>
            </tr>

            {/* 폐기물 구분선 */}
            <tr>
              <td
                colSpan={14}
                className="border-x border-border-primary px-2 py-2 bg-surface-secondary"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 border-t border-dashed border-border-secondary" />
                  <span className="text-[11px] font-medium text-txt-tertiary">
                    폐기물처리
                  </span>
                  <div className="flex-1 border-t border-dashed border-border-secondary" />
                </div>
              </td>
            </tr>

            {/* 폐기물 행 */}
            {wasteRows.map((row, i) => renderRow(row, normalRows.length + i))}

            {/* 폐기물이 없으면 안내 */}
            {wasteRows.length === 0 && (
              <tr>
                <td
                  colSpan={14}
                  className="border border-border-primary px-2 py-3 text-center text-[11px] text-txt-quaternary"
                >
                  폐기물 항목이 없습니다. 위 &quot;+ 폐기물 추가&quot; 버튼으로 추가하세요.
                </td>
              </tr>
            )}

            {/* 폐기물 소계 */}
            {wasteRows.length > 0 && (
              <tr className="bg-surface-secondary font-semibold text-[12px]">
                <td
                  colSpan={6}
                  className="border border-border-primary px-2 py-1.5 text-right"
                >
                  폐기물 소계
                </td>
                <td className="border border-border-primary px-1.5 py-1.5 text-right tabular-nums">
                  {formatNumber(
                    wasteRows.reduce((s, r) => s + r.materialAmount, 0),
                  )}
                </td>
                <td className="border border-border-primary px-1.5 py-1.5"></td>
                <td className="border border-border-primary px-1.5 py-1.5 text-right tabular-nums">
                  {formatNumber(
                    wasteRows.reduce((s, r) => s + r.laborAmount, 0),
                  )}
                </td>
                <td className="border border-border-primary px-1.5 py-1.5"></td>
                <td className="border border-border-primary px-1.5 py-1.5 text-right tabular-nums">
                  {formatNumber(
                    wasteRows.reduce((s, r) => s + r.expenseAmount, 0),
                  )}
                </td>
                <td className="border border-border-primary px-1.5 py-1.5 text-right tabular-nums">
                  {formatNumber(wasteTotal)}
                </td>
                <td className="border border-border-primary px-1.5 py-1.5"></td>
                <td className="border border-border-primary px-1 py-1.5"></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 하단 안내 */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-txt-quaternary">
          수량/단가를 클릭하여 수정할 수 있습니다. 금액은 수량 x 단가로 자동 계산됩니다.
        </p>
        <div className="flex items-center gap-4 text-[11px] text-txt-tertiary tabular-nums">
          <span>일반 {normalRows.length}건</span>
          <span>폐기물 {wasteRows.length}건</span>
          <span className="font-medium text-txt-secondary">
            총합계: {formatNumber(subtotal.total + wasteTotal)}
          </span>
        </div>
      </div>
    </div>
  )
}
