'use client'

import { useState } from 'react'
import type { TabProps } from './panelHelpers'
import { LockedFormInput, FormInput, StaffIdSelect } from './panelHelpers'
import { groupUnitAreas, readAreaGroups, type AreaGroup } from '@/lib/building/areaGroups'
import AreaGroupChips from '@/components/register/AreaGroupChips'
import { toast } from '@/lib/toast'

// --- 소유자 타입 ---
interface OwnerInfo {
  name: string
  registNo: string
  ownerType: string
  share: string
  coOwnerCount: number
  changeDate: string
  dongNm: string
  hoNm: string
}

export default function TabBasicInfo({ project, getVal, onChange, apiFieldsLocked, onUnlockApiFields }: TabProps) {
  const [bankImage, setBankImage] = useState<string | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [owners, setOwners] = useState<OwnerInfo[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  // 방금 불러온 전유면적 묶음 — 자동저장이 끝나 project 가 새로 올 때까지 이걸 보여준다
  const [fetchedGroups, setFetchedGroups] = useState<AreaGroup[] | null>(null)
  const [ownerLoading, setOwnerLoading] = useState(false)
  const [ownerError, setOwnerError] = useState('')

  // 소유자 조회 (공공데이터포털 getBrOwnrInfo — 승인 대기중)
  const fetchOwners = async () => {
    const addr = project.road_address || project.jibun_address
    if (!addr) { setOwnerError('주소가 없습니다'); return }

    setOwnerLoading(true)
    setOwnerError('')
    setOwners([])
    try {
      // 주소 검색으로 코드 추출 (/api/address/search 는 매핑된 배열을 반환)
      const searchRes = await fetch(`/api/address/search?keyword=${encodeURIComponent(addr)}`)
      const searchData = await searchRes.json()
      if (!Array.isArray(searchData) || searchData.length === 0) {
        setOwnerError(searchData?.error || '주소 코드를 찾을 수 없습니다')
        return
      }
      const matched = searchData[0]
      const params = new URLSearchParams({
        sigunguCd: matched.sigunguCd || matched.admCd?.substring(0, 5) || '',
        bjdongCd: matched.bjdongCd || matched.admCd?.substring(5, 10) || '',
        bun: (matched.lnbrMnnm || '0').padStart(4, '0'),
        ji: (matched.lnbrSlno || '0').padStart(4, '0'),
      })

      const ownerRes = await fetch(`/api/address/owner?${params.toString()}`)
      const ownerData: OwnerInfo[] = await ownerRes.json()
      if (Array.isArray(ownerData) && ownerData.length > 0) {
        setOwners(ownerData)
        if (!getVal('owner_name')) {
          onChange('owner_name', ownerData[0].name)
        }
      } else {
        setOwnerError('소유자 API 승인 대기중 (공공데이터포털)')
      }
    } catch (err) {
      console.error('소유자 조회 실패:', err)
      setOwnerError('소유자 조회에 실패했습니다')
    } finally {
      setOwnerLoading(false)
    }
  }

  // 건축물대장 불러오기
  //
  // 예전에는 신규등록 창에서 주소를 고를 때 한 번만 불러왔다. 그래서 주소 없이
  // 손으로 등록한 건이나 그때 조회가 안 됐던 건은 표제부·전유부가 영영 비어 있었다
  // (지금 접수건 490건 중 연면적은 한 건도 채워져 있지 않다).
  // 여기서 다시 불러올 수 있게 한다. 채운 값은 자동저장(3초)으로 들어간다.
  const fetchLedger = async () => {
    const addr = (project.road_address || project.jibun_address || '').trim()
    if (!addr) { toast.error('주소가 없어 건축물대장을 조회할 수 없습니다'); return }

    setLedgerLoading(true)
    try {
      const searchRes = await fetch(`/api/address/search?keyword=${encodeURIComponent(addr)}`)
      const searchData = await searchRes.json()
      if (!Array.isArray(searchData) || searchData.length === 0) {
        toast.error(searchData?.error || '주소를 찾지 못해 건축물대장을 조회할 수 없습니다')
        return
      }
      const matched = searchData[0]
      const params = new URLSearchParams({
        sigunguCd: matched.sigunguCd || matched.admCd?.substring(0, 5) || '',
        bjdongCd: matched.bjdongCd || matched.admCd?.substring(5, 10) || '',
        bun: matched.lnbrMnnm || '0',
        ji: matched.lnbrSlno || '0',
      })

      const [bldRes, unitRes] = await Promise.all([
        fetch(`/api/address/building?${params.toString()}`),
        fetch(`/api/address/units?${params.toString()}`),
      ])
      const bld = await bldRes.json()
      const unitData = await unitRes.json()

      const filled: string[] = []

      if (bld && !bld.error) {
        const use = bld.mainPurpsCdNm || bld.etcPurps || ''
        if (use) { onChange('building_use', use); filled.push('용도') }
        if (bld.hhldCnt) { onChange('unit_count', Number(bld.hhldCnt)); filled.push('세대수') }
        if (bld.totArea) { onChange('total_floor_area', Number(bld.totArea)); filled.push('연면적') }
        if (typeof bld.useAprDay === 'string' && bld.useAprDay.length === 8) {
          const d = `${bld.useAprDay.substring(0, 4)}-${bld.useAprDay.substring(4, 6)}-${bld.useAprDay.substring(6, 8)}`
          onChange('approval_date', d)
          filled.push('사용승인일')
        }
        // 지번주소가 비어 있으면 채운다 (도로명만 있는 건이 많다)
        if (!project.jibun_address && matched.jibunAddr) {
          onChange('jibun_address', matched.jibunAddr)
          filled.push('지번주소')
        }
      }

      const groups = groupUnitAreas(Array.isArray(unitData) ? unitData : [])
      setFetchedGroups(groups)
      if (groups.length > 0) {
        onChange('extra_fields', { ...(project.extra_fields ?? {}), area_groups: groups })
        filled.push('전유면적')
      }

      if (filled.length === 0) {
        toast.error('건축물대장에서 가져올 내용이 없습니다 (대단지·미등재 건물)')
      } else {
        toast.success(`${filled.join(' · ')} 를 불러왔습니다`)
      }
    } catch (err) {
      console.error('건축물대장 조회 실패:', err)
      toast.error('건축물대장 조회에 실패했습니다')
    } finally {
      setLedgerLoading(false)
    }
  }

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

  // 표제부·전유부는 건축물대장에서 불러온 값이라 잠가 두지만, 예전에는 풀 방법이 없어
  // 대장이 틀렸거나 비어 있어도 고칠 수 없었다. 한 번 확인받고 이 패널에서만 푼다.
  const unlockApiFields = () => {
    if (confirm('건축물대장에서 불러온 값입니다. 직접 고칠까요?')) onUnlockApiFields?.()
  }
  const unlockButton = apiFieldsLocked && onUnlockApiFields ? (
    <button
      type="button"
      onClick={unlockApiFields}
      className="px-2 py-1 -my-1 text-[11px] font-medium text-accent-text rounded hover:bg-surface-tertiary transition-colors"
    >
      직접 고치기
    </button>
  ) : null

  return (
    <div className="space-y-5">
      {/* 대표자 · 담당자 — 대표자1은 예전 '소유주' 칸이다(저장 위치 그대로). */}
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">대표자 · 담당자</h3>
        <div className="grid grid-cols-3 gap-3">
          <FormInput
            label="대표자1"
            value={getVal('owner_name') as string}
            onChange={v => onChange('owner_name', v || null)}
          />
          <FormInput
            label="대표자1 연락처"
            type="tel"
            value={getVal('owner_phone') as string}
            onChange={v => onChange('owner_phone', v || null)}
          />
          <StaffIdSelect
            label="담당자"
            value={getVal('staff_id') as string}
            onChange={v => onChange('staff_id', v)}
          />
          <FormInput
            label="대표자2"
            value={getVal('rep2_name') as string}
            onChange={v => onChange('rep2_name', v || null)}
          />
          <FormInput
            label="대표자2 연락처"
            type="tel"
            value={getVal('rep2_phone') as string}
            onChange={v => onChange('rep2_phone', v || null)}
          />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">건축물대장 (표제부)</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={fetchLedger}
              disabled={ledgerLoading}
              className="px-2 py-1 -my-1 text-[11px] font-medium text-accent-text rounded hover:bg-surface-tertiary transition-colors disabled:opacity-50"
            >
              {ledgerLoading ? '불러오는 중...' : '대장 불러오기'}
            </button>
            {unlockButton}
          </div>
        </div>
        <div className="space-y-3">
          <LockedFormInput label="지번주소" value={getVal('jibun_address') as string} onChange={v => onChange('jibun_address', v || null)} locked={apiFieldsLocked} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <LockedFormInput label="용도" value={getVal('building_use') as string} onChange={v => onChange('building_use', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="연면적 (m²)" type="number" value={getVal('total_floor_area') as number} onChange={v => onChange('total_floor_area', Number(v) || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="사용승인일" type="date" value={getVal('approval_date') as string} onChange={v => onChange('approval_date', v || null)} locked={apiFieldsLocked} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">전유부</h3>
          {unlockButton}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LockedFormInput label="동" placeholder="예: 101동" value={getVal('dong') as string} onChange={v => onChange('dong', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="호" placeholder="예: 201호" value={getVal('ho') as string} onChange={v => onChange('ho', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="전유면적 (m2)" type="number" value={getVal('exclusive_area') as number} onChange={v => onChange('exclusive_area', Number(v) || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="세대수" type="number" value={getVal('unit_count') as number} onChange={v => onChange('unit_count', Number(v) || null)} locked={apiFieldsLocked} />
        </div>
        {/* 전유면적 (세대별) — 신규등록 창에서 보던 것과 같은 내용 */}
        <div className="mt-3">
          <p className="text-[11px] text-txt-tertiary mb-1.5">전유면적 (세대별)</p>
          <AreaGroupChips
            groups={fetchedGroups ?? readAreaGroups(project.extra_fields)}
            emptyText="전유면적 데이터 없음 — '대장 불러오기'를 눌러보세요 (대단지 건물은 조회 불가)"
          />
        </div>

        {/* 전유면적 요약 표시 */}
        {(getVal('exclusive_area') as number) > 0 && (getVal('unit_count') as number) > 0 && (
          <div className="mt-3 p-2.5 bg-surface-tertiary rounded-lg text-[12px] text-txt-secondary">
            <span className="text-txt-tertiary">면적 요약:</span>{' '}
            <span className="font-medium text-txt-primary">{String(getVal('exclusive_area'))}m²</span>
            {' x '}
            <span className="font-medium text-txt-primary">{String(getVal('unit_count'))}세대</span>
          </div>
        )}
      </section>

      {/* 소유주/세입자 섹션 제거 — 고정영역에서 표시, 기본정보는 표제부/전유부만 */}
    </div>
  )
}
