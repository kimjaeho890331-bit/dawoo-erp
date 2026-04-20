'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { DBProject } from '@/components/register/RegisterPage'

// --- Shared Tab Props ---
export interface TabProps {
  project: DBProject
  getVal: (field: keyof DBProject) => string | number | null | undefined | { id: string; name: string } | { name: string } | { name: string; work_categories?: { name: string } | null }
  onChange: (field: string, value: string | number | null) => void
  apiFieldsLocked?: boolean
}

// --- 상시 표시 필드 (읽기 전용) ---
export function InfoField({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <span className="text-[11px] text-txt-tertiary">{label}</span>
      <p className="text-[13px] text-txt-primary">{value}</p>
    </div>
  )
}

// --- 편집 가능 폼 필드 (항상 편집 가능) ---
// 입력값 여부에 따라 배경색 변경: 비어있음 = 흰색, 값 있음 = 연한 베이스(크림)
export function FormInput({ label, type = 'text', placeholder, value, onChange }: {
  label: string; type?: string; placeholder?: string
  value: string | number | null | undefined
  onChange: (v: string) => void
}) {
  const hasValue = value !== null && value !== undefined && String(value).trim() !== ''
  return (
    <div>
      <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || label}
        className={`w-full h-[36px] px-3 border rounded-lg text-[13px] focus:outline-none focus:border-[#c96442] focus:ring-2 focus:ring-[#c96442]/10 hover:border-border-secondary transition-colors ${
          hasValue ? 'bg-[#f5f4ed] border-[#e8e6dc]' : 'bg-white border-border-primary'
        }`}
      />
    </div>
  )
}

// --- 날짜+시간 분리 입력 (MM/DD 표시 + 24h 타이핑) ---
export function DateTimeInput({ label, value, onChange, timeValue, onTimeChange }: {
  label: string
  value: string | null | undefined
  onChange: (v: string | null) => void
  timeValue?: string | null
  onTimeChange?: (v: string | null) => void
}) {
  const dateRef = useRef<HTMLInputElement>(null)
  const dateVal = (value || '').substring(0, 10)
  const hasTime = onTimeChange !== undefined

  const displayDate = dateVal
    ? `${parseInt(dateVal.substring(5, 7))}월 ${parseInt(dateVal.substring(8, 10))}일`
    : ''

  // DB에서 콜론 없이 저장된 시간값 보정
  const formatTimeDisplay = (raw: string | null | undefined) => {
    if (!raw) return ''
    if (raw.includes(':')) return raw
    const digits = raw.replace(/[^0-9]/g, '')
    if (digits.length >= 3) return digits.substring(0, digits.length - 2) + ':' + digits.substring(digits.length - 2)
    return raw
  }

  return (
    <div>
      <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
      <div className={`grid gap-1.5 ${hasTime ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="relative">
          <button
            type="button"
            onClick={() => dateRef.current?.showPicker?.()}
            className={`w-full h-[36px] px-3 border rounded-lg text-[13px] text-left hover:border-border-secondary transition-colors ${
              dateVal ? 'bg-[#f5f4ed] border-[#e8e6dc]' : 'bg-white border-border-primary'
            }`}
          >
            {displayDate || <span className="text-txt-quaternary">날짜</span>}
          </button>
          <input
            ref={dateRef}
            type="date"
            value={dateVal}
            onChange={e => onChange(e.target.value || null)}
            className="absolute inset-0 opacity-0 pointer-events-none"
            tabIndex={-1}
          />
        </div>
        {hasTime && (
          <input
            type="text"
            placeholder="14:00"
            value={formatTimeDisplay(timeValue)}
            onChange={e => {
              let v = e.target.value.replace(/[^0-9]/g, '')
              if (v.length > 4) v = v.substring(0, 4)
              if (v.length >= 3) v = v.substring(0, 2) + ':' + v.substring(2)
              onTimeChange!(v || null)
            }}
            maxLength={5}
            className={`w-full h-[36px] px-3 border rounded-lg text-[13px] text-center focus:outline-none focus:border-[#c96442] focus:ring-2 focus:ring-[#c96442]/10 ${
              timeValue ? 'bg-[#f5f4ed] border-[#e8e6dc]' : 'bg-white border-border-primary'
            }`}
          />
        )}
      </div>
    </div>
  )
}

// --- 직원 드롭다운 선택 ---
export function StaffSelect({ label, value, onChange }: {
  label: string
  value: string | null | undefined
  onChange: (v: string | null) => void
}) {
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([])
  const hasValue = value !== null && value !== undefined && value !== ''

  useEffect(() => {
    supabase.from('staff').select('id, name').order('name').then(({ data }) => {
      setStaffList(data || [])
    })
  }, [])

  return (
    <div>
      <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className={`w-full h-[36px] px-3 border rounded-lg text-[13px] focus:outline-none focus:border-[#c96442] focus:ring-2 focus:ring-[#c96442]/10 ${
          hasValue ? 'bg-[#f5f4ed] border-[#e8e6dc]' : 'bg-white border-border-primary'
        }`}
      >
        <option value="">선택</option>
        {staffList.map(s => (
          <option key={s.id} value={s.name}>{s.name}</option>
        ))}
      </select>
    </div>
  )
}

// --- API 필드 잠금 입력 ---
export function LockedFormInput({ label, type = 'text', placeholder, value, onChange, locked }: {
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
