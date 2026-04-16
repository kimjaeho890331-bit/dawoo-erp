'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

import type {
  WorkType,
  CustomerInfo,
  Measurements,
  Areas,
  CostRates,
  CostSummary,
  DetailRow,
  EstimateData,
  UnitPrice,
} from './estimateTypes'
import {
  WORK_TYPE_LABELS,
  WORK_TYPE_ORDER,
  DEFAULT_COST_RATES,
} from './estimateTypes'
import {
  calcAreas,
  calcCostSummary,
  formatNumber,
} from './estimateCalc'
import CustomerInfoTab from './tabs/CustomerInfoTab'

// ── 탭 정의 ──

type TabKey =
  | 'customerInfo'
  | 'cover'
  | 'costSheet'
  | 'detail'
  | 'unitPrice'
  | 'priceCompare'

interface TabDef {
  key: TabKey
  label: string
}

const TABS: TabDef[] = [
  { key: 'customerInfo', label: '고객정보' },
  { key: 'cover', label: '표지/갑지' },
  { key: 'costSheet', label: '원가계산서' },
  { key: 'detail', label: '내역서' },
  { key: 'unitPrice', label: '일위대가' },
  { key: 'priceCompare', label: '단가대비표' },
]

// ── 초기값 ──

const EMPTY_CUSTOMER_INFO: CustomerInfo = {
  buildingName: '',
  roadAddress: '',
  dong: 1,
  unitCount: 1,
  approvalDate: '',
  ownerName: '',
  ownerPhone: '',
  constructionDesc: '',
  cityName: '',
}

const EMPTY_MEASUREMENTS: Measurements = {
  roofW: 0,
  roofL: 0,
  roofV: 0,
  tileW: 0,
  wallW: 0,
  wallL: 0,
  stairW: 0,
  stairL: 0,
  buildingH: 0,
}

function emptyDetailRows(): Record<WorkType, DetailRow[]> {
  const result = {} as Record<WorkType, DetailRow[]>
  for (const wt of WORK_TYPE_ORDER) {
    result[wt] = []
  }
  return result
}

// ── 메인 컴포넌트 ──

interface Props {
  category: string
  projectId: string | null
}

export default function EstimatePage({ category, projectId }: Props) {
  const router = useRouter()

  // ── 상태 ──
  const [activeTab, setActiveTab] = useState<TabKey>('customerInfo')
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>(EMPTY_CUSTOMER_INFO)
  const [measurements, setMeasurements] = useState<Measurements>(EMPTY_MEASUREMENTS)
  const [checkedWorks, setCheckedWorks] = useState<WorkType[]>([])
  const [costRates, setCostRates] = useState<CostRates>(DEFAULT_COST_RATES)
  const [detailRows, setDetailRows] = useState<Record<WorkType, DetailRow[]>>(emptyDetailRows)
  const [unitPrices, setUnitPrices] = useState<UnitPrice[]>([])
  const [priceYear, setPriceYear] = useState<number>(new Date().getFullYear())

  const [estimateId, setEstimateId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // ── 자동 계산 ──

  const areas: Areas = useMemo(() => calcAreas(measurements), [measurements])

  const costSummary: CostSummary = useMemo(
    () => calcCostSummary(detailRows, checkedWorks, costRates, customerInfo.unitCount),
    [detailRows, checkedWorks, costRates, customerInfo.unitCount],
  )

  // ── 프로젝트 데이터 로드 (고객 정보 초기값) ──

  useEffect(() => {
    if (!projectId) return
    ;(async () => {
      const { data } = await supabase
        .from('projects')
        .select('building_name, road_address, dong, unit_count, approval_date, owner_name, owner_phone, city_name, work_types')
        .eq('id', projectId)
        .single()
      if (data) {
        setCustomerInfo(prev => ({
          ...prev,
          buildingName: data.building_name ?? '',
          roadAddress: data.road_address ?? '',
          dong: data.dong ?? 1,
          unitCount: data.unit_count ?? 1,
          approvalDate: data.approval_date ?? '',
          ownerName: data.owner_name ?? '',
          ownerPhone: data.owner_phone ?? '',
          cityName: data.city_name ?? '',
        }))
        // work_types가 있으면 체크된 공종 초기값으로 사용
        if (data.work_types && Array.isArray(data.work_types)) {
          setCheckedWorks(data.work_types.filter((wt: string) =>
            WORK_TYPE_ORDER.includes(wt as WorkType),
          ) as WorkType[])
        }
      }
    })()
  }, [projectId])

  // ── 단가 로드 ──

  useEffect(() => {
    ;(async () => {
      const year = new Date().getFullYear()
      const { data } = await supabase
        .from('unit_prices')
        .select('*')
        .eq('year', year)
        .eq('category', category === 'small' ? '소규모' : '수도')
        .order('sort_order')
      if (data && data.length > 0) {
        setUnitPrices(data as UnitPrice[])
        setPriceYear(year)
      }
    })()
  }, [category])

  // ── 기존 견적서 로드 ──

  useEffect(() => {
    if (!projectId || loaded) return
    ;(async () => {
      const { data } = await supabase
        .from('estimates')
        .select('*')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) {
        setEstimateId(data.id)
        const d = data.data as Partial<EstimateData> | null
        if (d) {
          if (d.customerInfo) setCustomerInfo(d.customerInfo)
          if (d.checkedWorks) setCheckedWorks(d.checkedWorks)
          if (d.measurements) setMeasurements(d.measurements)
          if (d.costRates) setCostRates(d.costRates)
          if (d.detailRows) setDetailRows(d.detailRows)
          if (d.priceYear) setPriceYear(d.priceYear)
          if (d.unitPriceSnapshot) setUnitPrices(d.unitPriceSnapshot)
        }
      }
      setLoaded(true)
    })()
  }, [projectId, loaded])

  // ── 공종 토글 ──

  const toggleWork = useCallback((wt: WorkType) => {
    setCheckedWorks(prev => {
      if (prev.includes(wt)) {
        return prev.filter(w => w !== wt)
      }
      // 순서 유지하면서 추가
      const next = [...prev, wt]
      return WORK_TYPE_ORDER.filter(w => next.includes(w))
    })
  }, [])

  // ── 저장 ──

  const handleSave = useCallback(async () => {
    if (!projectId) return
    setSaving(true)
    setSaveMessage(null)

    try {
      const payload: EstimateData = {
        customerInfo,
        checkedWorks,
        measurements,
        areas,
        costRates,
        detailRows,
        costSummary,
        priceYear,
        unitPriceSnapshot: unitPrices,
      }

      if (estimateId) {
        const { error } = await supabase
          .from('estimates')
          .update({
            data: payload,
            total_cost: costSummary.totalCost,
            updated_at: new Date().toISOString(),
          })
          .eq('id', estimateId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('estimates')
          .insert({
            project_id: projectId,
            data: payload,
            total_cost: costSummary.totalCost,
          })
          .select('id')
          .single()
        if (error) throw error
        if (data) setEstimateId(data.id)
      }

      setSaveMessage('저장됨')
      setTimeout(() => setSaveMessage(null), 2000)
    } catch (err) {
      console.error('견적서 저장 실패:', err)
      setSaveMessage('저장 실패')
      setTimeout(() => setSaveMessage(null), 3000)
    } finally {
      setSaving(false)
    }
  }, [
    projectId, customerInfo, checkedWorks, measurements, areas,
    costRates, detailRows, costSummary, priceYear, unitPrices, estimateId,
  ])

  // ── 탭 콘텐츠 렌더 ──

  function renderTabContent() {
    switch (activeTab) {
      case 'customerInfo':
        return (
          <CustomerInfoTab
            customerInfo={customerInfo}
            onCustomerInfoChange={setCustomerInfo}
            measurements={measurements}
            onMeasurementsChange={setMeasurements}
            areas={areas}
            costSummary={costSummary}
            checkedWorks={checkedWorks}
          />
        )
      case 'cover':
        return <PlaceholderTab label="표지/갑지" />
      case 'costSheet':
        return <PlaceholderTab label="원가계산서 + 집계표" />
      case 'detail':
        return (
          <PlaceholderTab
            label="내역서"
            extra={
              checkedWorks.length === 0
                ? '공사종류를 먼저 선택해 주세요.'
                : `선택된 공종: ${checkedWorks.map(w => WORK_TYPE_LABELS[w]).join(', ')}`
            }
          />
        )
      case 'unitPrice':
        return <PlaceholderTab label="일위대가" />
      case 'priceCompare':
        return <PlaceholderTab label="단가대비표" />
      default:
        return null
    }
  }

  // ── 렌더 ──

  return (
    <div className="p-6 pb-24 max-w-[1400px] mx-auto">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="px-3 py-1.5 text-[13px] border border-border-secondary rounded-lg hover:bg-surface-tertiary transition-colors"
          >
            &larr; 돌아가기
          </button>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">
            견적서
            {customerInfo.buildingName && (
              <span className="text-txt-secondary"> - {customerInfo.buildingName}</span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {saveMessage && (
            <span
              className={`text-[13px] font-medium ${
                saveMessage === '저장됨' ? 'text-[#16a34a]' : 'text-[#dc2626]'
              }`}
            >
              {saveMessage}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-accent text-white text-[13px] font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* 공사종류 체크 */}
      <div className="mb-4 p-3 bg-surface-secondary border border-border-primary rounded-[10px]">
        <span className="text-[13px] font-medium text-txt-secondary mr-4">공사종류:</span>
        {WORK_TYPE_ORDER.map(wt => (
          <label key={wt} className="inline-flex items-center mr-5 cursor-pointer">
            <input
              type="checkbox"
              checked={checkedWorks.includes(wt)}
              onChange={() => toggleWork(wt)}
              className="mr-1.5 accent-[#5e6ad2]"
            />
            <span className="text-[13px] text-txt-secondary">{WORK_TYPE_LABELS[wt]}</span>
          </label>
        ))}
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex border-b border-border-primary mb-4 overflow-x-auto">
        {TABS.map(tab => {
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-[13px] font-medium border-b-[1.5px] whitespace-nowrap transition-colors
                ${
                  active
                    ? 'border-accent text-accent-text'
                    : 'border-transparent text-txt-tertiary hover:text-txt-secondary hover:border-border-secondary cursor-pointer'
                }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="bg-surface border border-border-primary rounded-[10px] p-5">
        {renderTabContent()}
      </div>

      {/* 하단 요약 바 */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border-primary shadow-lg z-50">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <SummaryItem label="총 공사비" value={costSummary.totalCost} />
            <div className="w-px h-5 bg-border-primary" />
            <SummaryItem
              label={`시 지원 ${Math.round(costRates.subsidyRate * 100)}%`}
              value={costSummary.citySubsidy}
              color="text-link"
            />
            <div className="w-px h-5 bg-border-primary" />
            <SummaryItem
              label={`자부담 ${Math.round((1 - costRates.subsidyRate) * 100)}%`}
              value={costSummary.selfBurden}
              color="text-[#e57e25]"
            />
            <div className="w-px h-5 bg-border-primary" />
            <SummaryItem
              label="세대당 부담"
              value={costSummary.perUnitBurden}
              color="text-txt-secondary"
            />
          </div>
          <div className="text-[11px] text-txt-quaternary tabular-nums">
            공급가 {formatNumber(costSummary.supplyPrice)} + 부가세 {formatNumber(costSummary.vat)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 하단 요약 아이템 ──

function SummaryItem({
  label,
  value,
  color = 'text-txt-primary',
}: {
  label: string
  value: number
  color?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-txt-tertiary">{label}</span>
      <span className={`text-[15px] font-semibold ${color} tabular-nums`}>
        {formatNumber(value)}원
      </span>
    </div>
  )
}

// ── 구현 예정 탭 플레이스홀더 ──

function PlaceholderTab({ label, extra }: { label: string; extra?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-12 h-12 rounded-full bg-surface-secondary border border-border-primary flex items-center justify-center">
        <svg
          className="w-5 h-5 text-txt-quaternary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
          />
        </svg>
      </div>
      <p className="text-[14px] font-medium text-txt-secondary">{label} 탭</p>
      <p className="text-[13px] text-txt-tertiary">구현 예정</p>
      {extra && (
        <p className="text-[12px] text-txt-quaternary mt-1">{extra}</p>
      )}
    </div>
  )
}
