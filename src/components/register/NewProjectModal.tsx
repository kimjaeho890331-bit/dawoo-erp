'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { DBProject } from '@/components/register/RegisterPage'

interface Props {
  category: '소규모' | '수도'
  onClose: () => void
  onSubmit: () => void
  editProject?: DBProject
}

export default function NewProjectModal({ category, onClose, onSubmit, editProject }: Props) {
  const isEdit = !!editProject
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([])
  const [cities, setCities] = useState<{ id: string; name: string }[]>([])
  const [workTypes, setWorkTypes] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    building_name: '',
    road_address: '',
    jibun_address: '',
    owner_name: '',
    owner_phone: '',
    tenant_phone: '',
    note: '',
    work_type_id: '',
    staff_id: '',
    city_id: '',
  })

  const [errors, setErrors] = useState<Record<string, boolean>>({})

  // 초기 데이터 로드
  useEffect(() => {
    async function load() {
      const [staffRes, citiesRes, typesRes] = await Promise.all([
        supabase.from('staff').select('id, name').order('name'),
        supabase.from('cities').select('id, name').order('name'),
        supabase
          .from('work_types')
          .select('id, name, work_categories!inner( name )')
          .eq('work_categories.name', category),
      ])

      const staffData = staffRes.data || []
      const citiesData = citiesRes.data || []
      const typesData = (typesRes.data || []) as { id: string; name: string }[]

      setStaff(staffData)
      setCities(citiesData)
      setWorkTypes(typesData)

      // 수정 모드일 때 기존 데이터로 채우기
      if (editProject) {
        setForm({
          building_name: editProject.building_name || '',
          road_address: editProject.road_address || '',
          jibun_address: editProject.jibun_address || '',
          owner_name: editProject.owner_name || '',
          owner_phone: editProject.owner_phone || '',
          tenant_phone: editProject.tenant_phone || '',
          note: editProject.note || '',
          work_type_id: editProject.work_type_id || typesData[0]?.id || '',
          staff_id: editProject.staff_id || staffData[0]?.id || '',
          city_id: editProject.city_id || citiesData[0]?.id || '',
        })
      } else {
        // 신규등록 기본값
        setForm(prev => ({
          ...prev,
          staff_id: staffData[0]?.id || '',
          city_id: citiesData[0]?.id || '',
          work_type_id: typesData[0]?.id || '',
        }))
      }
    }
    load()
  }, [category, editProject])

  const update = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: false }))
    }
  }

  const handleSubmit = async () => {
    const required = ['building_name', 'road_address', 'owner_name', 'owner_phone', 'note']
    const newErrors: Record<string, boolean> = {}
    let hasError = false
    required.forEach(field => {
      if (!(form as Record<string, string>)[field]?.trim()) {
        newErrors[field] = true
        hasError = true
      }
    })
    if (hasError) {
      setErrors(newErrors)
      return
    }

    setSaving(true)
    try {
      const payload = {
        building_name: form.building_name,
        road_address: form.road_address,
        jibun_address: form.jibun_address || null,
        owner_name: form.owner_name,
        owner_phone: form.owner_phone,
        tenant_phone: form.tenant_phone || null,
        note: form.note,
        work_type_id: form.work_type_id || null,
        staff_id: form.staff_id || null,
        city_id: form.city_id || null,
      }

      if (isEdit) {
        const { error } = await supabase
          .from('projects')
          .update(payload)
          .eq('id', editProject!.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('projects').insert({
          ...payload,
          status: '문의',
          year: new Date().getFullYear(),
        })
        if (error) throw error
      }

      onSubmit()
    } catch (err) {
      console.error(isEdit ? '수정 실패:' : '등록 실패:', err)
      alert(isEdit ? '수정에 실패했습니다. 다시 시도해주세요.' : '등록에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative bg-surface rounded-xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary -mx-6 -mt-6 mb-4">
          <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">
            {isEdit ? `${category} 수정` : `${category} 신규등록`}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-tertiary text-txt-tertiary hover:text-txt-secondary"
          >
            &#x2715;
          </button>
        </div>

        {/* 본문 */}
        <div className="space-y-4">
          <p className="text-[11px] text-txt-tertiary">* 필수 입력</p>

          <ModalField
            label="빌라명 *"
            value={form.building_name}
            onChange={v => update('building_name', v)}
            placeholder="예: 수원 행복빌라"
            error={errors.building_name}
          />

          <ModalField
            label="도로명주소 *"
            value={form.road_address}
            onChange={v => update('road_address', v)}
            placeholder="예: 경기도 수원시 팔달구 인계로 123번길 45"
            error={errors.road_address}
          />

          <ModalField
            label="지번주소"
            value={form.jibun_address}
            onChange={v => update('jibun_address', v)}
            placeholder="예: 경기도 수원시 팔달구 인계동 123-45"
          />

          <div className="grid grid-cols-2 gap-4">
            <ModalField
              label="소유주 *"
              value={form.owner_name}
              onChange={v => update('owner_name', v)}
              placeholder="예: 김영수"
              error={errors.owner_name}
            />
            <ModalField
              label="연락처 *"
              value={form.owner_phone}
              onChange={v => update('owner_phone', v)}
              placeholder="010-0000-0000"
              type="tel"
              error={errors.owner_phone}
            />
          </div>

          <ModalField
            label="세입자 연락처"
            value={form.tenant_phone}
            onChange={v => update('tenant_phone', v)}
            placeholder="010-0000-0000"
            type="tel"
          />

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">공사종류 *</label>
              <select
                value={form.work_type_id}
                onChange={e => update('work_type_id', e.target.value)}
                className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              >
                {workTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">담당직원 *</label>
              <select
                value={form.staff_id}
                onChange={e => update('staff_id', e.target.value)}
                className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              >
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">시 *</label>
              <select
                value={form.city_id}
                onChange={e => update('city_id', e.target.value)}
                className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              >
                {cities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">상담내역/메모 *</label>
            <textarea
              value={form.note}
              onChange={e => update('note', e.target.value)}
              rows={3}
              placeholder="상담 내용을 입력하세요"
              className={`w-full px-3 py-2 border rounded-lg text-[13px] resize-none focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light ${
                errors.note ? 'border-[#fecaca] bg-red-50' : 'border-border-primary'
              }`}
            />
            {errors.note && <p className="text-[11px] text-[#dc2626] mt-1">필수 입력입니다</p>}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border-primary -mx-6 -mb-6 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] text-txt-secondary border border-border-secondary rounded-lg hover:bg-surface-tertiary transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-[13px] text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors font-medium disabled:opacity-50"
          >
            {saving ? (isEdit ? '수정 중...' : '등록 중...') : (isEdit ? '수정' : '등록')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalField({
  label, value, onChange, placeholder, type = 'text', error,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; error?: boolean
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-[36px] px-3 border rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light ${
          error ? 'border-[#fecaca] bg-red-50' : 'border-border-primary'
        }`}
      />
      {error && <p className="text-[11px] text-[#dc2626] mt-1">필수 입력입니다</p>}
    </div>
  )
}
