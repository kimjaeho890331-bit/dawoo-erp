'use client'

import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatPhone } from '@/lib/utils/format'
import { useAuth } from '@/components/AuthProvider'
import type { DBProject } from '@/components/register/RegisterPage'

// --- 주소 검색 결과 타입 ---
interface AddressResult {
  roadAddr: string
  jibunAddr: string
  bdNm: string
  admCd: string
  lnbrMnnm: string
  lnbrSlno: string
  sigunguCd: string
  bjdongCd: string
}

// --- 건축물대장 결과 타입 ---
interface BuildingInfo {
  bldNm: string
  mainPurpsCdNm: string
  etcPurps: string
  hhldCnt: number
  useAprDay: string
  strctCdNm: string
  grndFlrCnt: number
  ugrndFlrCnt: number
  totArea: number
}

// --- 전유부 결과 타입 ---
interface UnitInfo {
  dongNm: string
  hoNm: string
  flrNo: number
  area: number
  exposPubuseGbCdNm: string
}

interface Props {
  category: '소규모' | '수도'
  onClose: () => void
  onSubmit: () => void
  editProject?: DBProject
}

export default function NewProjectModal({ category, onClose, onSubmit, editProject }: Props) {
  const { staff: currentStaff } = useAuth()
  const isEdit = !!editProject
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([])
  const [cities, setCities] = useState<{ id: string; name: string }[]>([])
  const [workTypes, setWorkTypes] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)

  // 주소 검색 상태
  const [addressKeyword, setAddressKeyword] = useState('')
  const [addressResults, setAddressResults] = useState<AddressResult[]>([])
  const [addressSearching, setAddressSearching] = useState(false)
  const [showAddressDropdown, setShowAddressDropdown] = useState(false)
  const addressDropdownRef = useRef<HTMLDivElement>(null)

  // 건축물 정보 상태
  const [buildingInfo, setBuildingInfo] = useState<BuildingInfo | null>(null)
  const [units, setUnits] = useState<UnitInfo[]>([])
  const [loadingBuilding, setLoadingBuilding] = useState(false)

  // 동호수 자동완성 상태
  const [hoInput, setHoInput] = useState('')
  const [showHoSuggestions, setShowHoSuggestions] = useState(false)
  const hoInputRef = useRef<HTMLDivElement>(null)

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
    support_program: '',
    // 건축물대장 자동 데이터
    building_use: '',
    unit_count: '',
    approval_date: '',
    dong: '',
    ho: '',
    exclusive_area: '',
    // 수도 전용
    water_work_type: '',
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
        const dong = editProject.dong || ''
        const ho = editProject.ho || ''
        setHoInput(dong ? `${dong} ${ho}` : ho)
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
          support_program: editProject.support_program || '',
          building_use: editProject.building_use || '',
          unit_count: editProject.unit_count?.toString() || '',
          approval_date: editProject.approval_date || '',
          dong,
          ho,
          exclusive_area: editProject.exclusive_area?.toString() || '',
          water_work_type: editProject.water_work_type || '',
        })
      } else {
        // 신규등록 기본값 — 로그인 유저를 담당직원 기본값으로
        const defaultStaffId = currentStaff?.id
          ? staffData.find(s => s.id === currentStaff.id)?.id || staffData[0]?.id || ''
          : staffData[0]?.id || ''
        setForm(prev => ({
          ...prev,
          staff_id: defaultStaffId,
          city_id: citiesData[0]?.id || '',
          work_type_id: typesData[0]?.id || '',
        }))
      }
    }
    load()
  }, [category, editProject])

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (addressDropdownRef.current && !addressDropdownRef.current.contains(e.target as Node)) {
        setShowAddressDropdown(false)
      }
      if (hoInputRef.current && !hoInputRef.current.contains(e.target as Node)) {
        setShowHoSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const update = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: false }))
    }
  }

  // 주소 검색
  const handleAddressSearch = async () => {
    if (!addressKeyword.trim()) return
    setAddressSearching(true)
    setShowAddressDropdown(true)
    try {
      const res = await fetch(`/api/address/search?keyword=${encodeURIComponent(addressKeyword)}`)
      const data = await res.json()
      setAddressResults(Array.isArray(data) ? data : [])
    } catch {
      setAddressResults([])
    } finally {
      setAddressSearching(false)
    }
  }

  // 주소 선택 시 건축물대장 + 전유부 조회
  const handleAddressSelect = async (addr: AddressResult) => {
    setShowAddressDropdown(false)
    setAddressKeyword('')

    // 주소 + 건물명 + 시 한번에 세팅
    const cityNames = ['수원', '성남', '안양', '부천', '광명', '시흥', '안산', '군포', '의왕', '과천', '용인', '화성', '오산', '평택', '하남']
    const matchedCity = cityNames.find(c => addr.roadAddr.includes(c) || addr.jibunAddr.includes(c))
    const matchedCityData = matchedCity ? cities.find(c => c.name === matchedCity) : null

    setForm(prev => ({
      ...prev,
      road_address: addr.roadAddr,
      jibun_address: addr.jibunAddr,
      building_name: addr.bdNm || prev.building_name || '',
      ...(matchedCityData ? { city_id: matchedCityData.id } : {}),
    }))
    if (errors.road_address) {
      setErrors(prev => ({ ...prev, road_address: false }))
    }

    // 건축물대장 + 전유부 동시 호출
    setLoadingBuilding(true)
    const params = new URLSearchParams({
      sigunguCd: addr.sigunguCd,
      bjdongCd: addr.bjdongCd,
      bun: addr.lnbrMnnm,
      ji: addr.lnbrSlno || '0',
    })

    try {
      const [bldRes, unitRes] = await Promise.all([
        fetch(`/api/address/building?${params.toString()}`),
        fetch(`/api/address/units?${params.toString()}`),
      ])

      const bldData: BuildingInfo | null = await bldRes.json()
      const unitData: UnitInfo[] = await unitRes.json()

      setBuildingInfo(bldData)
      setUnits(Array.isArray(unitData) ? unitData : [])

      if (bldData) {
        // 사용승인일 포맷: YYYYMMDD -> YYYY-MM-DD
        let formattedDate = ''
        if (bldData.useAprDay && bldData.useAprDay.length === 8) {
          formattedDate = `${bldData.useAprDay.substring(0, 4)}-${bldData.useAprDay.substring(4, 6)}-${bldData.useAprDay.substring(6, 8)}`
        }

        // 표제부 데이터로 자동입력 (빌라명은 기존값 우선 유지)
        setForm(prev => ({
          ...prev,
          building_use: bldData.mainPurpsCdNm || bldData.etcPurps || prev.building_use || '',
          unit_count: bldData.hhldCnt?.toString() || prev.unit_count || '',
          approval_date: formattedDate || prev.approval_date || '',
          building_name: prev.building_name || bldData.bldNm || '',
        }))
      }
    } catch (err) {
      console.error('건축물 정보 조회 실패:', err)
    } finally {
      setLoadingBuilding(false)
    }
  }

  // 동호수 자동완성에서 선택 시 전유면적 자동 입력
  const handleUnitSelect = (unit: UnitInfo) => {
    const dongVal = unit.dongNm?.trim() || ''
    const hoVal = unit.hoNm || ''
    const label = dongVal ? `${dongVal} ${hoVal}` : hoVal

    setHoInput(label)
    setShowHoSuggestions(false)
    setForm(prev => ({
      ...prev,
      dong: dongVal,
      ho: hoVal,
      exclusive_area: unit.area.toString(),
    }))
  }

  // 동호수 직접 입력 시
  const handleHoInputChange = (value: string) => {
    setHoInput(value)
    setShowHoSuggestions(true)
    // 직접 입력한 값도 form에 반영
    setForm(prev => ({
      ...prev,
      ho: value,
      dong: '',
      exclusive_area: '', // 직접 입력이면 면적 초기화 (매칭 안 되므로)
    }))
    // 정확히 매칭되는 호수가 있으면 면적 자동입력
    const matched = units.find(u => {
      const label = u.dongNm?.trim() ? `${u.dongNm.trim()} ${u.hoNm}` : u.hoNm
      return label === value
    })
    if (matched) {
      setForm(prev => ({
        ...prev,
        dong: matched.dongNm?.trim() || '',
        ho: matched.hoNm,
        exclusive_area: matched.area.toString(),
      }))
    }
  }

  // 필터링된 동호수 목록 (입력값으로 필터 - 호수 숫자 부분 매칭)
  const filteredUnits = units.filter(u => {
    if (!hoInput.trim()) return true
    const input = hoInput.trim()
    const label = u.dongNm?.trim() ? `${u.dongNm.trim()} ${u.hoNm}` : u.hoNm
    // 라벨 전체 매칭 또는 호수 번호 시작 매칭
    return label.includes(input) || u.hoNm.startsWith(input) || u.hoNm.includes(input)
  }).sort((a, b) => {
    const aNum = parseInt(a.hoNm) || 0
    const bNum = parseInt(b.hoNm) || 0
    return aNum - bNum
  })

  const handleSubmit = async () => {
    const required = ['building_name', 'road_address', 'note']
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
        support_program: form.support_program || null,
        building_use: form.building_use || null,
        unit_count: form.unit_count ? Number(form.unit_count) : null,
        approval_date: form.approval_date || null,
        dong: form.dong || null,
        ho: form.ho || null,
        exclusive_area: form.exclusive_area ? Number(form.exclusive_area) : null,
        water_work_type: form.water_work_type || null,
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

          {/* 주소 검색 */}
          <div ref={addressDropdownRef} className="relative">
            <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">
              주소 검색
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={addressKeyword}
                onChange={e => setAddressKeyword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddressSearch() } }}
                placeholder="도로명 또는 건물명으로 검색"
                className="flex-1 h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              />
              <button
                onClick={handleAddressSearch}
                disabled={addressSearching}
                className="px-4 h-[36px] text-[13px] font-medium text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Search size={14} className="text-white" />
                검색
              </button>
            </div>

            {/* 검색 결과 드롭다운 */}
            {showAddressDropdown && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-border-primary rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                {addressSearching ? (
                  <div className="px-4 py-3 text-[13px] text-txt-tertiary text-center">검색 중...</div>
                ) : addressResults.length === 0 ? (
                  <div className="px-4 py-3 text-[13px] text-txt-tertiary text-center">검색 결과가 없습니다</div>
                ) : (
                  addressResults.map((addr, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAddressSelect(addr)}
                      className="w-full text-left px-4 py-2.5 hover:bg-surface-secondary transition-colors border-b border-border-tertiary last:border-b-0"
                    >
                      <p className="text-[13px] text-txt-primary">{addr.roadAddr}</p>
                      <p className="text-[11px] text-txt-tertiary mt-0.5">{addr.jibunAddr}</p>
                      {addr.bdNm && <p className="text-[11px] text-txt-secondary mt-0.5">{addr.bdNm}</p>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 도로명주소 (자동입력, 읽기전용) */}
          <ModalField
            label="도로명주소 *"
            value={form.road_address}
            onChange={v => update('road_address', v)}
            placeholder="주소 검색으로 자동 입력됩니다"
            error={errors.road_address}
            readOnly
          />

          {/* 지번주소 (자동입력, 읽기전용) */}
          <ModalField
            label="지번주소"
            value={form.jibun_address}
            onChange={v => update('jibun_address', v)}
            placeholder="주소 검색으로 자동 입력됩니다"
            readOnly
          />

          {/* 빌라명 (자동입력, 수정가능) */}
          <ModalField
            label="빌라명 *"
            value={form.building_name}
            onChange={v => update('building_name', v)}
            placeholder="예: 수원 행복빌라"
            error={errors.building_name}
          />

          {/* 건축물대장 자동 데이터 */}
          {(buildingInfo || form.building_use || form.unit_count || form.approval_date) && (
            <div className="bg-surface-secondary rounded-lg p-3">
              <p className="text-[11px] font-medium text-txt-tertiary mb-2">건축물대장 정보</p>
              {loadingBuilding ? (
                <p className="text-[12px] text-txt-tertiary">조회 중...</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-txt-tertiary">용도</p>
                    <p className="text-[13px] text-txt-primary">{form.building_use || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-txt-tertiary">세대수</p>
                    <p className="text-[13px] text-txt-primary">{form.unit_count || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-txt-tertiary">사용승인일</p>
                    <p className="text-[13px] text-txt-primary">{form.approval_date || '-'}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 동호수 입력 + 전유면적 */}
          <div className="grid grid-cols-2 gap-4">
            <div ref={hoInputRef} className="relative">
              <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">동호수</label>
              <input
                type="text"
                value={hoInput}
                onChange={e => handleHoInputChange(e.target.value)}
                onFocus={() => units.length > 0 && setShowHoSuggestions(true)}
                placeholder="예: 301호, B01, 지하1층"
                className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              />
              {/* 자동완성 제안 목록 */}
              {showHoSuggestions && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-border-primary rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                  {filteredUnits.length > 0 ? filteredUnits.map((unit, idx) => {
                    const label = unit.dongNm?.trim() ? `${unit.dongNm.trim()} ${unit.hoNm}` : unit.hoNm
                    return (
                      <button
                        key={idx}
                        onClick={() => handleUnitSelect(unit)}
                        className="w-full text-left px-4 py-2 hover:bg-surface-secondary transition-colors border-b border-border-tertiary last:border-b-0 flex justify-between items-center"
                      >
                        <span className="text-[13px] text-txt-primary">{label}</span>
                        <span className="text-[11px] text-txt-tertiary">{unit.area.toFixed(2)}m2</span>
                      </button>
                    )
                  }) : hoInput.trim() && (
                    <div className="px-4 py-3 text-[12px] text-txt-tertiary">
                      건축물대장에 미등록 호실입니다. 직접 입력하세요.
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">전유면적 (m²)</label>
              {form.exclusive_area ? (
                <p className="h-[36px] px-3 flex items-center border border-border-tertiary rounded-lg text-[13px] text-txt-secondary bg-surface-secondary">
                  {form.exclusive_area} m²
                </p>
              ) : (
                <input type="number" step="0.01" value={form.exclusive_area} onChange={e => update('exclusive_area', e.target.value)}
                  placeholder="직접 입력"
                  className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ModalField
              label="소유주"
              value={form.owner_name}
              onChange={v => update('owner_name', v)}
              placeholder="예: 김영수"
              error={errors.owner_name}
            />
            <ModalField
              label="연락처"
              value={form.owner_phone}
              onChange={v => update('owner_phone', formatPhone(v))}
              placeholder="010-0000-0000"
              type="tel"
              error={errors.owner_phone}
            />
          </div>

          <ModalField
            label="세입자 연락처"
            value={form.tenant_phone}
            onChange={v => update('tenant_phone', formatPhone(v))}
            placeholder="010-0000-0000"
            type="tel"
          />

          {category === '소규모' && (
            <div>
              <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">지원사업</label>
              <select value={form.support_program || ''} onChange={e => update('support_program', e.target.value)}
                className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light">
                <option value="">선택</option>
                <option value="소규모">소규모</option>
                <option value="공동주택">공동주택</option>
                <option value="새빛">새빛</option>
                <option value="녹색">녹색</option>
                <option value="개인">개인</option>
              </select>
            </div>
          )}

          <div className={`grid ${category === '소규모' ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
            {category !== '소규모' && (
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
            )}
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
          </div>

          {/* 수도 전용: 공사세분류 */}
          {category === '수도' && (
            <div>
              <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">수도 공사 세분류</label>
              <select
                value={form.water_work_type}
                onChange={e => update('water_work_type', e.target.value)}
                className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              >
                <option value="">선택 안함</option>
                <option value="옥내">옥내</option>
                <option value="공용">공용</option>
                <option value="아파트">아파트</option>
              </select>
            </div>
          )}

          {/* 소규모 전용: 지원사업 종류 */}
          {category === '소규모' && (
            <div>
              <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">지원사업 종류</label>
              <select
                value={form.support_program}
                onChange={e => update('support_program', e.target.value)}
                className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              >
                <option value="">선택 안함</option>
                <option value="새빛">새빛</option>
                <option value="녹색">녹색</option>
                <option value="공동주택">공동주택</option>
              </select>
            </div>
          )}

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
  label, value, onChange, placeholder, type = 'text', error, readOnly,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; error?: boolean; readOnly?: boolean
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full h-[36px] px-3 border rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light ${
          error ? 'border-[#fecaca] bg-red-50' : 'border-border-primary'
        } ${readOnly ? 'bg-surface-secondary text-txt-secondary cursor-default' : ''}`}
      />
      {error && <p className="text-[11px] text-[#dc2626] mt-1">필수 입력입니다</p>}
    </div>
  )
}
