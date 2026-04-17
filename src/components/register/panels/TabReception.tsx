'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatPhone, formatMoney, parseMoney } from '@/lib/utils/format'
import FileDropZone from '@/components/common/FileDropZone'
import type { TabProps } from './panelHelpers'
import { FormInput, DateTimeInput, StaffSelect } from './panelHelpers'

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

export default function TabReception({ project, category, getVal, onChange }: TabProps & { category: '소규모' | '수도' }) {
  const router = useRouter()
  const urlCategory = category === '소규모' ? 'small' : 'water'
  const [pricing, setPricing] = useState<WaterPricing>(DEFAULT_WATER_PRICES)
  const [pricingLoaded, setPricingLoaded] = useState(false)


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

  // 견적 자동기입 정지 — 재산출 버튼으로만 계산

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

  const timelineSteps = [
    { num: 1, label: '실측', color: 'bg-sky-500', textColor: 'text-sky-700' },
    { num: 2, label: '견적', color: 'bg-indigo-500', textColor: 'text-indigo-700' },
    { num: 3, label: '동의서', color: 'bg-violet-500', textColor: 'text-violet-700' },
    { num: 4, label: '통장', color: 'bg-pink-500', textColor: 'text-pink-700' },
    { num: 5, label: '신청서', color: 'bg-purple-500', textColor: 'text-purple-700' },
  ]

  return (
    <div className="relative pl-10">
      {/* 타임라인 세로 선 */}
      <div className="absolute left-[11px] top-3 bottom-3 w-[2px] bg-border-primary" />

      {/* 1 실측 */}
      <div className="relative pb-8">
        <div className={`absolute left-[-30px] w-6 h-6 rounded-full ${timelineSteps[0].color} text-white text-[11px] font-bold flex items-center justify-center z-10`}>1</div>
        <h3 className={`text-[13px] font-semibold ${timelineSteps[0].textColor} mb-3`}>실측</h3>
        <div className="grid grid-cols-2 gap-3">
          <DateTimeInput label="실측일" value={getVal('survey_date') as string} onChange={v => onChange('survey_date', v)} timeValue={getVal('survey_time') as string} onTimeChange={v => onChange('survey_time', v)} />
          <StaffSelect label="담당자" value={getVal('survey_staff') as string} onChange={v => onChange('survey_staff', v)} />
        </div>
        {category === '소규모' && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <FormInput label="접수일" type="date" value={getVal('receipt_date') as string} onChange={v => onChange('receipt_date', v || null)} />
          </div>
        )}
        {category === '수도' && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <FormInput label="세입자 연락처" type="tel" value={getVal('tenant_phone') as string} onChange={v => onChange('tenant_phone', formatPhone(v) || null)} />
            <FormInput label="세대 비밀번호" placeholder="예: 1234#" value={getVal('unit_password') as string} onChange={v => onChange('unit_password', v || null)} />
          </div>
        )}
        <div className="mt-3">
          <p className="text-[11px] font-medium text-txt-tertiary mb-1">실측사진</p>
          <FileDropZone projectId={project.id} fileType="실측사진" accept="image/*" multiple compact />
        </div>
      </div>

      {/* 2 견적 */}
      <div className="relative pb-8">
        <div className={`absolute left-[-30px] w-6 h-6 rounded-full ${timelineSteps[1].color} text-white text-[11px] font-bold flex items-center justify-center z-10`}>2</div>
        <h3 className={`text-[13px] font-semibold ${timelineSteps[1].textColor} mb-3`}>견적</h3>
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
          <FormInput label="시지원금" value={formatMoney((getVal('city_support') as number) || 0)} onChange={v => {
            const cs = parseMoney(v)
            onChange('city_support', cs)
            onChange('total_cost', cs + ((getVal('self_pay') as number) || 0) + ((getVal('additional_cost') as number) || 0))
          }} placeholder="0" />
          <FormInput label="자부담금" value={formatMoney((getVal('self_pay') as number) || 0)} onChange={v => {
            const sp = parseMoney(v)
            onChange('self_pay', sp)
            onChange('total_cost', ((getVal('city_support') as number) || 0) + sp + ((getVal('additional_cost') as number) || 0))
          }} placeholder="0" />
          <FormInput label="추가공사금" value={formatMoney((getVal('additional_cost') as number) || 0)} onChange={v => {
            const ac = parseMoney(v)
            onChange('additional_cost', ac)
            onChange('total_cost', ((getVal('city_support') as number) || 0) + ((getVal('self_pay') as number) || 0) + ac)
          }} placeholder="0" />
          <div>
            <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">총공사비 (자동)</label>
            <p className="h-[36px] px-3 flex items-center border border-border-tertiary rounded-lg text-[13px] font-semibold text-txt-primary bg-surface-secondary tabular-nums">
              {((getVal('total_cost') as number) || 0).toLocaleString()}원
            </p>
          </div>
        </div>
        <button
          onClick={() => router.push(`/register/${urlCategory}/estimate?projectId=${project.id}`)}
          className="mt-3 px-4 py-2 text-[13px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
        >
          견적서 열기
        </button>
      </div>

      {/* 3 동의서 */}
      {project.water_work_type !== '옥내' && (
      <div className="relative pb-8">
        <div className={`absolute left-[-30px] w-6 h-6 rounded-full ${timelineSteps[2].color} text-white text-[11px] font-bold flex items-center justify-center z-10`}>3</div>
        <h3 className={`text-[13px] font-semibold ${timelineSteps[2].textColor} mb-3`}>동의서</h3>
        <div className="grid grid-cols-2 gap-3">
          <DateTimeInput label="동의서 회수일" value={getVal('consent_date') as string} onChange={v => onChange('consent_date', v)} timeValue={getVal('consent_time') as string} onTimeChange={v => onChange('consent_time', v)} />
          <StaffSelect label="수령자" value={getVal('consent_submitter') as string} onChange={v => onChange('consent_submitter', v)} />
        </div>
        <div className="mt-3">
          <p className="text-[11px] font-medium text-txt-tertiary mb-1">동의서 스캔</p>
          <FileDropZone projectId={project.id} fileType="동의서" accept="image/*,application/pdf" compact />
        </div>
      </div>
      )}

      {/* 4 통장 */}
      <div className="relative pb-8">
        <div className="absolute left-[-30px] w-6 h-6 rounded-full bg-pink-500 text-white text-[11px] font-bold flex items-center justify-center z-10">{project.water_work_type === '옥내' ? 3 : 4}</div>
        <h3 className="text-[13px] font-semibold text-pink-700 mb-3">통장</h3>
        <div className="mb-3">
          <p className="text-[11px] font-medium text-txt-tertiary mb-1">통장사본</p>
          <FileDropZone projectId={project.id} fileType="통장사본" accept="image/*" compact />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormInput label="은행" value={getVal('bank_name') as string} onChange={v => onChange('bank_name', v || null)} placeholder="국민은행" />
          <FormInput label="예금주" value={getVal('account_holder') as string} onChange={v => onChange('account_holder', v || null)} />
          <FormInput label="계좌번호" value={getVal('account_number') as string} onChange={v => onChange('account_number', v || null)} />
        </div>
      </div>

      {/* 5 신청서 */}
      <div className="relative pb-4">
        <div className={`absolute left-[-30px] w-6 h-6 rounded-full ${timelineSteps[4].color} text-white text-[11px] font-bold flex items-center justify-center z-10`}>{project.water_work_type === '옥내' ? 4 : 5}</div>
        <h3 className={`text-[13px] font-semibold ${timelineSteps[4].textColor} mb-3`}>신청서</h3>
        <div className="grid grid-cols-2 gap-3">
          <DateTimeInput label="신청서 제출일" value={getVal('application_date') as string} onChange={v => onChange('application_date', v)} timeValue={getVal('application_time') as string} onTimeChange={v => onChange('application_time', v)} />
          <StaffSelect label="제출자" value={getVal('application_submitter') as string} onChange={v => onChange('application_submitter', v)} />
        </div>
        <div className="mt-3">
          <p className="text-[11px] font-medium text-txt-tertiary mb-1">신청서 첨부</p>
          <FileDropZone projectId={project.id} fileType="신청서" accept="image/*,application/pdf,.hwp" multiple compact />
        </div>
      </div>
    </div>
  )
}
