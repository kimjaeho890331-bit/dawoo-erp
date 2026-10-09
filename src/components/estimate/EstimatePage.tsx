'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ListChecks } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
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
import CoverTab from './tabs/CoverTab'
import CostSheetTab from './tabs/CostSheetTab'
import DetailSheetTab from './tabs/DetailSheetTab'
import UnitPriceTab from './tabs/UnitPriceTab'
import PriceCompareTab from './tabs/PriceCompareTab'

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

  const [additionalCost, setAdditionalCost] = useState(0)
  const [estimateId, setEstimateId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [projectLoaded, setProjectLoaded] = useState(false)

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
      // projects + cities JOIN으로 시 이름 가져오기
      const { data } = await supabase
        .from('projects')
        .select('building_name, road_address, dong, unit_count, approval_date, owner_name, owner_phone, city_id, exclusive_area, cities(name)')
        .eq('id', projectId)
        .single()
      if (data) {
        // 주소에서 시 이름 추출 (cities JOIN 또는 주소 파싱)
        const citiesData = data.cities as unknown as { name: string } | { name: string }[] | null
        const cityFromJoin = Array.isArray(citiesData) ? citiesData[0]?.name ?? '' : citiesData?.name ?? ''
        const CITIES_15 = ['수원','성남','안양','부천','광명','시흥','안산','군포','의왕','과천','용인','화성','오산','평택','하남']
        const cityFromAddr = CITIES_15.find(c => (data.road_address || '').includes(c)) ?? ''
        const cityName = cityFromJoin || cityFromAddr

        setCustomerInfo(prev => ({
          ...prev,
          buildingName: data.building_name ?? '',
          roadAddress: data.road_address ?? '',
          dong: 1,  // dong은 TEXT(동 이름)이므로 동수는 별도 입력
          unitCount: data.unit_count ?? 1,
          approvalDate: data.approval_date ?? '',
          ownerName: data.owner_name ?? '',
          ownerPhone: data.owner_phone ?? '',
          cityName,
          constructionDesc: `${data.building_name ?? ''} 소규모 주택개보수`,
        }))
      }
      setProjectLoaded(true)
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
          if (typeof d.additionalCost === 'number') setAdditionalCost(d.additionalCost)
        }
      }
      setLoaded(true)
    })()
  }, [projectId, loaded])

  // ── 저장 안 한 변경 ──
  // 예전에는 저장하지 않고 "돌아가기"·창 닫기를 해도 아무 경고 없이 적은 견적이 사라졌다.
  // 사람이 고치는 값만 JSON으로 비교한다 (면적·합계는 계산값, 단가는 불러올 때 바뀌는 값이라 뺀다).
  const editSnapshot = useMemo(
    () => JSON.stringify({ customerInfo, checkedWorks, measurements, costRates, detailRows, additionalCost }),
    [customerInfo, checkedWorks, measurements, costRates, detailRows, additionalCost],
  )
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  // 기준은 불러오기가 다 끝난 화면 — 접수 정보·저장된 견적을 채우는 건 사람이 고친 게 아니다
  const initialReady = !projectId || (projectLoaded && loaded)
  if (initialReady && savedSnapshot === null) setSavedSnapshot(editSnapshot)
  const dirty = savedSnapshot !== null && savedSnapshot !== editSnapshot

  // 새로고침·창 닫기 때 브라우저가 한 번 묻게 한다
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const handleBack = () => {
    if (dirty && !confirm('저장하지 않은 내용이 있습니다. 저장하지 않고 나갈까요?')) return
    router.back()
  }

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
    // 예전에는 접수 건 없이 열면 저장 버튼이 아무 반응 없이 끝났다
    if (!projectId) {
      toast.info('접수 건에서 견적서를 열어야 저장할 수 있습니다')
      return
    }
    setSaving(true)
    setSaveMessage(null)
    // 저장을 누른 순간의 화면 — 저장 중에 또 고치면 그 부분은 여전히 "저장 안 함"으로 남는다
    const snapshotAtSave = editSnapshot

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
        // 예전에는 빠져 있어 다시 열면 추가공사비가 0으로 돌아갔다
        additionalCost,
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

      setSavedSnapshot(snapshotAtSave)
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
    costRates, detailRows, costSummary, priceYear, unitPrices, estimateId, additionalCost, editSnapshot,
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
            costSummary={{ ...costSummary, additionalCost }}
            checkedWorks={checkedWorks}
            onAdditionalCostChange={setAdditionalCost}
          />
        )
      case 'cover':
        return (
          <CoverTab
            customerInfo={customerInfo}
            costSummary={costSummary}
            checkedWorks={checkedWorks}
          />
        )
      case 'costSheet':
        return (
          <CostSheetTab
            costSummary={costSummary}
            costRates={costRates}
            onCostRatesChange={setCostRates}
            checkedWorks={checkedWorks}
            detailRows={detailRows}
          />
        )
      case 'detail':
        if (checkedWorks.length === 0) {
          return <NeedWorkTypeNotice label="내역서" />
        }
        return (
          <div className="space-y-6">
            {checkedWorks.map(wt => (
              <div key={wt}>
                <h3 className="text-[14px] font-semibold text-txt-primary mb-2">
                  {WORK_TYPE_LABELS[wt]} 내역서
                </h3>
                <DetailSheetTab
                  workType={wt}
                  rows={detailRows[wt] || []}
                  onRowsChange={(rows) => setDetailRows(prev => ({ ...prev, [wt]: rows }))}
                  area={(() => {
                    switch (wt) {
                      case 'waterproof': return areas.roof_floor + areas.roof_vertical
                      case 'tile': return areas.tile
                      case 'wallPaint': case 'wallWaterRepel': return areas.wall
                      case 'stairPaint': return areas.stair
                    }
                  })()}
                />
              </div>
            ))}
          </div>
        )
      case 'unitPrice':
        if (checkedWorks.length === 0) {
          return <NeedWorkTypeNotice label="일위대가" />
        }
        return (
          <div className="space-y-6">
            {checkedWorks.map(wt => (
              <UnitPriceTab key={wt} workType={wt} />
            ))}
          </div>
        )
      case 'priceCompare':
        return <PriceCompareTab checkedWorks={checkedWorks} />
      default:
        return null
    }
  }

  // ── 렌더 ──

  return (
    <div className="md:p-6 max-w-[1400px] mx-auto">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
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
          {!saveMessage && dirty && (
            <span className="hidden sm:inline text-[12px] text-txt-tertiary">저장 안 한 변경 있음</span>
          )}
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
          {/* "PDF 저장"은 누르면 "준비 중입니다"만 떴다 — 기능이 생길 때까지 버튼을 뺀다 */}
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
              className="mr-1.5 accent-accent"
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

      {/* 하단 고정바 제거됨 — 총공사비/시지원/자부담은 고객정보 탭 원가요약에 통합 */}
    </div>
  )
}

// (하단 고정바 제거됨 — 원가요약은 CustomerInfoTab에서 표시)

// ── 공종을 아직 안 고른 탭 안내 ──
// 예전에는 큰 글씨로 "구현 예정"이 떠서 만들다 만 기능처럼 보였다 — 실제로는 공종만 고르면 나온다.

function NeedWorkTypeNotice({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-12 h-12 rounded-full bg-surface-secondary border border-border-primary flex items-center justify-center">
        <ListChecks size={20} className="text-txt-tertiary" />
      </div>
      <p className="text-[14px] font-medium text-txt-secondary">공종을 먼저 선택해 주세요</p>
      <p className="text-[13px] text-txt-tertiary text-center">
        위 「공사종류」에서 체크하면 그 공종의 {label}를 보여 줍니다.
      </p>
    </div>
  )
}
