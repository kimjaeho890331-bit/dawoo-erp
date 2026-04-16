'use client'

import { useMemo } from 'react'
import type { WorkType, UnitPrice } from '../estimateTypes'
import { WORK_TYPE_LABELS } from '../estimateTypes'
import { formatNumber } from '../estimateCalc'

// ── Props ──

interface Props {
  workType: WorkType
  unitPrices: UnitPrice[]
}

// ── 공정 그룹핑용 타입 ──

interface ProcessGroup {
  processName: string
  items: UnitPrice[]
  subtotal: number
}

// ── 메인 컴포넌트 ──

export default function UnitPriceTab({ workType, unitPrices }: Props) {
  const workLabel = WORK_TYPE_LABELS[workType]

  // 해당 공종의 일위대가 필터링 및 그룹핑
  const { groups, referenceDate } = useMemo(() => {
    // work_type 관련 단가만 필터 (price_group이 'work_type'이고 name에 공종명 포함 등)
    // 실제 데이터 구조에 따라 필터 조건 조정 가능
    const relevant = unitPrices.filter(
      up => up.price_group === 'work_type'
    )

    // spec 기준으로 공정 그룹핑 (spec을 공정명으로 활용)
    const groupMap = new Map<string, UnitPrice[]>()
    for (const up of relevant) {
      const processName = up.spec || '기타'
      const existing = groupMap.get(processName) || []
      existing.push(up)
      groupMap.set(processName, existing)
    }

    const groups: ProcessGroup[] = []
    for (const [processName, items] of groupMap) {
      const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)
      const subtotal = sorted.reduce((sum, item) => sum + item.price, 0)
      groups.push({ processName, items: sorted, subtotal })
    }

    // 기준일 (첫 항목의 reference_date 사용)
    const refDate = relevant.length > 0
      ? relevant[0].reference_date
      : null

    return { groups, referenceDate: refDate }
  }, [unitPrices])

  // 단가 데이터 없음
  if (unitPrices.length === 0 || groups.length === 0) {
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
    <div className="space-y-6">
      {/* ── 헤더 ── */}
      <div className="flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary">
          {workLabel} 일위대가
        </h3>
        {referenceDate && (
          <span className="text-[12px] text-txt-tertiary">
            기준: {referenceDate}
          </span>
        )}
      </div>

      {/* ── 공정별 테이블 ── */}
      {groups.map((group, gi) => (
        <div key={gi}>
          <h4 className="text-[13px] font-medium text-txt-primary mb-2">
            {group.processName}
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-surface-secondary">
                  <th className="border border-border-primary px-2 py-2 text-left w-[200px]">항목</th>
                  <th className="border border-border-primary px-2 py-2 text-left w-[120px]">규격</th>
                  <th className="border border-border-primary px-2 py-2 text-center w-[60px]">단위</th>
                  <th className="border border-border-primary px-2 py-2 text-right w-[80px]">수량</th>
                  <th className="border border-border-primary px-2 py-2 text-right w-[100px]">단가 (원)</th>
                  <th className="border border-border-primary px-2 py-2 text-right w-[120px]">금액 (원)</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item, ii) => (
                  <tr key={item.id || ii}>
                    <td className="border border-border-primary px-2 py-1.5">
                      {item.name}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-txt-tertiary">
                      {item.spec || '-'}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-center text-txt-tertiary">
                      {item.unit || '-'}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums">
                      1
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums">
                      {formatNumber(item.price)}
                    </td>
                    <td className="border border-border-primary px-2 py-1.5 text-right tabular-nums font-medium">
                      {formatNumber(item.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-secondary font-semibold">
                  <td
                    className="border border-border-primary px-2 py-2 text-center"
                    colSpan={5}
                  >
                    소계
                  </td>
                  <td className="border border-border-primary px-2 py-2 text-right tabular-nums">
                    {formatNumber(group.subtotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {/* ── 안내 ── */}
      <p className="text-[11px] text-txt-quaternary">
        ※ 단가 수정은 설정 &rarr; 단가 관리에서 할 수 있습니다
      </p>
    </div>
  )
}
