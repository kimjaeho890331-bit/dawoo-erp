'use client'

import { formatNumber } from '../estimateCalc'
import { LABOR_PRICES, MATERIAL_PRICES } from '../estimateData'

// ── 메인 컴포넌트 ──

export default function PriceCompareTab() {
  return (
    <div className="space-y-8">
      {/* ── 노임단가 섹션 ── */}
      <div>
        <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary mb-1">
          노임단가
        </h3>
        <p className="text-[11px] text-txt-quaternary mb-3">
          2025년 07월 기준
        </p>

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
              {LABOR_PRICES.map((item, i) => (
                <tr key={i}>
                  <td className="border border-border-primary px-2 py-1.5">
                    {item.name}
                  </td>
                  <td className="border border-border-primary px-2 py-1.5 text-center text-txt-tertiary">
                    {item.unit}
                  </td>
                  <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums font-medium">
                    {formatNumber(item.price)}
                  </td>
                  <td className="border border-border-primary px-2 py-1.5 text-txt-tertiary">
                    {item.reference}
                  </td>
                  <td className="border border-border-primary px-2 py-1.5 text-txt-quaternary">
                    -
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 재료단가 섹션 ── */}
      <div>
        <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary mb-1">
          재료단가
        </h3>
        <p className="text-[11px] text-txt-quaternary mb-3">
          2025년 07월 기준
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-surface-secondary">
                <th className="border border-border-primary px-2 py-2 text-left w-[80px]">분류</th>
                <th className="border border-border-primary px-2 py-2 text-left w-[160px]">품명</th>
                <th className="border border-border-primary px-2 py-2 text-left w-[180px]">규격</th>
                <th className="border border-border-primary px-2 py-2 text-center w-[60px]">단위</th>
                <th className="border border-border-primary px-2 py-2 text-right w-[120px]">단가 (원)</th>
                <th className="border border-border-primary px-2 py-2 text-left w-[100px]">기준일</th>
                <th className="border border-border-primary px-2 py-2 text-center w-[80px]">비고 (p.)</th>
              </tr>
            </thead>
            <tbody>
              {MATERIAL_PRICES.map((item, i) => (
                <tr key={i}>
                  <td className="border border-border-primary px-2 py-1.5 text-txt-tertiary">
                    {item.category}
                  </td>
                  <td className="border border-border-primary px-2 py-1.5">
                    {item.name}
                  </td>
                  <td className="border border-border-primary px-2 py-1.5 text-txt-tertiary">
                    {item.spec || '-'}
                  </td>
                  <td className="border border-border-primary px-2 py-1.5 text-center text-txt-tertiary">
                    {item.unit}
                  </td>
                  <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums font-medium">
                    {formatNumber(item.price)}
                  </td>
                  <td className="border border-border-primary px-2 py-1.5 text-txt-tertiary">
                    {item.reference}
                  </td>
                  <td className="border border-border-primary px-2 py-1.5 text-center text-txt-quaternary">
                    {item.page || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 안내 ── */}
      <p className="text-[11px] text-txt-quaternary">
        ※ 엑셀 원본 기준 (2026 소규모 견적서 공사원가/80% 기준). 비고 페이지 번호는 물가자료집 참조.
      </p>
    </div>
  )
}
