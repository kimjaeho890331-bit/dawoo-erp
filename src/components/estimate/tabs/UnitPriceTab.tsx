'use client'

import type { WorkType } from '../estimateTypes'
import { WORK_TYPE_LABELS } from '../estimateTypes'
import { formatNumber } from '../estimateCalc'
import { PROCESSES_BY_WORK_TYPE, type ProcessTable } from '../estimateData'

// ── Props ──

interface Props {
  workType: WorkType
}

// ── 메인 컴포넌트 ──

export default function UnitPriceTab({ workType }: Props) {
  const workLabel = WORK_TYPE_LABELS[workType]
  const processes: ProcessTable[] = PROCESSES_BY_WORK_TYPE[workType] || []

  if (processes.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] text-txt-tertiary mb-1">
          해당 공종의 일위대가 데이터가 없습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── 헤더 ── */}
      <div className="flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary">
          {workLabel} 일위대가
        </h3>
        <span className="text-[12px] text-txt-tertiary">
          기준: 2025년 07월
        </span>
      </div>

      {/* ── 공정별 테이블 ── */}
      {processes.map(proc => (
        <div key={proc.id}>
          <h4 className="text-[13px] font-medium text-txt-primary mb-2">
            {proc.id}. {proc.name}
            <span className="text-txt-quaternary font-normal ml-2">({proc.unit})</span>
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-surface-secondary">
                  <th className="border border-border-primary px-2 py-2 text-left w-[200px]">항목</th>
                  <th className="border border-border-primary px-2 py-2 text-left w-[140px]">규격</th>
                  <th className="border border-border-primary px-2 py-2 text-center w-[50px]">단위</th>
                  <th className="border border-border-primary px-2 py-2 text-right w-[70px]">수량</th>
                  <th className="border border-border-primary px-2 py-2 text-right w-[100px]">노임단가 (원)</th>
                  <th className="border border-border-primary px-2 py-2 text-right w-[100px]">노무비 (원)</th>
                  <th className="border border-border-primary px-2 py-2 text-right w-[100px]">경비 (원)</th>
                </tr>
              </thead>
              <tbody>
                {proc.items.map((item, ii) => (
                  <tr key={ii}>
                    <td className="border border-border-primary px-2 py-1.5">
                      {item.name}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-txt-tertiary">
                      {item.spec || '-'}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-center text-txt-tertiary">
                      {item.unit}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums">
                      {item.qty}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums">
                      {formatNumber(item.laborPrice)}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums font-medium">
                      {item.laborAmount > 0 ? formatNumber(item.laborAmount) : '-'}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums font-medium">
                      {item.expenseAmount > 0 ? formatNumber(item.expenseAmount) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-secondary font-semibold">
                  <td className="border border-border-primary px-2 py-2 text-center" colSpan={4}>
                    소계
                  </td>
                  <td className="border border-border-primary px-2 py-2 text-right tabular-nums">
                    -
                  </td>
                  <td className="border border-border-primary px-2 py-2 text-right tabular-nums">
                    {formatNumber(proc.subtotal.laborAmount)}
                  </td>
                  <td className="border border-border-primary px-2 py-2 text-right tabular-nums">
                    {proc.subtotal.materialAmount > 0 ? formatNumber(proc.subtotal.materialAmount) : '-'}
                  </td>
                </tr>
                <tr className="bg-accent/5 font-semibold text-accent-text">
                  <td className="border border-border-primary px-2 py-2 text-center" colSpan={6}>
                    합계
                  </td>
                  <td className="border border-border-primary px-2 py-2 text-right tabular-nums">
                    {formatNumber(proc.subtotal.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {/* ── 안내 ── */}
      <p className="text-[11px] text-txt-quaternary">
        ※ 엑셀 원본 기준 (2026 소규모 견적서 공사원가/80% 기준)
      </p>
    </div>
  )
}
