'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import FileDropZone from '@/components/common/FileDropZone'
import PaymentTable from '@/components/register/PaymentTable'
import StepTransition from '@/components/register/StepTransition'
import type { DBProject, ProjectStep } from '@/components/register/RegisterPage'

const PROGRESS_STEPS: ProjectStep[] = [
  '문의', '실사', '견적전달', '동의서', '신청서제출',
  '승인', '착공계', '공사', '완료서류제출', '입금',
]

const STEP_LABELS_SHORT = [
  '문의', '실사', '견적', '동의', '신청',
  '승인', '착공', '공사', '완료', '입금',
]

const TABS = ['기본정보', '1단계', '2단계', '3~4단계', '서류/첨부', '이력'] as const
type TabKey = (typeof TABS)[number]

function getStepIndex(step: string): number {
  return PROGRESS_STEPS.indexOf(step as ProjectStep)
}

interface Props {
  project: DBProject | null
  category: '소규모' | '수도'
  onClose: () => void
  onEdit?: (project: DBProject) => void
  onDelete?: (project: DBProject) => void
  onRefresh?: () => void
}

export default function ProjectDetailPanel({ project, category, onClose, onDelete, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('기본정보')
  const [editData, setEditData] = useState<Record<string, string | number | null>>({})
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [apiFieldsLocked, setApiFieldsLocked] = useState(true)
  const [infoExpanded, setInfoExpanded] = useState(false)
  const [editingMemo, setEditingMemo] = useState(false)

  useEffect(() => {
    if (project) {
      setEditData({})
      setHasChanges(false)
      setApiFieldsLocked(true)
      // 현재 단계에 맞는 탭 자동 선택
      const stepIdx = getStepIndex(project.status)
      if (stepIdx <= 0) setActiveTab('기본정보')
      else if (stepIdx <= 4) setActiveTab('1단계')
      else if (stepIdx <= 7) setActiveTab('2단계')
      else if (stepIdx <= 9) setActiveTab('3~4단계')
      else setActiveTab('기본정보')
    }
  }, [project])

  const updateField = useCallback((field: string, value: string | number | null) => {
    setEditData(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }, [])

  const handleSave = async () => {
    if (!project || !hasChanges) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('projects')
        .update(editData)
        .eq('id', project.id)
      if (error) throw error
      setHasChanges(false)
      setEditData({})
      onRefresh?.()
    } catch (err) {
      console.error('저장 실패:', err)
      alert('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!project) return
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id)
      if (error) throw error
      setShowDeleteConfirm(false)
      onClose()
      onDelete?.(project)
    } catch (err) {
      console.error('삭제 실패:', err)
      alert('삭제에 실패했습니다.')
    }
  }

  if (!project) return null

  const currentStepIdx = getStepIndex(project.status)

  const getVal = (field: keyof DBProject) => {
    if (field in editData) return editData[field]
    return project[field]
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-30" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-[600px] bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.12)] z-40 flex flex-col animate-slide-in overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary">
          <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">{project.building_name || '(이름없음)'}</h2>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-[11px] font-medium text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            )}
            <button
              onClick={() => setApiFieldsLocked(prev => !prev)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
                apiFieldsLocked
                  ? 'text-txt-tertiary border border-border-primary hover:bg-surface-tertiary'
                  : 'text-accent border border-accent/30 bg-accent/5'
              }`}
            >
              {apiFieldsLocked ? '수정' : '수정중'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-1.5 text-[11px] font-medium text-[#dc2626] border border-[#fecaca] rounded-lg hover:bg-red-50 transition-colors"
            >
              삭제
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-tertiary text-txt-tertiary hover:text-txt-secondary transition-colors"
            >
              &#x2715;
            </button>
          </div>
        </div>

        {/* 프로그레스 바 - 슬림 라인 스타일 */}
        <div className="px-6 py-3 border-b border-border-tertiary">
          <div className="relative">
            {/* 배경 라인 */}
            <div className="absolute top-[11px] left-3 right-3 h-[2px] bg-[#f3f4f6]" />
            {/* 진행 라인 */}
            <div
              className="absolute top-[11px] left-3 h-[2px] bg-accent transition-all"
              style={{ width: `${(currentStepIdx / (PROGRESS_STEPS.length - 1)) * 100}%` }}
            />
            {/* 단계 점 */}
            <div className="relative flex justify-between">
              {PROGRESS_STEPS.map((step, idx) => (
                <div key={step} className="flex flex-col items-center" style={{ width: '10%' }}>
                  <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-semibold transition-all ${
                    idx < currentStepIdx
                      ? 'bg-accent text-white'
                      : idx === currentStepIdx
                      ? 'bg-accent text-white shadow-md shadow-accent/20'
                      : 'bg-surface text-txt-quaternary border-2 border-[#f3f4f6]'
                  }`}>
                    {idx < currentStepIdx ? <Check size={12} className="text-white" /> : idx + 1}
                  </div>
                  <span className={`mt-1 text-[9px] leading-tight text-center whitespace-nowrap ${
                    idx === currentStepIdx
                      ? 'text-accent font-medium'
                      : idx < currentStepIdx
                      ? 'text-txt-secondary'
                      : 'text-txt-quaternary'
                  }`}>
                    {STEP_LABELS_SHORT[idx]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 단계 전환 */}
        <StepTransition project={project} onStepChange={() => onRefresh?.()} />

        {/* 상시 표시 영역 - 접기/펼치기 */}
        <div className="px-6 py-3 border-b border-border-tertiary bg-surface-secondary">
          {/* 항상 표시: 빌라명 + 단계 */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[14px] font-semibold text-txt-primary">{project.building_name || '(이름없음)'}</span>
            <span className={`badge ${
              currentStepIdx <= 4 ? 'bg-status-docs-bg text-status-docs-text' :
              currentStepIdx <= 7 ? 'bg-status-construction-bg text-status-construction-text' :
              'bg-status-done-bg text-status-done-text'
            }`}>{project.status}</span>
          </div>

          {/* 펼친 상태: 상세 정보 */}
          {infoExpanded && (
            <div className="space-y-1.5 mb-2 text-[13px]">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                <InfoField label="담당자" value={project.staff?.name || '-'} />
                <InfoField label="공사종류" value={project.work_types?.name || '-'} />
              </div>
              <InfoField label="주소" value={project.road_address || '-'} full />
              <div className="grid grid-cols-2 gap-x-6">
                <InfoField label="소유주" value={project.owner_name || '-'} />
                <InfoField label="연락처" value={project.owner_phone || '-'} />
              </div>
              {/* 메모 인라인 편집 */}
              <div>
                <span className="text-[11px] text-txt-tertiary">상담내역</span>
                {editingMemo ? (
                  <textarea
                    autoFocus
                    rows={2}
                    value={(getVal('note') as string) ?? ''}
                    onChange={e => updateField('note', e.target.value || null)}
                    onBlur={() => setEditingMemo(false)}
                    className="w-full mt-0.5 px-2 py-1 border border-accent rounded-md text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-accent-light"
                  />
                ) : (
                  <p
                    onClick={() => setEditingMemo(true)}
                    className="text-[13px] text-txt-secondary cursor-pointer hover:bg-surface-tertiary rounded px-1 py-0.5 -mx-1 transition-colors truncate"
                    title="클릭하여 수정"
                  >
                    {(getVal('note') as string) || '-'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 항상 표시: 금액 5개 */}
          <div className="grid grid-cols-5 gap-2 pt-2 border-t border-surface-tertiary">
            <MiniStat label="총공사비" value={project.total_cost} />
            <MiniStat label="자부담금" value={project.self_pay} />
            <MiniStat label="시지원금" value={project.city_support} />
            <MiniStat label="추가공사금" value={project.additional_cost || 0} />
            <MiniStat label="미수금" value={project.outstanding} highlight />
          </div>

          {/* 펼치기/접기 토글 */}
          <button
            onClick={() => setInfoExpanded(prev => !prev)}
            className="w-full mt-2 py-1 text-[11px] text-txt-tertiary hover:text-accent transition-colors flex items-center justify-center gap-1"
          >
            {infoExpanded ? (
              <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg> 접기</>
            ) : (
              <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg> 상세 펼치기</>
            )}
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-border-primary px-6">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2.5 text-[11px] font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-[1.5px] border-accent text-accent-text'
                  : 'border-b-[1.5px] border-transparent text-txt-tertiary hover:text-txt-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === '기본정보' && <TabBasicInfo project={project} getVal={getVal} onChange={updateField} apiFieldsLocked={apiFieldsLocked} />}
          {activeTab === '1단계' && <TabStep1 project={project} category={category} getVal={getVal} onChange={updateField} />}
          {activeTab === '2단계' && <TabStep2 project={project} category={category} getVal={getVal} onChange={updateField} currentStepIdx={currentStepIdx} />}
          {activeTab === '3~4단계' && <TabStep34 project={project} getVal={getVal} onChange={updateField} />}
          {activeTab === '서류/첨부' && <TabDocuments projectId={project.id} />}
          {activeTab === '이력' && <TabHistory projectId={project.id} />}
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmModal
          buildingName={project.building_name || '(이름없음)'}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.25s ease-out;
        }
      `}</style>
    </>
  )
}

// --- 상시 표시 필드 (읽기 전용) ---
function InfoField({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <span className="text-[11px] text-txt-tertiary">{label}</span>
      <p className="text-[13px] text-txt-primary">{value}</p>
    </div>
  )
}

function MiniStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-txt-tertiary">{label}</p>
      <p className={`text-[11px] font-semibold tabular-nums ${highlight && value > 0 ? 'text-[#dc2626] font-medium' : 'text-txt-secondary'}`}>
        {value > 0 ? `${value.toLocaleString()}` : '-'}
      </p>
    </div>
  )
}

// --- 편집 가능 폼 필드 (항상 편집 가능) ---
function FormInput({ label, type = 'text', placeholder, value, onChange }: {
  label: string; type?: string; placeholder?: string
  value: string | number | null | undefined
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || label}
        className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light hover:border-border-secondary transition-colors"
      />
    </div>
  )
}

// --- API 필드 잠금 입력 ---
function LockedFormInput({ label, type = 'text', placeholder, value, onChange, locked }: {
  label: string; type?: string; placeholder?: string
  value: string | number | null | undefined
  onChange: (v: string) => void
  locked?: boolean
}) {
  if (locked) {
    return (
      <div>
        <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
        <p className="h-[36px] px-3 flex items-center border border-border-tertiary rounded-lg text-[13px] text-txt-secondary bg-surface-secondary">
          {value ?? '-'}
        </p>
      </div>
    )
  }
  return <FormInput label={label} type={type} placeholder={placeholder} value={value} onChange={onChange} />
}

// --- 탭별 Props ---
interface TabProps {
  project: DBProject
  getVal: (field: keyof DBProject) => string | number | null | undefined | { id: string; name: string } | { name: string } | { name: string; work_categories?: { name: string } | null }
  onChange: (field: string, value: string | number | null) => void
  apiFieldsLocked?: boolean
}

// --- 탭 1: 기본정보 ---
function TabBasicInfo({ project, getVal, onChange, apiFieldsLocked }: TabProps) {
  const [bankImage, setBankImage] = useState<string | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)

  const handleBankImageUpload = async (file: File) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string
      setBankImage(dataUrl)

      // Extract base64 data
      const base64 = dataUrl.split(',')[1]
      const mimeType = file.type || 'image/jpeg'

      setOcrLoading(true)
      try {
        const res = await fetch('/api/ocr/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, mimeType }),
        })
        const data = await res.json()
        if (data.bank_name) onChange('bank_name', data.bank_name)
        if (data.account_number) onChange('account_number', data.account_number)
        if (data.account_holder) onChange('account_holder', data.account_holder)
      } catch (err) {
        console.error('OCR failed:', err)
      } finally {
        setOcrLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">소유주/세입자</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="소유주" value={getVal('owner_name') as string} onChange={v => onChange('owner_name', v || null)} />
          <FormInput label="소유주 연락처" type="tel" value={getVal('owner_phone') as string} onChange={v => onChange('owner_phone', v || null)} />
          <FormInput label="세입자 연락처" type="tel" value={getVal('tenant_phone') as string} onChange={v => onChange('tenant_phone', v || null)} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">주소</h3>
        <div className="space-y-3">
          <LockedFormInput label="도로명주소" value={getVal('road_address') as string} onChange={v => onChange('road_address', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="지번주소" value={getVal('jibun_address') as string} onChange={v => onChange('jibun_address', v || null)} locked={apiFieldsLocked} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <LockedFormInput label="동" placeholder="예: 101동" value={getVal('dong') as string} onChange={v => onChange('dong', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="호" placeholder="예: 201호" value={getVal('ho') as string} onChange={v => onChange('ho', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="전유면적 (m2)" type="number" value={getVal('exclusive_area') as number} onChange={v => onChange('exclusive_area', Number(v) || null)} locked={apiFieldsLocked} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <LockedFormInput label="세대수" type="number" value={getVal('unit_count') as number} onChange={v => onChange('unit_count', Number(v) || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="사용승인일" type="date" value={getVal('approval_date') as string} onChange={v => onChange('approval_date', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="용도" value={getVal('building_use') as string} onChange={v => onChange('building_use', v || null)} locked={apiFieldsLocked} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">통장 정보</h3>

        {/* 통장사본 OCR 업로드 */}
        <div className="mb-3">
          <label
            className="flex flex-col items-center justify-center border-2 border-dashed border-border-secondary rounded-lg p-4 cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors"
            onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) handleBankImageUpload(f) }}
          >
            {ocrLoading ? (
              <p className="text-[13px] text-accent">OCR 처리 중...</p>
            ) : bankImage ? (
              <div className="flex items-center gap-3">
                <img src={bankImage} alt="통장사본" className="h-16 rounded border border-border-primary" />
                <p className="text-[11px] text-txt-secondary">통장사본 업로드 완료</p>
              </div>
            ) : (
              <>
                <p className="text-[13px] text-txt-tertiary">통장사본 이미지를 드래그하거나 클릭</p>
                <p className="text-[10px] text-txt-quaternary mt-1">은행명, 계좌번호, 예금주 자동 추출</p>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleBankImageUpload(f) }}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormInput label="은행" placeholder="예: 국민은행" value={getVal('bank_name') as string} onChange={v => onChange('bank_name', v || null)} />
          <FormInput label="계좌번호" value={getVal('account_number') as string} onChange={v => onChange('account_number', v || null)} />
          <FormInput label="예금주" value={getVal('account_holder') as string} onChange={v => onChange('account_holder', v || null)} />
        </div>
      </section>

      {/* 메모는 상시표시 영역으로 이동 (펼치기 시 인라인 편집) */}
    </div>
  )
}

// 수도공사 기본 단가
const DEFAULT_WATER_PRICES = {
  전용: 8500,
  공용: 4500,
  공용_세대: 150000,
}

interface WaterPricing {
  전용: number
  공용: number
  공용_세대: number
}

// --- 탭 2: 1단계 (실측~신청서) ---
function TabStep1({ project, category, getVal, onChange }: TabProps & { category: '소규모' | '수도' }) {
  const router = useRouter()
  const urlCategory = category === '소규모' ? 'small' : 'water'
  const [pricing, setPricing] = useState<WaterPricing>(DEFAULT_WATER_PRICES)
  const [pricingLoaded, setPricingLoaded] = useState(false)
  const [autoApplied, setAutoApplied] = useState(false)

  const area = (getVal('exclusive_area') as number) || 0
  const units = (getVal('unit_count') as number) || 0
  const cityName = project.cities?.name || ''
  const workTypeName = project.work_types?.name || ''
  const currentTotal = (getVal('total_cost') as number) || 0

  // 서류함 공문에서 단가 자동 로드
  useEffect(() => {
    if (!cityName) return
    fetch(`/api/pricing?city=${encodeURIComponent(cityName)}&category=${encodeURIComponent(category === '소규모' ? '소규모' : '수도')}`)
      .then(res => res.json())
      .then(data => {
        setPricing(data)
        setPricingLoaded(true)
      })
      .catch(() => setPricingLoaded(true))
  }, [cityName, category])

  // 전유면적 있고, 총공사비 없으면 자동 기입
  useEffect(() => {
    if (!pricingLoaded || autoApplied || !area || currentTotal > 0) return

    const isPublic = workTypeName === '공용수도' || workTypeName === '아파트공용'
    const cost = isPublic
      ? Math.round(area * pricing.공용 + units * pricing.공용_세대)
      : Math.round(area * pricing.전용)
    const vat = Math.round(cost * 0.1)
    const grandTotal = cost + vat
    const citySupport = Math.round(grandTotal * 0.8)
    const selfPay = grandTotal - citySupport

    onChange('total_cost', grandTotal)
    onChange('city_support', citySupport)
    onChange('self_pay', selfPay)
    setAutoApplied(true)
  }, [pricingLoaded, autoApplied, area, units, currentTotal, pricing, workTypeName, onChange])

  // 수동 재산출
  const handleRecalculate = () => {
    if (!area) {
      alert('전유면적 정보가 필요합니다.')
      return
    }
    const isPublic = workTypeName === '공용수도' || workTypeName === '아파트공용'
    const cost = isPublic
      ? Math.round(area * pricing.공용 + units * pricing.공용_세대)
      : Math.round(area * pricing.전용)
    const vat = Math.round(cost * 0.1)
    const grandTotal = cost + vat
    onChange('total_cost', grandTotal)
    onChange('city_support', Math.round(grandTotal * 0.8))
    onChange('self_pay', grandTotal - Math.round(grandTotal * 0.8))
  }

  // 미리보기 계산
  const isPublic = workTypeName === '공용수도' || workTypeName === '아파트공용'
  const pricingType = isPublic ? '공용' : '전용'
  const previewCost = area > 0
    ? (isPublic ? Math.round(area * pricing.공용 + units * pricing.공용_세대) : Math.round(area * pricing.전용))
    : 0
  const previewVat = Math.round(previewCost * 0.1)
  const previewTotal = previewCost + previewVat

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">실측</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="실측일" type="date" value={getVal('survey_date') as string} onChange={v => onChange('survey_date', v || null)} />
          <FormInput label="실측 담당자" value={getVal('survey_staff') as string} onChange={v => onChange('survey_staff', v || null)} />
          <FormInput label="면적결과" placeholder="예: 59.94m²" value={getVal('area_result') as string} onChange={v => onChange('area_result', v || null)} />
        </div>
        <div className="mt-3">
          <FormInput label="현장메모" placeholder="실측 시 특이사항" value={getVal('field_memo') as string} onChange={v => onChange('field_memo', v || null)} />
        </div>
        {category === '소규모' && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <FormInput label="접수일" type="date" value={getVal('receipt_date') as string} onChange={v => onChange('receipt_date', v || null)} />
            <FormInput label="설계금액" type="number" value={getVal('design_amount') as number} onChange={v => onChange('design_amount', Number(v) || 0)} />
          </div>
        )}
        {category === '수도' && (
          <div className="mt-3">
            <FormInput label="세대 비밀번호" placeholder="예: 1234#" value={getVal('unit_password') as string} onChange={v => onChange('unit_password', v || null)} />
          </div>
        )}
        <div className="mt-3">
          <p className="text-[11px] font-medium text-txt-tertiary mb-1">실측사진</p>
          <FileDropZone projectId={project.id} fileType="실측사진" accept="image/*" multiple compact />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">견적</h3>
        {/* 공문 기준 견적 산출 정보 */}
        {area > 0 && (
          <div className="mb-3 p-3 bg-[#eef2ff] rounded-lg border border-[#c7d2fe]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-indigo-700">
                공문 단가 기준 — {workTypeName || '수도'} [{pricingType}] ({cityName || '-'})
              </p>
              <button
                onClick={handleRecalculate}
                className="px-3 py-1 text-[11px] font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
              >
                재산출
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-txt-tertiary">전유면적:</span>
                <span className="ml-1 font-medium text-txt-primary">{area}m²</span>
              </div>
              <div>
                <span className="text-txt-tertiary">세대수:</span>
                <span className="ml-1 font-medium text-txt-primary">{units}세대</span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-indigo-200 grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <span className="text-txt-tertiary">총공사비</span>
                <p className="font-semibold text-txt-primary">{previewTotal.toLocaleString()}원</p>
              </div>
              <div>
                <span className="text-txt-tertiary">시지원 80%</span>
                <p className="font-semibold text-accent-text">{Math.round(previewTotal * 0.8).toLocaleString()}원</p>
              </div>
              <div>
                <span className="text-txt-tertiary">자부담 20%</span>
                <p className="font-semibold text-txt-secondary">{(previewTotal - Math.round(previewTotal * 0.8)).toLocaleString()}원</p>
              </div>
            </div>
            <p className="mt-2 text-[9px] text-indigo-400">
              적용 단가: {isPublic
                ? `공용 ${pricing.공용.toLocaleString()}원/m² + ${pricing.공용_세대.toLocaleString()}원/세대`
                : `전용 ${pricing.전용.toLocaleString()}원/m²`
              }
              {pricingLoaded && ' (서류함 공문 기준)'}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="총공사비" type="number" value={getVal('total_cost') as number} onChange={v => onChange('total_cost', Number(v) || 0)} />
          <FormInput label="시지원금" type="number" value={getVal('city_support') as number} onChange={v => onChange('city_support', Number(v) || 0)} />
          <FormInput label="자부담금" type="number" value={getVal('self_pay') as number} onChange={v => onChange('self_pay', Number(v) || 0)} />
          <FormInput label="추가공사금" type="number" value={getVal('additional_cost') as number} onChange={v => onChange('additional_cost', Number(v) || 0)} />
        </div>
        <button
          onClick={() => router.push(`/register/${urlCategory}/estimate?projectId=${project.id}`)}
          className="mt-3 px-4 py-2 text-[13px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
        >
          견적서 열기
        </button>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">동의서</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="동의서 수령일" type="date" value={getVal('consent_date') as string} onChange={v => onChange('consent_date', v || null)} />
        </div>
        <div className="mt-3">
          <p className="text-[11px] font-medium text-txt-tertiary mb-1">동의서 스캔</p>
          <FileDropZone projectId={project.id} fileType="동의서" accept="image/*,application/pdf" compact />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">신청서</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="신청서 제출일" type="date" value={getVal('application_date') as string} onChange={v => onChange('application_date', v || null)} />
          <FormInput label="제출자" value={getVal('application_submitter') as string} onChange={v => onChange('application_submitter', v || null)} />
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => window.open(`/register/application?projectId=${project.id}`, '_blank')}
            className="px-4 py-2 text-[13px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            신청서 미리보기
          </button>
        </div>
        <div className="mt-3">
          <p className="text-[11px] font-medium text-txt-tertiary mb-1">통장사본</p>
          <FileDropZone projectId={project.id} fileType="통장사본" accept="image/*" compact />
        </div>
      </section>
    </div>
  )
}

// --- 탭 3: 2단계 (승인 → 시공 분리) ---
function TabStep2({ project, category, getVal, onChange, currentStepIdx }: TabProps & { category: '소규모' | '수도'; currentStepIdx: number }) {
  const isBeforeApproval = currentStepIdx < 5 // '승인' 이전

  return (
    <div className="space-y-5">
      {isBeforeApproval && (
        <div className="p-3 bg-surface-secondary rounded-lg border border-border-tertiary text-center">
          <p className="text-[12px] text-txt-tertiary">승인 후 입력 가능합니다. 수정 버튼을 눌러 미리 입력할 수 있습니다.</p>
        </div>
      )}

      <div className={isBeforeApproval ? 'opacity-50' : ''}>
        <section>
          <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">승인</h3>
          <div className="grid grid-cols-2 gap-3">
            <FormInput label="승인일" type="date" value={getVal('approval_received_date') as string} onChange={v => onChange('approval_received_date', v || null)} />
          </div>
        </section>

        <section className="mt-5">
          <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">시공</h3>
          <div className="grid grid-cols-2 gap-3">
            <FormInput label="시공일" type="date" value={getVal('construction_date') as string} onChange={v => onChange('construction_date', v || null)} />
            <FormInput label="시공업체" value={getVal('contractor') as string} onChange={v => onChange('contractor', v || null)} />
            <FormInput label="장비/일용직" value={getVal('equipment') as string} onChange={v => onChange('equipment', v || null)} />
            <FormInput label="착수금" type="number" value={getVal('down_payment') as number} onChange={v => onChange('down_payment', Number(v) || 0)} />
            <FormInput label="공사완료일" type="date" value={getVal('construction_end_date') as string} onChange={v => onChange('construction_end_date', v || null)} />
          </div>

          {/* 소규모/수도 전용 */}
          {category === '수도' && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <FormInput label="직영 시공자" value={getVal('direct_worker') as string} onChange={v => onChange('direct_worker', v || null)} />
            </div>
          )}
          {category === '소규모' && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <FormInput label="시공업체 (외부)" value={getVal('external_contractor') as string} onChange={v => onChange('external_contractor', v || null)} />
              <FormInput label="기타 시공업체" value={getVal('other_contractor') as string} onChange={v => onChange('other_contractor', v || null)} />
            </div>
          )}
        </section>

        <section className="mt-5">
          <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">시공 사진</h3>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-medium text-txt-tertiary mb-1">시공전 사진</p>
              <FileDropZone projectId={project.id} fileType="시공전" accept="image/*" multiple compact />
            </div>
            <div>
              <p className="text-[11px] font-medium text-txt-tertiary mb-1">시공중 사진</p>
              <FileDropZone projectId={project.id} fileType="시공중" accept="image/*" multiple compact />
            </div>
            <div>
              <p className="text-[11px] font-medium text-txt-tertiary mb-1">시공후 사진</p>
              <FileDropZone projectId={project.id} fileType="시공후" accept="image/*" multiple compact />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

// --- 탭 4: 3~4단계 ---
function TabStep34({ project, getVal, onChange }: TabProps) {
  const handleOutstandingChange = useCallback((outstanding: number, collected: number) => {
    // projects 테이블 업데이트는 PaymentTable 내에서 처리
  }, [])

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">완료서류</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="완료서류 제출일" type="date" value={getVal('completion_doc_date') as string} onChange={v => onChange('completion_doc_date', v || null)} />
          <FormInput label="제출자" value={getVal('completion_submitter') as string} onChange={v => onChange('completion_submitter', v || null)} />
        </div>
        <div className="mt-3">
          <p className="text-[11px] font-medium text-txt-tertiary mb-1">완료보고서</p>
          <FileDropZone projectId={project.id} fileType="완료보고서" accept="image/*,application/pdf" compact />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">수금</h3>
        <PaymentTable
          projectId={project.id}
          totalCost={project.total_cost || 0}
          additionalCost={project.additional_cost || 0}
          onOutstandingChange={handleOutstandingChange}
        />
      </section>
    </div>
  )
}

// --- 탭 5: 서류/첨부 ---
function TabDocuments({ projectId }: { projectId: string }) {
  const [documents, setDocuments] = useState<{ id: string; name: string; doc_type: string; file_path: string; created_at: string }[]>([])
  const [attachments, setAttachments] = useState<{ id: string; name: string; file_type: string; file_path: string; created_at: string }[]>([])

  useEffect(() => {
    async function load() {
      const [docRes, attRes] = await Promise.all([
        supabase.from('documents').select('id, name, doc_type, file_path, created_at').eq('project_id', projectId).order('created_at'),
        supabase.from('attachments').select('id, name, file_type, file_path, created_at').eq('project_id', projectId).order('created_at'),
      ])
      setDocuments(docRes.data || [])
      setAttachments(attRes.data || [])
    }
    load()
  }, [projectId])

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path)
    return data.publicUrl
  }

  const docTypeBadge = (type: string) => {
    switch (type) {
      case '견적서': return 'bg-blue-50 text-blue-700'
      case '신청서': return 'bg-green-50 text-green-700'
      case '완료보고서': return 'bg-purple-50 text-purple-700'
      default: return 'bg-surface-secondary text-txt-secondary'
    }
  }

  // 첨부파일을 file_type별로 그룹핑
  const FILE_TYPE_GROUPS = ['통장사본', '동의서', '실측사진', '시공전', '시공중', '시공후', '완료보고서', '기타']
  const groupedAttachments = FILE_TYPE_GROUPS.map(type => ({
    type,
    files: attachments.filter(a => a.file_type === type),
  })).filter(g => g.files.length > 0)

  return (
    <div className="space-y-6">
      {/* 서류 목록 */}
      <div>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">서류 목록</h3>
        {documents.length === 0 ? (
          <div className="border border-dashed border-border-secondary rounded-[10px] p-6 text-center text-txt-tertiary text-[13px]">
            서류가 없습니다. 서류함에서 생성하면 여기에 표시됩니다.
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-3 py-2 bg-surface-secondary rounded-lg">
                <FileText size={16} className="text-txt-tertiary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-txt-primary truncate">{doc.name}</p>
                  <p className="text-[10px] text-txt-tertiary">{new Date(doc.created_at).toLocaleDateString('ko-KR')}</p>
                </div>
                <span className={`badge text-[10px] ${docTypeBadge(doc.doc_type)}`}>{doc.doc_type}</span>
                {doc.file_path && (
                  <button
                    onClick={() => window.open(getPublicUrl(doc.file_path), '_blank')}
                    className="text-[11px] text-link hover:underline"
                  >
                    보기
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 첨부파일 (그룹별) */}
      <div>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">첨부파일</h3>
        {groupedAttachments.length === 0 ? (
          <div className="border border-dashed border-border-secondary rounded-[10px] p-6 text-center text-txt-tertiary text-[13px]">
            첨부파일이 없습니다. 각 단계 탭에서 업로드하세요.
          </div>
        ) : (
          <div className="space-y-3">
            {groupedAttachments.map(group => (
              <div key={group.type}>
                <p className="text-[11px] font-medium text-txt-tertiary mb-1">{group.type} ({group.files.length})</p>
                <div className="space-y-1">
                  {group.files.map(file => (
                    <div key={file.id} className="flex items-center gap-2 px-2 py-1.5 bg-surface-secondary rounded-lg">
                      {/\.(jpg|jpeg|png|gif|webp)$/i.test(file.name) ? (
                        <img
                          src={getPublicUrl(file.file_path)}
                          alt={file.name}
                          className="w-8 h-8 rounded object-cover border border-border-primary cursor-pointer"
                          onClick={() => window.open(getPublicUrl(file.file_path), '_blank')}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-surface-tertiary flex items-center justify-center">
                          <FileText size={14} className="text-txt-tertiary" />
                        </div>
                      )}
                      <span className="flex-1 text-[11px] text-txt-secondary truncate">{file.name}</span>
                      <span className="text-[10px] text-txt-quaternary">{new Date(file.created_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 기타 파일 추가 업로드 */}
        <div className="mt-3">
          <p className="text-[11px] font-medium text-txt-tertiary mb-1">기타 파일 추가</p>
          <FileDropZone projectId={projectId} fileType="기타" accept="image/*,application/pdf" multiple compact />
        </div>
      </div>
    </div>
  )
}

// --- 탭 6: 이력 ---
function TabHistory({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<{ from_status: string; to_status: string; note: string | null; created_at: string; staff_name: string | null }[]>([])

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('status_logs')
        .select('from_status, to_status, note, created_at, staff:staff_id ( name )')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = (data || []).map((item: any) => ({
        from_status: item.from_status,
        to_status: item.to_status,
        note: item.note,
        created_at: item.created_at,
        staff_name: item.staff?.name ?? null,
      }))
      setLogs(mapped)
    }
    load()
  }, [projectId])

  return (
    <div>
      <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">단계 변경 이력</h3>
      {logs.length === 0 ? (
        <p className="text-[13px] text-txt-tertiary text-center py-6">이력이 없습니다</p>
      ) : (
        <div className="space-y-0">
          {logs.map((item, idx) => (
            <div key={idx} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-accent mt-1.5" />
                {idx < logs.length - 1 && <div className="w-0.5 flex-1 bg-surface-tertiary" />}
              </div>
              <div className="pb-4">
                <p className="text-[13px] text-txt-primary">
                  {!item.from_status ? (
                    <span className="font-medium">{item.to_status}</span>
                  ) : (
                    <>
                      <span className="text-txt-secondary">{item.from_status}</span>
                      <span className="mx-1 text-txt-tertiary">&rarr;</span>
                      <span className="font-medium">{item.to_status}</span>
                    </>
                  )}
                </p>
                <p className="text-[11px] text-txt-secondary mt-0.5">
                  {new Date(item.created_at).toLocaleDateString('ko-KR')}
                  {item.staff_name && ` · ${item.staff_name}`}
                </p>
                {item.note && <p className="text-[11px] text-txt-tertiary mt-0.5">{item.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- 삭제 확인 모달 ---
function DeleteConfirmModal({ buildingName, onConfirm, onCancel }: {
  buildingName: string; onConfirm: () => void; onCancel: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const handleConfirm = async () => {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-surface rounded-xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-sm mx-4">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-[#dc2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary mb-2">프로젝트 삭제</h3>
          <p className="text-[13px] text-txt-secondary mb-1"><span className="font-semibold">{buildingName}</span></p>
          <p className="text-[13px] text-txt-secondary mb-6">정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 px-4 py-2.5 text-[13px] font-medium text-txt-secondary border border-border-secondary rounded-lg hover:bg-surface-tertiary transition-colors">취소</button>
            <button onClick={handleConfirm} disabled={deleting} className="flex-1 px-4 py-2.5 text-[13px] font-medium text-white bg-[#dc2626] rounded-lg hover:bg-[#b91c1c] transition-colors disabled:opacity-50">
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
