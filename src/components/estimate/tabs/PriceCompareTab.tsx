'use client'

import { useMemo } from 'react'
import type { UnitPrice } from '../estimateTypes'
import { formatNumber } from '../estimateCalc'

// ── Props ──

interface Props {
  unitPrices: UnitPrice[]
}

// ── 메인 컴포넌트 ──

export default function PriceCompareTab({ unitPrices }: Props) {
  // 노임단가 / 재료단가 분리
  const { laborPrices, materialPrices, referenceYear } = useMemo(() => {
    const labor = unitPrices
      .filter(up => up.price_group === 'labor')
      .sort((a, b) => a.sort_order - b.sort_order)

    const material = unitPrices
      .filter(up => up.price_group === 'material')
      .sort((a, b) => a.sort_order - b.sort_order)

    // 기준 연도 (첫 항목의 year 사용)
    const year = unitPrices.length > 0 ? unitPrices[0].year : new Date().getFullYear()

    return { laborPrices: labor, materialPrices: material, referenceYear: year }
  }, [unitPrices])

  // 단가 데이터 없음
  if (unitPrices.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] text-txt-tertiary mb-1">
          단가 데이터가 없습니다.
        </p>
        <p className="text-[12px] text-txt-quaternary">
          설정 &rarr; 단가 관리에서 등록해주세요.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── 노임단가 섹션 ── */}
      <div>
        <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary mb-1">
          노임단가
        </h3>
        <p className="text-[11px] text-txt-quaternary mb-3">
          {referenceYear}년 기준
        </p>

        {laborPrices.length === 0 ? (
          <p className="text-[12px] text-txt-tertiary py-4 text-center">
            등록된 노임단가가 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-surface-secondary">
                  <th className="border border-border-primary px-2 py-2 text-left w-[200px]">직종</th>
                  <th className="border border-border-primary px-2 py-2 text-center w-[60px]">단위</th>
                  <th className="border border-border-primary px-2 py-2 text-right w-[120px]">단가 (원)</th>
                  <th className="border border-border-primary px-2 py-2 text-left w-[120px]">기준일</th>
                  <th className="border border-border-primary px-2 py-2 text-left">비고</th>
                </tr>
              </thead>
              <tbody>
                {laborPrices.map((up, i) => (
                  <tr key={up.id || i}>
                    <td className="border border-border-primary px-2 py-1.5">
                      {up.name}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-center text-txt-tertiary">
                      {up.unit || '인'}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums font-medium">
                      {formatNumber(up.price)}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-txt-tertiary">
                      {up.reference_date || '-'}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-txt-quaternary">
                      {up.spec || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 재료단가 섹션 ── */}
      <div>
        <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary mb-1">
          재료단가
        </h3>
        <p className="text-[11px] text-txt-quaternary mb-3">
          {referenceYear}년 기준
        </p>

        {materialPrices.length === 0 ? (
          <p className="text-[12px] text-txt-tertiary py-4 text-center">
            등록된 재료단가가 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-surface-secondary">
                  <th className="border border-border-primary px-2 py-2 text-left w-[180px]">품명</th>
                  <th className="border border-border-primary px-2 py-2 text-left w-[120px]">규격</th>
                  <th className="border border-border-primary px-2 py-2 text-center w-[60px]">단위</th>
                  <th className="border border-border-primary px-2 py-2 text-right w-[120px]">단가 (원)</th>
                  <th className="border border-border-primary px-2 py-2 text-left w-[120px]">기준일</th>
                  <th className="border border-border-primary px-2 py-2 text-left">비고</th>
                </tr>
              </thead>
              <tbody>
                {materialPrices.map((up, i) => (
                  <tr key={up.id || i}>
                    <td className="border border-border-primary px-2 py-1.5">
                      {up.name}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-txt-tertiary">
                      {up.spec || '-'}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-center text-txt-tertiary">
                      {up.unit || '-'}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums font-medium">
                      {formatNumber(up.price)}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-txt-tertiary">
                      {up.reference_date || '-'}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-txt-quaternary" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
