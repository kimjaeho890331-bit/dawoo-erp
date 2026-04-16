'use client'

import { useCallback } from 'react'

import type {
  CustomerInfo,
  Measurements,
  Areas,
  CostSummary,
  WorkType,
} from '../estimateTypes'
import { WORK_TYPE_LABELS, WORK_TYPE_ORDER } from '../estimateTypes'
import { formatNumber } from '../estimateCalc'

// ── 실측 입력 필드 정의 ──

interface MeasurementField {
  key: keyof Measurements
  label: string
  /** 이 필드가 관련된 공종 목록 — 해당 공종이 체크되었을 때만 활성화 */
  relevantWorks: WorkType[]
}

const MEASUREMENT_FIELDS: MeasurementField[] = [
  { key: 'roofW', label: '옥상 가로(m)', relevantWorks: ['waterproof', 'tile'] },
  { key: 'roofL', label: '옥상 세로(m)', relevantWorks: ['waterproof', 'tile'] },
  { key: 'roofV', label: '옥상 수직(m)', relevantWorks: ['waterproof'] },
  { key: 'tileW', label: '기와 폭(m)', relevantWorks: ['tile'] },
  { key: 'wallW', label: '외벽 가로(m)', relevantWorks: ['wallPaint', 'wallWaterRepel'] },
  { key: 'wallL', label: '외벽 세로(m)', relevantWorks: ['wallPaint', 'wallWaterRepel'] },
  { key: 'stairW', label: '계단 가로(m)', relevantWorks: ['stairPaint'] },
  { key: 'stairL', label: '계단 세로(m)', relevantWorks: ['stairPaint'] },
  { key: 'buildingH', label: '건물높이(m)', relevantWorks: ['wallPaint', 'wallWaterRepel', 'stairPaint'] },
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

// ── Props ──

interface Props {
  customerInfo: CustomerInfo
  onCustomerInfoChange: (info: CustomerInfo) => void
  measurements: Measurements
  onMeasurementsChange: (m: Measurements) => void
  areas: Areas
  costSummary: CostSummary
  checkedWorks: WorkType[]
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
}: Props) {
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

  // 활성화된 실측 필드만 필터
  const activeMeasurementFields = MEASUREMENT_FIELDS.filter(f =>
    isFieldRelevant(f.relevantWorks),
  )

  // 활성화된 면적 표시만 필터
  const activeAreaDisplays = AREA_DISPLAYS.filter(d =>
    isFieldRelevant(d.relevantWorks),
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

      {/* ── 실측 입력 섹션 ── */}
      <div className="border border-border-primary rounded-[10px] p-5">
        <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-4">
          실측 치수
        </h3>
        {checkedWorks.length === 0 ? (
          <p className="text-[13px] text-txt-tertiary py-4 text-center">
            공사종류를 선택하면 관련 실측 입력 항목이 표시됩니다.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-x-6 gap-y-3">
            {activeMeasurementFields.map(f => (
              <div key={f.key} className="flex items-center gap-2">
                <label className="w-[100px] text-[13px] font-medium text-txt-secondary shrink-0">
                  {f.label}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={measurements[f.key] || ''}
                  onChange={e => setMeasureField(f.key, e.target.value)}
                  placeholder="0"
                  className="flex-1 h-[36px] border border-border-primary rounded-lg px-3 text-[13px] text-right bg-surface tabular-nums focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                />
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
}: {
  label: string
  value: number
  bold?: boolean
  accent?: boolean
  color?: string
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
      <span
        className={`text-[13px] tabular-nums ${bold ? 'font-semibold' : 'font-medium'} ${valueColor}`}
      >
        {formatNumber(value)}원
      </span>
    </div>
  )
}
