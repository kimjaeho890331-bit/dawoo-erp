'use client'

import { useCallback, useEffect, useMemo } from 'react'

import type {
  CustomerInfo,
  Measurements,
  Areas,
  CostSummary,
  WorkType,
} from '../estimateTypes'
import { WORK_TYPE_LABELS, WORK_TYPE_ORDER } from '../estimateTypes'
import { formatNumber } from '../estimateCalc'
import { MEASUREMENT_GROUPS } from '../estimateData'

// ── 15개 시 목록 (주소에서 자동 추출용) ──

const CITIES = [
  '수원', '성남', '안양', '부천', '광명', '시흥', '안산',
  '군포', '의왕', '과천', '용인', '화성', '오산', '평택', '하남',
]

// ── 산출 면적 표시용 ──

interface AreaDisplay {
  label: string
  getValue: (a: Areas) => number
  unit: string
  relevantWorks: WorkType[]
}

const AREA_DISPLAYS: AreaDisplay[] = [
  { label: '옥상 바닥', getValue: a => a.roof_floor, unit: 'm\u00B2', relevantWorks: ['waterproof'] },
  { label: '옥상 수직', getValue: a => a.roof_vertical, unit: 'm\u00B2', relevantWorks: ['waterproof'] },
  { label: '기와', getValue: a => a.tile, unit: 'm\u00B2', relevantWorks: ['tile'] },
  { label: '외벽', getValue: a => a.wall, unit: 'm\u00B2', relevantWorks: ['wallPaint', 'wallWaterRepel'] },
  { label: '계단실', getValue: a => a.stair, unit: 'm\u00B2', relevantWorks: ['stairPaint'] },
]

// ── 고객정보 필드 정의 ──

interface CustomerField {
  key: keyof CustomerInfo
  label: string
  type?: string
  span?: 2
  numberField?: boolean
}

const CUSTOMER_FIELDS: CustomerField[] = [
  { key: 'buildingName', label: '빌라명' },
  { key: 'cityName', label: '시' },
  { key: 'roadAddress', label: '도로명주소', span: 2 },
  { key: 'dong', label: '동수', numberField: true },
  { key: 'unitCount', label: '세대수', numberField: true },
  { key: 'approvalDate', label: '사용승인일', type: 'date' },
  { key: 'constructionDesc', label: '공사명' },
  { key: 'ownerName', label: '소유주' },
  { key: 'ownerPhone', label: '연락처', type: 'tel' },
]

// ── 공종별 배지 색상 ──

const WORK_TYPE_COLORS: Record<WorkType, string> = {
  waterproof: 'bg-blue-100 text-blue-700',
  tile: 'bg-orange-100 text-orange-700',
  wallPaint: 'bg-green-100 text-green-700',
  stairPaint: 'bg-purple-100 text-purple-700',
  wallWaterRepel: 'bg-teal-100 text-teal-700',
}

// ── Props ──

interface Props {
  customerInfo: CustomerInfo
  onCustomerInfoChange: (info: CustomerInfo) => void
  measurements: Measurements
  onMeasurementsChange: (m: Measurements) => void
  areas: Areas
  costSummary: CostSummary & { additionalCost?: number }
  checkedWorks: WorkType[]
  onAdditionalCostChange?: (value: number) => void
}

// ── 컴포넌트 ──

export default function CustomerInfoTab({
  customerInfo,
  onCustomerInfoChange,
  measurements,
  onMeasurementsChange,
  areas,
  costSummary,
  checkedWorks,
  onAdditionalCostChange,
}: Props) {
  // ── 주소에서 시 이름 자동 추출 ──

  useEffect(() => {
    if (!customerInfo.roadAddress) return
    // 이미 수동으로 설정된 경우 덮어쓰지 않음
    if (customerInfo.cityName) return

    const addr = customerInfo.roadAddress
    for (const city of CITIES) {
      // "수원시", "수원 시" 등 패턴 매칭
      if (addr.includes(city)) {
        onCustomerInfoChange({ ...customerInfo, cityName: city })
        break
      }
    }
  }, [customerInfo.roadAddress]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 헬퍼 ──

  const setCustomerField = useCallback(
    (key: keyof CustomerInfo, value: string | number) => {
      onCustomerInfoChange({ ...customerInfo, [key]: value })
    },
    [customerInfo, onCustomerInfoChange],
  )

  const setMeasureField = useCallback(
    (key: keyof Measurements, value: string) => {
      onMeasurementsChange({ ...measurements, [key]: parseFloat(value) || 0 })
    },
    [measurements, onMeasurementsChange],
  )

  /** 이 필드가 현재 체크된 공종과 관련이 있는지 */
  const isFieldRelevant = useCallback(
    (relevantWorks: WorkType[]) => {
      return relevantWorks.some(wt => checkedWorks.includes(wt))
    },
    [checkedWorks],
  )

  // 활성화된 면적 표시만 필터
  const activeAreaDisplays = AREA_DISPLAYS.filter(d =>
    isFieldRelevant(d.relevantWorks),
  )

  // 활성화된 실측 그룹 필터
  const activeMeasurementGroups = useMemo(
    () => MEASUREMENT_GROUPS.filter(g =>
      g.relatedWorkTypes.some(wt => checkedWorks.includes(wt)),
    ),
    [checkedWorks],
  )

  return (
    <div className="space-y-6">
      {/* ── 고객 정보 섹션 ── */}
      <div className="grid grid-cols-[1fr_280px] gap-6">
        {/* 왼쪽: 고객 정보 폼 */}
        <div className="border border-accent/20 rounded-[10px] p-5 bg-accent/5">
          <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-4">
            고객 정보
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {CUSTOMER_FIELDS.map(f => (
              <div
                key={f.key}
                className={`flex items-center gap-2 ${f.span === 2 ? 'col-span-2' : ''}`}
              >
                <label className="w-[80px] text-[13px] font-medium text-txt-secondary shrink-0">
                  {f.label}
                </label>
                <input
                  type={f.type ?? (f.numberField ? 'number' : 'text')}
                  value={customerInfo[f.key]}
                  onChange={e => {
                    if (f.numberField) {
                      setCustomerField(f.key, parseInt(e.target.value, 10) || 0)
                    } else {
                      setCustomerField(f.key, e.target.value)
                    }
                  }}
                  className="flex-1 h-[36px] border border-border-primary rounded-lg px-3 text-[13px] bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light tabular-nums"
                />
              </div>
            ))}
          </div>
        </div>

        {/* 오른쪽: 선택된 공종 표시 (읽기 전용) */}
        <div className="border border-border-primary rounded-[10px] p-5">
          <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-4">
            선택 공종
          </h3>
          {checkedWorks.length === 0 ? (
            <p className="text-[13px] text-txt-tertiary">
              상단에서 공사종류를 선택해 주세요.
            </p>
          ) : (
            <div className="space-y-2">
              {WORK_TYPE_ORDER.filter(wt => checkedWorks.includes(wt)).map((wt, i) => (
                <div
                  key={wt}
                  className="flex items-center gap-2 px-3 py-2 bg-surface-secondary rounded-lg"
                >
                  <span className="w-5 h-5 rounded-full bg-accent/10 text-accent-text text-[11px] font-medium flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-[13px] text-txt-primary">{WORK_TYPE_LABELS[wt]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 실측 입력 섹션 (그룹별) ── */}
      <div className="border border-border-primary rounded-[10px] p-5">
        <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-4">
          실측 치수
        </h3>
        {checkedWorks.length === 0 ? (
          <p className="text-[13px] text-txt-tertiary py-4 text-center">
            공사종류를 선택하면 관련 실측 입력 항목이 표시됩니다.
          </p>
        ) : (
          <div className="space-y-5">
            {activeMeasurementGroups.map(group => (
              <div key={group.label} className="border border-border-secondary rounded-lg p-4 bg-surface-secondary/50">
                {/* 그룹 헤더 */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[13px] font-semibold text-txt-primary">
                    {group.label}
                  </span>
                  <span className="text-[11px] text-txt-quaternary">
                    {group.description}
                  </span>
                  <div className="flex-1" />
                  <div className="flex gap-1.5">
                    {group.relatedWorkTypes
                      .filter(wt => checkedWorks.includes(wt))
                      .map(wt => (
                        <span
                          key={wt}
                          className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${WORK_TYPE_COLORS[wt]}`}
                        >
                          {WORK_TYPE_LABELS[wt]}
                        </span>
                      ))}
                  </div>
                </div>
                {/* 입력 필드 */}
                <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                  {group.fields.map(f => (
                    <div key={f.key} className="flex items-center gap-2">
                      <label className="w-[90px] text-[13px] font-medium text-txt-secondary shrink-0">
                        {f.label} ({f.unit})
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={measurements[f.key as keyof Measurements] || ''}
                        onChange={e => setMeasureField(f.key as keyof Measurements, e.target.value)}
                        placeholder="0"
                        className="flex-1 h-[36px] border border-border-primary rounded-lg px-3 text-[13px] text-right bg-surface tabular-nums focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 산출 면적 + 원가 요약 (읽기 전용) ── */}
      <div className="grid grid-cols-2 gap-6">
        {/* 산출 면적 */}
        <div className="border border-border-primary rounded-[10px] p-5 bg-surface-secondary">
          <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-4">
            산출 면적
          </h3>
          {activeAreaDisplays.length === 0 ? (
            <p className="text-[13px] text-txt-tertiary">-</p>
          ) : (
            <div className="space-y-2">
              {activeAreaDisplays.map(d => {
                const val = d.getValue(areas)
                return (
                  <div key={d.label} className="flex items-center justify-between">
                    <span className="text-[13px] text-txt-secondary">{d.label}</span>
                    <span className="text-[13px] font-semibold text-link tabular-nums">
                      {val.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} {d.unit}
                    </span>
                  </div>
                )
              })}
              {/* 옥상 합계 (방수가 선택된 경우) */}
              {checkedWorks.includes('waterproof') && (
                <>
                  <div className="border-t border-border-primary my-2" />
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-txt-primary">옥상 합계 (바닥+수직)</span>
                    <span className="text-[13px] font-semibold text-txt-primary tabular-nums">
                      {(areas.roof_floor + areas.roof_vertical).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} m{'\u00B2'}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 원가 요약 */}
        <div className="border border-border-primary rounded-[10px] p-5 bg-surface-secondary">
          <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-4">
            원가 요약
          </h3>
          <div className="space-y-2">
            <SummaryRow label="직접재료비" value={costSummary.directMaterial} />
            <SummaryRow label="직접노무비" value={costSummary.directLabor} />
            <SummaryRow label="직접경비" value={costSummary.directExpense} />
            <SummaryRow label="간접노무비" value={costSummary.indirectLabor} />
            <div className="border-t border-border-primary my-2" />
            <SummaryRow label="일반관리비" value={costSummary.adminFee} />
            <SummaryRow label="이윤" value={costSummary.profit} />
            <div className="border-t border-border-primary my-2" />
            <SummaryRow label="공급가액" value={costSummary.supplyPrice} bold />
            <SummaryRow label="부가세" value={costSummary.vat} />
            <div className="border-t border-border-primary my-2" />
            <SummaryRow label="총 공사비" value={costSummary.totalCost} bold accent />
            <SummaryRow label="시 지원금" value={costSummary.citySubsidy} color="text-link" />
            <SummaryRow label="자부담" value={costSummary.selfBurden} color="text-[#e57e25]" />
            {customerInfo.unitCount > 1 && (
              <SummaryRow label="세대당 부담" value={costSummary.perUnitBurden} />
            )}
            <div className="border-t border-border-primary my-2" />
            <SummaryRow label="추가공사비" value={costSummary.additionalCost ?? 0} editable
              onEdit={onAdditionalCostChange} />
            <SummaryRow label="최종 합계" value={costSummary.totalCost + (costSummary.additionalCost ?? 0)} bold accent />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 원가 요약 행 ──

function SummaryRow({
  label,
  value,
  bold = false,
  accent = false,
  color,
  editable = false,
  onEdit,
}: {
  label: string
  value: number
  bold?: boolean
  accent?: boolean
  color?: string
  editable?: boolean
  onEdit?: (v: number) => void
}) {
  const valueColor = color
    ?? (accent ? 'text-accent-text' : 'text-txt-primary')
  return (
    <div className="flex items-center justify-between">
      <span
        className={`text-[13px] ${bold ? 'font-medium text-txt-primary' : 'text-txt-secondary'}`}
      >
        {label}
      </span>
      {editable && onEdit ? (
        <input
          type="number"
          value={value || ''}
          onChange={e => onEdit(Number(e.target.value) || 0)}
          className="w-[140px] h-[28px] text-[13px] text-right tabular-nums font-medium border border-border-primary rounded px-2 bg-surface focus:border-accent focus:ring-1 focus:ring-accent-light outline-none"
          placeholder="0"
        />
      ) : (
        <span
          className={`text-[13px] tabular-nums ${bold ? 'font-semibold' : 'font-medium'} ${valueColor}`}
        >
          {formatNumber(value)}원
        </span>
      )}
    </div>
  )
}
