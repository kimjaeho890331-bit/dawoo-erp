'use client'

import { useState, useEffect, useMemo } from 'react'
import type { CostSummary, CostRates, WorkType, DetailRow } from '../estimateTypes'
import { WORK_TYPE_LABELS, WORK_TYPE_ORDER, STATUTORY_RATES } from '../estimateTypes'
import { formatNumber, formatPercent, calcDetailSubtotal, calcWasteTotal } from '../estimateCalc'

// ── 인라인 요율 편집 셀 ──

function EditableRateCell({
  rate,
  onChange,
}: {
  rate: number
  onChange: (rate: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const displayPercent = `${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`

  const startEdit = () => {
    setDraft((rate * 100).toFixed(1).replace(/\.0$/, ''))
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const parsed = parseFloat(draft)
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      onChange(parsed / 100)
    }
  }

  if (editing) {
    return (
      <td className="border border-border-primary px-0 py-0 w-[80px]">
        <div className="flex items-center">
          <input
            autoFocus
            type="number"
            step="0.1"
            min="0"
            max="100"
            className="w-full px-2 py-1.5 text-[12px] text-right outline-none bg-amber-50/80 tabular-nums"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
          <span className="pr-1.5 text-[11px] text-txt-tertiary bg-amber-50/80">%</span>
        </div>
      </td>
    )
  }

  return (
    <td
      className="border border-border-primary px-2 py-1.5 text-right text-[12px] tabular-nums bg-amber-50/50 cursor-pointer hover:bg-amber-100/60 transition-colors"
      onClick={startEdit}
      title="클릭하여 요율 수정"
    >
      {displayPercent}
    </td>
  )
}

// ── 원가계산서 행 유형 ──

type CostRowType =
  | 'value'        // 일반 값 표시
  | 'editable'     // 편집 가능 요율
  | 'subtotal'     // 소계
  | 'total'        // 합계 (강조)
  | 'separator'    // 구분선

interface CostRowDef {
  type: CostRowType
  label: string
  rateLabel?: string
  rateKey?: keyof CostRates
  getValue: (s: CostSummary) => number
  basis?: string
}

// ── 메인 컴포넌트 ──

interface Props {
  costSummary: CostSummary
  costRates: CostRates
  onCostRatesChange: (rates: CostRates) => void
  checkedWorks: WorkType[]
  detailRows: Record<WorkType, DetailRow[]>
}

export default function CostSheetTab({
  costSummary,
  costRates,
  onCostRatesChange,
  checkedWorks,
  detailRows,
}: Props) {
  const s = costSummary

  // 요율 변경 핸들러
  const updateRate = (key: keyof CostRates, value: number) => {
    onCostRatesChange({ ...costRates, [key]: value })
  }

  // 공종별 집계 데이터 (집계표용)
  const workSummaries = useMemo(() => {
    return checkedWorks
      .filter(wt => WORK_TYPE_ORDER.includes(wt))
      .sort((a, b) => WORK_TYPE_ORDER.indexOf(a) - WORK_TYPE_ORDER.indexOf(b))
      .map(wt => {
        const rows = detailRows[wt] || []
        const sub = calcDetailSubtotal(rows)
        const waste = calcWasteTotal(rows)
        return {
          workType: wt,
          label: WORK_TYPE_LABELS[wt],
          material: sub.material,
          labor: sub.labor,
          expense: sub.expense,
          waste,
          total: sub.total + waste,
        }
      })
  }, [checkedWorks, detailRows])

  const showSummaryTable = checkedWorks.length >= 2

  // 원가계산서 행 정의
  const costRows: {
    label: string
    rate?: string
    rateKey?: keyof CostRates
    amount: number
    isSub?: boolean
    isTotal?: boolean
    isEditable?: boolean
    basis?: string
  }[] = [
    // 재료비
    { label: '직접재료비', amount: s.directMaterial, basis: '내역서 합계' },
    { label: '간접재료비', amount: 0, basis: '-' },
    { label: '재료비 소계', amount: s.totalMaterial, isSub: true },
    // 노무비
    { label: '직접노무비', amount: s.directLabor, basis: '내역서 합계' },
    {
      label: '간접노무비',
      rate: formatPercent(costRates.indirectLaborRate),
      rateKey: 'indirectLaborRate',
      amount: s.indirectLabor,
      isEditable: true,
      basis: '직접노무비 x 요율',
    },
    { label: '노무비 소계', amount: s.totalLabor, isSub: true },
    // 경비
    { label: '기계경비', amount: s.directExpense, basis: '내역서 합계' },
    {
      label: '국민연금',
      rate: formatPercent(STATUTORY_RATES.nationalPension),
      amount: s.nationalPension,
      basis: '노무비 소계 x 4.5%',
    },
    {
      label: '건강보험',
      rate: formatPercent(STATUTORY_RATES.healthInsurance),
      amount: s.healthInsurance,
      basis: '노무비 소계 x 3.69%',
    },
    {
      label: '노인장기요양',
      rate: `${(STATUTORY_RATES.longTermCare * 100).toFixed(2)}%`,
      amount: s.longTermCare,
      basis: '건강보험 x 12.95%',
    },
    {
      label: '고용보험',
      rate: formatPercent(STATUTORY_RATES.employmentInsurance),
      amount: s.employmentInsurance,
      basis: '노무비 소계 x 0.9%',
    },
    {
      label: '산재보험',
      rate: formatPercent(STATUTORY_RATES.industrialAccident),
      amount: s.industrialAccident,
      basis: '노무비 소계 x 3.7%',
    },
    {
      label: '퇴직공제',
      rate: formatPercent(STATUTORY_RATES.retirement),
      amount: s.retirement,
      basis: '노무비 소계 x 2.6%',
    },
    {
      label: '안전관리비',
      rate: formatPercent(STATUTORY_RATES.safety),
      amount: s.safety,
      basis: '(재료+노무) x 2.2%',
    },
    {
      label: '환경보전비',
      rate: formatPercent(costRates.envRate),
      rateKey: 'envRate',
      amount: s.envPreservation,
      isEditable: true,
      basis: '(재료+노무) x 요율',
    },
    {
      label: '기타경비',
      rate: formatPercent(costRates.etcRate),
      rateKey: 'etcRate',
      amount: s.etcExpense,
      isEditable: true,
      basis: '(노무+경비) x 요율',
    },
    { label: '하도급보증수수료', amount: s.subcontractBond },
    { label: '기계대여', amount: s.machineLease },
    { label: '경비 소계', amount: s.totalExpense, isSub: true },
    // 일반관리비 / 이윤
    {
      label: '일반관리비',
      rate: formatPercent(costRates.adminRate),
      rateKey: 'adminRate',
      amount: s.adminFee,
      isEditable: true,
      basis: '(재+노+경) x 요율',
    },
    {
      label: '이윤',
      rate: formatPercent(costRates.profitRate),
      rateKey: 'profitRate',
      amount: s.profit,
      isEditable: true,
      basis: '(노+경+관리비) x 요율',
    },
    // 폐기물
    { label: '폐기물처리비', amount: s.wasteDisposal, basis: '내역서 폐기물 합계' },
    // 최종
    { label: '공급가액', amount: s.supplyPrice, isSub: true, basis: '만원 절사' },
    { label: '부가세 (10%)', amount: s.vat },
    { label: '총 공사비', amount: s.totalCost, isTotal: true },
  ]

  if (checkedWorks.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] text-txt-tertiary">공사종류를 선택하면 원가계산서가 표시됩니다.</p>
      </div>
    )
  }

  return (
    <div className={`flex gap-6 ${showSummaryTable ? '' : 'justify-center'}`}>
      {/* 좌측: 원가계산서 */}
      <div className={showSummaryTable ? 'flex-1 min-w-0' : 'w-full max-w-[700px]'}>
        <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary mb-3">
          원가계산서
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-surface-secondary">
                <th className="border border-border-primary px-2 py-2 text-left w-[160px]">항목</th>
                <th className="border border-border-primary px-2 py-2 text-right w-[80px]">요율</th>
                <th className="border border-border-primary px-2 py-2 text-right w-[120px]">금액 (원)</th>
                <th className="border border-border-primary px-2 py-2 text-left w-[140px] hidden lg:table-cell">산출근거</th>
              </tr>
            </thead>
            <tbody>
              {costRows.map((row, i) => {
                const isSubOrTotal = row.isSub || row.isTotal

                return (
                  <tr
                    key={i}
                    className={
                      row.isTotal
                        ? 'bg-accent/10 font-bold'
                        : row.isSub
                        ? 'bg-surface-secondary font-semibold'
                        : ''
                    }
                  >
                    {/* 항목명 */}
                    <td
                      className={`border border-border-primary px-2 py-1.5 ${
                        row.isTotal ? 'text-[13px]' : ''
                      }`}
                    >
                      {row.label}
                    </td>

                    {/* 요율 */}
                    {row.isEditable && row.rateKey ? (
                      <EditableRateCell
                        rate={costRates[row.rateKey] as number}
                        onChange={v => updateRate(row.rateKey!, v)}
                      />
                    ) : (
                      <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums text-txt-tertiary">
                        {row.rate || ''}
                      </td>
                    )}

                    {/* 금액 */}
                    <td
                      className={`border border-border-primary px-2 py-1.5 text-right tabular-nums ${
                        row.isTotal ? 'text-[13px] text-accent-text' : ''
                      }`}
                    >
                      {formatNumber(row.amount)}
                    </td>

                    {/* 산출근거 */}
                    <td className="border border-border-primary px-2 py-1.5 text-txt-quaternary hidden lg:table-cell">
                      {row.basis || ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 시 지원금 요약 */}
        <div className="mt-4 p-3 bg-surface-secondary border border-border-primary rounded-lg">
          <div className="flex items-center gap-6 text-[12px]">
            <div className="flex items-center gap-1.5">
              <span className="text-txt-tertiary">시 지원율</span>
              <span className="font-semibold text-link tabular-nums">
                {formatPercent(costRates.subsidyRate)}
              </span>
            </div>
            <div className="w-px h-4 bg-border-primary" />
            <div className="flex items-center gap-1.5">
              <span className="text-txt-tertiary">시 지원금</span>
              <span className="font-semibold text-link tabular-nums">
                {formatNumber(s.citySubsidy)}
              </span>
            </div>
            <div className="w-px h-4 bg-border-primary" />
            <div className="flex items-center gap-1.5">
              <span className="text-txt-tertiary">자부담</span>
              <span className="font-semibold text-[#e57e25] tabular-nums">
                {formatNumber(s.selfBurden)}
              </span>
            </div>
            {s.perUnitBurden > 0 && (
              <>
                <div className="w-px h-4 bg-border-primary" />
                <div className="flex items-center gap-1.5">
                  <span className="text-txt-tertiary">세대당</span>
                  <span className="font-semibold text-txt-secondary tabular-nums">
                    {formatNumber(s.perUnitBurden)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 우측: 집계표 (2개 이상 공종 시 표시) */}
      {showSummaryTable && (
        <div className="w-[480px] shrink-0">
          <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary mb-3">
            집계표
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-surface-secondary">
                  <th className="border border-border-primary px-2 py-2 text-left">공종명</th>
                  <th className="border border-border-primary px-2 py-2 text-right">재료비</th>
                  <th className="border border-border-primary px-2 py-2 text-right">노무비</th>
                  <th className="border border-border-primary px-2 py-2 text-right">경비</th>
                  <th className="border border-border-primary px-2 py-2 text-right">폐기물</th>
                  <th className="border border-border-primary px-2 py-2 text-right">합계</th>
                </tr>
              </thead>
              <tbody>
                {workSummaries.map(ws => (
                  <tr key={ws.workType}>
                    <td className="border border-border-primary px-2 py-1.5">{ws.label}</td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums">
                      {formatNumber(ws.material)}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums">
                      {formatNumber(ws.labor)}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums">
                      {formatNumber(ws.expense)}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums">
                      {formatNumber(ws.waste)}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums font-medium">
                      {formatNumber(ws.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-accent/5 font-semibold">
                  <td className="border border-border-primary px-2 py-2">합계</td>
                  <td className="border border-border-primary px-2 py-2 text-right tabular-nums">
                    {formatNumber(workSummaries.reduce((a, w) => a + w.material, 0))}
                  </td>
                  <td className="border border-border-primary px-2 py-2 text-right tabular-nums">
                    {formatNumber(workSummaries.reduce((a, w) => a + w.labor, 0))}
                  </td>
                  <td className="border border-border-primary px-2 py-2 text-right tabular-nums">
                    {formatNumber(workSummaries.reduce((a, w) => a + w.expense, 0))}
                  </td>
                  <td className="border border-border-primary px-2 py-2 text-right tabular-nums">
                    {formatNumber(workSummaries.reduce((a, w) => a + w.waste, 0))}
                  </td>
                  <td className="border border-border-primary px-2 py-2 text-right tabular-nums">
                    {formatNumber(workSummaries.reduce((a, w) => a + w.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 구성비 시각화 */}
          <div className="mt-4 p-3 bg-surface-secondary border border-border-primary rounded-lg">
            <h4 className="text-[11px] font-medium text-txt-tertiary mb-2">공종별 비중</h4>
            <div className="space-y-1.5">
              {workSummaries.map(ws => {
                const grandTotal = workSummaries.reduce((a, w) => a + w.total, 0)
                const pct = grandTotal > 0 ? (ws.total / grandTotal) * 100 : 0
                return (
                  <div key={ws.workType} className="flex items-center gap-2">
                    <span className="w-[72px] text-[11px] text-txt-secondary truncate">{ws.label}</span>
                    <div className="flex-1 h-[6px] bg-border-primary/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent/60 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-[36px] text-[11px] text-txt-tertiary tabular-nums text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
