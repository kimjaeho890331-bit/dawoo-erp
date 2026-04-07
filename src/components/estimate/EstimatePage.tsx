'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// --- 타입 ---
interface CustomerInfo {
  buildingName: string
  roadAddress: string
  dongCount: string
  unitCount: string
  approvalDate: string
  ownerName: string
  ownerPhone: string
}

interface Measurements {
  roofWidth: number
  roofLength: number
  roofVertical: number
  tileWidth: number
  tileCoverage: number
  wallWidth: number
  wallLength: number
  wallHeight: number
  stairWidth: number
  stairLength: number
}

type WorkType = 'waterproof' | 'tile' | 'wallPaint' | 'stairPaint' | 'wallWaterRepel'

interface DetailRow {
  id: string
  name: string
  spec: string
  quantity: number
  unit: string
  materialPrice: number
  laborPrice: number
}

interface CostRow {
  workType: WorkType
  label: string
  area: number
  unit: string
  unitPrice: number
}

// --- 상수 ---
const WORK_TYPES: { key: WorkType; label: string }[] = [
  { key: 'waterproof', label: '옥상방수' },
  { key: 'tile', label: '금속기와' },
  { key: 'wallPaint', label: '외벽도장' },
  { key: 'stairPaint', label: '계단실도장' },
  { key: 'wallWaterRepel', label: '외벽발수' },
]

const WORK_LABEL: Record<WorkType, string> = {
  waterproof: '옥상방수',
  tile: '금속기와',
  wallPaint: '외벽도장',
  stairPaint: '계단실도장',
  wallWaterRepel: '외벽발수',
}

const DEFAULT_UNIT_PRICES: Record<WorkType, number> = {
  waterproof: 45000,
  tile: 65000,
  wallPaint: 25000,
  stairPaint: 20000,
  wallWaterRepel: 15000,
}

const COMPANY_INFO = {
  name: '다우건설',
  ceo: '김재호',
  bizNumber: '000-00-00000',
  address: '경기도 수원시',
  phone: '000-0000-0000',
}

type TabKey = 'customer' | 'cost' | 'quantity' | WorkType

const BASE_TABS: { key: TabKey; label: string; workType?: WorkType }[] = [
  { key: 'customer', label: '고객정보' },
  { key: 'cost', label: '원가계산서' },
  { key: 'quantity', label: '수량산출서' },
  { key: 'waterproof', label: '내역서(방수)', workType: 'waterproof' },
  { key: 'tile', label: '내역서(기와)', workType: 'tile' },
  { key: 'wallPaint', label: '내역서(외벽도장)', workType: 'wallPaint' },
  { key: 'stairPaint', label: '내역서(계단실)', workType: 'stairPaint' },
  { key: 'wallWaterRepel', label: '내역서(외벽발수)', workType: 'wallWaterRepel' },
]

function genId() {
  return Math.random().toString(36).slice(2, 9)
}

// 내역서 기본 템플릿 (JSON 기반 — 나중에 사용자 엑셀 업로드로 교체 가능)
// TODO: 사용자가 엑셀 파일 업로드 시 이 템플릿을 파싱된 엑셀 데이터로 대체
const DETAIL_TEMPLATES: Record<WorkType, { name: string; spec: string; unit: string; materialPrice: number; laborPrice: number }[]> = {
  waterproof: [
    { name: '우레탄 방수', spec: '2mm', unit: 'm2', materialPrice: 18000, laborPrice: 22000 },
    { name: '바탕처리', spec: '-', unit: 'm2', materialPrice: 3000, laborPrice: 2000 },
  ],
  tile: [
    { name: '금속기와', spec: '컬러강판', unit: 'm2', materialPrice: 30000, laborPrice: 28000 },
    { name: '방수시트', spec: '-', unit: 'm2', materialPrice: 4000, laborPrice: 3000 },
  ],
  wallPaint: [
    { name: '외벽도장', spec: '탄성코트', unit: 'm2', materialPrice: 10000, laborPrice: 12000 },
    { name: '크랙보수', spec: '-', unit: 'm2', materialPrice: 2000, laborPrice: 1000 },
  ],
  stairPaint: [
    { name: '계단실도장', spec: '수성페인트', unit: 'm2', materialPrice: 8000, laborPrice: 10000 },
    { name: '벽면보수', spec: '-', unit: 'm2', materialPrice: 1500, laborPrice: 500 },
  ],
  wallWaterRepel: [
    { name: '발수제 도포', spec: '실리콘계', unit: 'm2', materialPrice: 7000, laborPrice: 6000 },
    { name: '표면세척', spec: '-', unit: 'm2', materialPrice: 1500, laborPrice: 500 },
  ],
}

function defaultDetailRows(workType: WorkType): DetailRow[] {
  return DETAIL_TEMPLATES[workType].map(t => ({ id: genId(), quantity: 0, ...t }))
}

// --- 인라인 편집 셀 ---
function EditableCell({
  value,
  onChange,
  type = 'text',
  readOnly = false,
  align = 'left',
}: {
  value: string | number
  onChange: (v: string) => void
  type?: 'text' | 'number'
  readOnly?: boolean
  align?: 'left' | 'right' | 'center'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'

  if (readOnly) {
    return (
      <td className={`border border-border-primary px-2 py-1.5 text-[13px] bg-surface-secondary ${alignClass} tabular-nums`}>
        {type === 'number' && typeof value === 'number' ? value.toLocaleString() : value}
      </td>
    )
  }

  if (editing) {
    return (
      <td className="border border-border-primary px-0 py-0">
        <input
          autoFocus
          type={type}
          className={`w-full px-2 py-1.5 text-[13px] outline-none bg-accent/5 ${alignClass} tabular-nums`}
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

  return (
    <td
      className={`border border-border-primary px-2 py-1.5 text-[13px] bg-surface cursor-pointer hover:bg-accent/5 ${alignClass} tabular-nums`}
      onClick={() => setEditing(true)}
    >
      {type === 'number' && typeof value === 'number' ? value.toLocaleString() : value || '\u00A0'}
    </td>
  )
}

// --- 메인 ---
interface Props {
  category: string
  projectId: string | null
}

export default function EstimatePage({ category, projectId }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('customer')
  const [checkedWorks, setCheckedWorks] = useState<Set<WorkType>>(new Set())
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    buildingName: '',
    roadAddress: '',
    dongCount: '',
    unitCount: '',
    approvalDate: '',
    ownerName: '',
    ownerPhone: '',
  })
  const [measurements, setMeasurements] = useState<Measurements>({
    roofWidth: 0, roofLength: 0, roofVertical: 0,
    tileWidth: 0, tileCoverage: 0,
    wallWidth: 0, wallLength: 0, wallHeight: 0,
    stairWidth: 0, stairLength: 0,
  })
  const [unitPrices, setUnitPrices] = useState<Record<WorkType, number>>({ ...DEFAULT_UNIT_PRICES })
  const [detailRows, setDetailRows] = useState<Record<WorkType, DetailRow[]>>(() => {
    const init: Record<string, DetailRow[]> = {}
    for (const wt of WORK_TYPES) {
      init[wt.key] = defaultDetailRows(wt.key)
    }
    return init as Record<WorkType, DetailRow[]>
  })
  const [saving, setSaving] = useState(false)

  // 접수대장에서 고객정보 가져오기
  useEffect(() => {
    if (!projectId) return
    ;(async () => {
      const { data } = await supabase
        .from('projects')
        .select('building_name, road_address, dong, unit_count, approval_date, owner_name, owner_phone')
        .eq('id', projectId)
        .single()
      if (data) {
        setCustomerInfo({
          buildingName: data.building_name ?? '',
          roadAddress: data.road_address ?? '',
          dongCount: data.dong ?? '',
          unitCount: data.unit_count?.toString() ?? '',
          approvalDate: data.approval_date ?? '',
          ownerName: data.owner_name ?? '',
          ownerPhone: data.owner_phone ?? '',
        })
      }
    })()
  }, [projectId])

  // 면적 자동 계산
  const areas = useMemo(() => {
    const m = measurements
    const roofArea = m.roofWidth * m.roofLength + (m.roofWidth + m.roofLength) * 2 * m.roofVertical
    const tileArea = m.tileWidth * m.tileCoverage
    const wallArea = (m.wallWidth + m.wallLength) * 2 * m.wallHeight
    const stairArea = m.stairWidth * m.stairLength
    return {
      waterproof: roofArea,
      tile: tileArea,
      wallPaint: wallArea,
      stairPaint: stairArea,
      wallWaterRepel: wallArea,
    }
  }, [measurements])

  // 원가계산서 데이터
  const costRows: CostRow[] = useMemo(() => {
    return WORK_TYPES
      .filter(wt => checkedWorks.has(wt.key))
      .map(wt => ({
        workType: wt.key,
        label: wt.label,
        area: Math.round(areas[wt.key] * 100) / 100,
        unit: 'm\u00B2',
        unitPrice: unitPrices[wt.key],
      }))
  }, [checkedWorks, areas, unitPrices])

  const subtotal = useMemo(() => costRows.reduce((s, r) => s + r.area * r.unitPrice, 0), [costRows])
  const vat = Math.round(subtotal * 0.1)
  const total = subtotal + vat

  // 공사종류 토글
  const toggleWork = useCallback((wt: WorkType) => {
    setCheckedWorks(prev => {
      const next = new Set(prev)
      if (next.has(wt)) next.delete(wt)
      else next.add(wt)
      return next
    })
  }, [])

  // 내역서 행 수정
  const updateDetailRow = useCallback((wt: WorkType, rowId: string, field: keyof DetailRow, value: string | number) => {
    setDetailRows(prev => ({
      ...prev,
      [wt]: prev[wt].map(r => r.id === rowId ? { ...r, [field]: value } : r),
    }))
  }, [])

  const addDetailRow = useCallback((wt: WorkType) => {
    setDetailRows(prev => ({
      ...prev,
      [wt]: [...prev[wt], { id: genId(), name: '', spec: '', quantity: 0, unit: 'm2', materialPrice: 0, laborPrice: 0 }],
    }))
  }, [])

  const removeDetailRow = useCallback((wt: WorkType, rowId: string) => {
    setDetailRows(prev => ({
      ...prev,
      [wt]: prev[wt].filter(r => r.id !== rowId),
    }))
  }, [])

  // 저장 (DB 없으므로 콘솔 + 알림)
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const payload = {
        projectId,
        category,
        customerInfo,
        checkedWorks: Array.from(checkedWorks),
        measurements,
        unitPrices,
        detailRows,
        areas,
        subtotal,
        vat,
        total,
      }
      console.log('견적서 저장 데이터:', payload)
      // TODO: estimates 테이블 생성 후 Supabase에 저장
      alert('견적서가 저장되었습니다. (estimates 테이블 연동 예정)')
    } finally {
      setSaving(false)
    }
  }, [projectId, category, customerInfo, checkedWorks, measurements, unitPrices, detailRows, areas, subtotal, vat, total])

  // 측정값 업데이트 헬퍼
  const setMeasure = useCallback((key: keyof Measurements, val: string) => {
    setMeasurements(prev => ({ ...prev, [key]: parseFloat(val) || 0 }))
  }, [])

  const setCustomer = useCallback((key: keyof CustomerInfo, val: string) => {
    setCustomerInfo(prev => ({ ...prev, [key]: val }))
  }, [])

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
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
            견적서 {customerInfo.buildingName && `- ${customerInfo.buildingName}`}
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-accent text-white text-[13px] font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* 공사종류 체크 */}
      <div className="mb-4 p-3 bg-surface-secondary border border-border-primary rounded-[10px]">
        <span className="text-[13px] font-medium text-txt-secondary mr-4">공사종류:</span>
        {WORK_TYPES.map(wt => (
          <label key={wt.key} className="inline-flex items-center mr-5 cursor-pointer">
            <input
              type="checkbox"
              checked={checkedWorks.has(wt.key)}
              onChange={() => toggleWork(wt.key)}
              className="mr-1.5 accent-[#5e6ad2]"
            />
            <span className="text-[13px] text-txt-secondary">{wt.label}</span>
          </label>
        ))}
      </div>

      {/* 탭 */}
      <div className="flex border-b border-border-primary mb-4 overflow-x-auto">
        {BASE_TABS.map(tab => {
          const disabled = tab.workType ? !checkedWorks.has(tab.workType) : false
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              disabled={disabled}
              onClick={() => !disabled && setActiveTab(tab.key)}
              className={`px-4 py-2 text-[13px] font-medium border-b-[1.5px] whitespace-nowrap transition-colors
                ${active
                  ? 'border-accent text-accent-text'
                  : disabled
                    ? 'border-transparent text-txt-quaternary cursor-not-allowed'
                    : 'border-transparent text-txt-tertiary hover:text-txt-secondary hover:border-border-secondary cursor-pointer'
                }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="bg-surface border border-border-primary rounded-[10px] p-4">
        {activeTab === 'customer' && (
          <CustomerInfoTab info={customerInfo} onChange={setCustomer} />
        )}
        {activeTab === 'cost' && (
          <CostSheet
            rows={costRows}
            subtotal={subtotal}
            vat={vat}
            total={total}
            onUnitPriceChange={(wt, val) => setUnitPrices(p => ({ ...p, [wt]: parseFloat(val) || 0 }))}
          />
        )}
        {activeTab === 'quantity' && (
          <QuantitySheet
            measurements={measurements}
            areas={areas}
            checkedWorks={checkedWorks}
            onChange={setMeasure}
          />
        )}
        {WORK_TYPES.map(wt =>
          activeTab === wt.key && checkedWorks.has(wt.key) ? (
            <DetailSheet
              key={wt.key}
              workType={wt.key}
              label={wt.label}
              area={areas[wt.key]}
              rows={detailRows[wt.key]}
              onUpdate={updateDetailRow}
              onAdd={addDetailRow}
              onRemove={removeDetailRow}
            />
          ) : null
        )}
      </div>
    </div>
  )
}

// --- 고객정보 탭 ---
function CustomerInfoTab({
  info,
  onChange,
}: {
  info: CustomerInfo
  onChange: (key: keyof CustomerInfo, val: string) => void
}) {
  const fields: { key: keyof CustomerInfo; label: string; type?: string }[] = [
    { key: 'buildingName', label: '빌라명' },
    { key: 'roadAddress', label: '도로명주소' },
    { key: 'dongCount', label: '동수' },
    { key: 'unitCount', label: '세대수' },
    { key: 'approvalDate', label: '사용승인일', type: 'date' },
    { key: 'ownerName', label: '소유주' },
    { key: 'ownerPhone', label: '연락처', type: 'tel' },
  ]

  return (
    <div className="space-y-6">
      {/* 고객 정보 (메인) */}
      <div className="border border-accent/20 rounded-[10px] p-5 bg-accent/5">
        <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-4">고객 정보</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {fields.map(f => (
            <div key={f.key} className="flex items-center gap-2">
              <label className="w-24 text-[13px] font-medium text-txt-secondary shrink-0">{f.label}</label>
              <input
                type={f.type ?? 'text'}
                value={info[f.key]}
                onChange={e => onChange(f.key, e.target.value)}
                className="flex-1 h-[36px] border border-border-primary rounded-lg px-3 text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              />
            </div>
          ))}
        </div>
      </div>
      {/* 시공사 정보 (보조) */}
      <div className="border border-border-primary rounded-[10px] p-4">
        <h3 className="text-[11px] font-medium text-txt-tertiary mb-2">시공사 정보</h3>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1">
          {([
            ['회사명', COMPANY_INFO.name],
            ['대표자', COMPANY_INFO.ceo],
            ['사업자번호', COMPANY_INFO.bizNumber],
            ['주소', COMPANY_INFO.address],
            ['연락처', COMPANY_INFO.phone],
          ] as const).map(([label, val]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="text-[11px] text-txt-tertiary">{label}:</span>
              <span className="text-[11px] text-txt-secondary">{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- 원가계산서 ---
function CostSheet({
  rows,
  subtotal,
  vat,
  total,
  onUnitPriceChange,
}: {
  rows: CostRow[]
  subtotal: number
  vat: number
  total: number
  onUnitPriceChange: (wt: WorkType, val: string) => void
}) {
  return (
    <div>
      <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary mb-3">원가계산서</h3>
      {rows.length === 0 ? (
        <p className="text-[13px] text-txt-tertiary py-8 text-center">공사종류를 선택하면 원가가 표시됩니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-surface-secondary">
                <th className="border border-border-primary px-2 py-2 text-center w-12">No</th>
                <th className="border border-border-primary px-2 py-2 text-left">공종</th>
                <th className="border border-border-primary px-2 py-2 text-right w-28">수량(면적)</th>
                <th className="border border-border-primary px-2 py-2 text-center w-16">단위</th>
                <th className="border border-border-primary px-2 py-2 text-right w-32">단가</th>
                <th className="border border-border-primary px-2 py-2 text-right w-36">금액</th>
                <th className="border border-border-primary px-2 py-2 text-left w-28">비고</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const amount = Math.round(r.area * r.unitPrice)
                return (
                  <tr key={r.workType}>
                    <td className="border border-border-primary px-2 py-1.5 text-center bg-surface-secondary tabular-nums">{i + 1}</td>
                    <td className="border border-border-primary px-2 py-1.5 bg-surface-secondary">{r.label}</td>
                    <td className="border border-border-primary px-2 py-1.5 text-right bg-surface-secondary tabular-nums">{r.area.toLocaleString()}</td>
                    <td className="border border-border-primary px-2 py-1.5 text-center bg-surface-secondary">{r.unit}</td>
                    <EditableCell
                      value={r.unitPrice}
                      type="number"
                      align="right"
                      onChange={v => onUnitPriceChange(r.workType, v)}
                    />
                    <td className="border border-border-primary px-2 py-1.5 text-right bg-surface-secondary tabular-nums">{amount.toLocaleString()}</td>
                    <td className="border border-border-primary px-2 py-1.5 bg-surface-secondary"></td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-surface-secondary">
                <td colSpan={5} className="border border-border-primary px-2 py-1.5 text-right font-medium">소계</td>
                <td className="border border-border-primary px-2 py-1.5 text-right font-medium tabular-nums">{Math.round(subtotal).toLocaleString()}</td>
                <td className="border border-border-primary px-2 py-1.5"></td>
              </tr>
              <tr className="bg-surface-secondary">
                <td colSpan={5} className="border border-border-primary px-2 py-1.5 text-right font-medium">부가세 (10%)</td>
                <td className="border border-border-primary px-2 py-1.5 text-right font-medium tabular-nums">{vat.toLocaleString()}</td>
                <td className="border border-border-primary px-2 py-1.5"></td>
              </tr>
              <tr className="bg-accent/5 font-semibold">
                <td colSpan={5} className="border border-border-primary px-2 py-2 text-right">합계</td>
                <td className="border border-border-primary px-2 py-2 text-right tabular-nums">{total.toLocaleString()}</td>
                <td className="border border-border-primary px-2 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// --- 수량산출서 ---
function QuantitySheet({
  measurements,
  areas,
  checkedWorks,
  onChange,
}: {
  measurements: Measurements
  areas: Record<WorkType, number>
  checkedWorks: Set<WorkType>
  onChange: (key: keyof Measurements, val: string) => void
}) {
  const sections: {
    title: string
    workType: WorkType
    fields: { key: keyof Measurements; label: string }[]
    formula: string
    area: number
  }[] = [
    {
      title: '옥상방수',
      workType: 'waterproof',
      fields: [
        { key: 'roofWidth', label: '가로(m)' },
        { key: 'roofLength', label: '세로(m)' },
        { key: 'roofVertical', label: '수직높이(m)' },
      ],
      formula: '면적 = 가로 x 세로 + (가로+세로) x 2 x 수직높이',
      area: areas.waterproof,
    },
    {
      title: '금속기와',
      workType: 'tile',
      fields: [
        { key: 'tileWidth', label: '가로(m)' },
        { key: 'tileCoverage', label: '기와폭(m)' },
      ],
      formula: '면적 = 가로 x 기와폭',
      area: areas.tile,
    },
    {
      title: '외벽',
      workType: 'wallPaint',
      fields: [
        { key: 'wallWidth', label: '가로(m)' },
        { key: 'wallLength', label: '세로(m)' },
        { key: 'wallHeight', label: '건물높이(m)' },
      ],
      formula: '면적 = (가로+세로) x 2 x 건물높이',
      area: areas.wallPaint,
    },
    {
      title: '계단실',
      workType: 'stairPaint',
      fields: [
        { key: 'stairWidth', label: '가로(m)' },
        { key: 'stairLength', label: '세로(m)' },
      ],
      formula: '면적 = 가로 x 세로',
      area: areas.stairPaint,
    },
  ]

  return (
    <div className="space-y-6">
      <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary">수량산출서</h3>
      {sections.map(sec => {
        const active = checkedWorks.has(sec.workType) || (sec.workType === 'wallPaint' && checkedWorks.has('wallWaterRepel'))
        return (
          <div key={sec.title} className={`border border-border-primary rounded-[10px] p-4 ${!active ? 'opacity-40' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[13px] font-medium text-txt-secondary">{sec.title}</h4>
              <span className="text-[11px] text-txt-tertiary">{sec.formula}</span>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {sec.fields.map(f => (
                <div key={f.key} className="flex items-center gap-1.5">
                  <label className="text-[13px] text-txt-secondary">{f.label}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={measurements[f.key] || ''}
                    onChange={e => onChange(f.key, e.target.value)}
                    disabled={!active}
                    className="w-24 h-[36px] border border-border-primary rounded-lg px-2 text-[13px] text-right tabular-nums focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light disabled:bg-surface-secondary"
                  />
                </div>
              ))}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[13px] text-txt-secondary">산출면적:</span>
                <span className="text-[13px] font-semibold text-link tabular-nums">
                  {(Math.round(sec.area * 100) / 100).toLocaleString()} m&sup2;
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- 내역서 ---
function DetailSheet({
  workType,
  label,
  area,
  rows,
  onUpdate,
  onAdd,
  onRemove,
}: {
  workType: WorkType
  label: string
  area: number
  rows: DetailRow[]
  onUpdate: (wt: WorkType, rowId: string, field: keyof DetailRow, value: string | number) => void
  onAdd: (wt: WorkType) => void
  onRemove: (wt: WorkType, rowId: string) => void
}) {
  const totalMaterial = rows.reduce((s, r) => s + r.quantity * r.materialPrice, 0)
  const totalLabor = rows.reduce((s, r) => s + r.quantity * r.laborPrice, 0)
  const grandTotal = totalMaterial + totalLabor

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-secondary">
          {label} 내역서
          <span className="ml-2 text-[11px] font-normal text-txt-tertiary tabular-nums">
            (적용면적: {(Math.round(area * 100) / 100).toLocaleString()} m&sup2;)
          </span>
        </h3>
        <button
          onClick={() => onAdd(workType)}
          className="px-3 py-1 text-[11px] border border-accent/30 text-link rounded-lg hover:bg-accent/5 transition-colors"
        >
          + 행 추가
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-surface-secondary">
              <th className="border border-border-primary px-2 py-2 text-center w-10">No</th>
              <th className="border border-border-primary px-2 py-2 text-left">항목명</th>
              <th className="border border-border-primary px-2 py-2 text-left w-24">규격</th>
              <th className="border border-border-primary px-2 py-2 text-right w-20">수량</th>
              <th className="border border-border-primary px-2 py-2 text-center w-14">단위</th>
              <th className="border border-border-primary px-2 py-2 text-right w-28">재료비단가</th>
              <th className="border border-border-primary px-2 py-2 text-right w-28">재료비금액</th>
              <th className="border border-border-primary px-2 py-2 text-right w-28">노무비단가</th>
              <th className="border border-border-primary px-2 py-2 text-right w-28">노무비금액</th>
              <th className="border border-border-primary px-2 py-2 text-right w-32">합계</th>
              <th className="border border-border-primary px-2 py-2 text-center w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const matAmt = Math.round(r.quantity * r.materialPrice)
              const labAmt = Math.round(r.quantity * r.laborPrice)
              const rowTotal = matAmt + labAmt
              return (
                <tr key={r.id}>
                  <td className="border border-border-primary px-2 py-1.5 text-center bg-surface-secondary tabular-nums">{i + 1}</td>
                  <EditableCell value={r.name} onChange={v => onUpdate(workType, r.id, 'name', v)} />
                  <EditableCell value={r.spec} onChange={v => onUpdate(workType, r.id, 'spec', v)} />
                  <EditableCell
                    value={r.quantity}
                    type="number"
                    align="right"
                    onChange={v => onUpdate(workType, r.id, 'quantity', parseFloat(v) || 0)}
                  />
                  <EditableCell value={r.unit} align="center" onChange={v => onUpdate(workType, r.id, 'unit', v)} />
                  <EditableCell
                    value={r.materialPrice}
                    type="number"
                    align="right"
                    onChange={v => onUpdate(workType, r.id, 'materialPrice', parseFloat(v) || 0)}
                  />
                  <td className="border border-border-primary px-2 py-1.5 text-right bg-surface-secondary tabular-nums">
                    {matAmt.toLocaleString()}
                  </td>
                  <EditableCell
                    value={r.laborPrice}
                    type="number"
                    align="right"
                    onChange={v => onUpdate(workType, r.id, 'laborPrice', parseFloat(v) || 0)}
                  />
                  <td className="border border-border-primary px-2 py-1.5 text-right bg-surface-secondary tabular-nums">
                    {labAmt.toLocaleString()}
                  </td>
                  <td className="border border-border-primary px-2 py-1.5 text-right bg-surface-secondary font-medium tabular-nums">
                    {rowTotal.toLocaleString()}
                  </td>
                  <td className="border border-border-primary px-1 py-1.5 text-center">
                    <button
                      onClick={() => onRemove(workType, r.id)}
                      className="text-[#dc2626]/40 hover:text-[#dc2626] text-[11px]"
                      title="삭제"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-accent/5 font-semibold">
              <td colSpan={6} className="border border-border-primary px-2 py-2 text-right">합계</td>
              <td className="border border-border-primary px-2 py-2 text-right tabular-nums">{Math.round(totalMaterial).toLocaleString()}</td>
              <td className="border border-border-primary px-2 py-2"></td>
              <td className="border border-border-primary px-2 py-2 text-right tabular-nums">{Math.round(totalLabor).toLocaleString()}</td>
              <td className="border border-border-primary px-2 py-2 text-right tabular-nums">{Math.round(grandTotal).toLocaleString()}</td>
              <td className="border border-border-primary px-2 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
