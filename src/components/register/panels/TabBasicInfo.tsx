'use client'

import { useState } from 'react'
import type { TabProps } from './panelHelpers'
import { LockedFormInput } from './panelHelpers'

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

export default function TabBasicInfo({ project, getVal, onChange, apiFieldsLocked }: TabProps) {
  const [bankImage, setBankImage] = useState<string | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [owners, setOwners] = useState<OwnerInfo[]>([])
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
      // 주소 검색으로 코드 추출
      const searchRes = await fetch(`/api/address/search?keyword=${encodeURIComponent(addr)}`)
      const searchData = await searchRes.json()
      const results = searchData?.results?.juso
      if (!results || results.length === 0) {
        setOwnerError('주소 코드를 찾을 수 없습니다')
        return
      }
      const matched = results[0]
      const params = new URLSearchParams({
        sigunguCd: matched.admCd?.substring(0, 5) || '',
        bjdongCd: matched.admCd?.substring(5, 10) || '',
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
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">건축물대장 (표제부)</h3>
        <div className="space-y-3">
          <LockedFormInput label="지번주소" value={getVal('jibun_address') as string} onChange={v => onChange('jibun_address', v || null)} locked={apiFieldsLocked} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <LockedFormInput label="용도" value={getVal('building_use') as string} onChange={v => onChange('building_use', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="면적 (m2)" type="number" value={getVal('area') as number} onChange={v => onChange('area', Number(v) || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="사용승인일" type="date" value={getVal('approval_date') as string} onChange={v => onChange('approval_date', v || null)} locked={apiFieldsLocked} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">전유부</h3>
        <div className="grid grid-cols-2 gap-3">
          <LockedFormInput label="동" placeholder="예: 101동" value={getVal('dong') as string} onChange={v => onChange('dong', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="호" placeholder="예: 201호" value={getVal('ho') as string} onChange={v => onChange('ho', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="전유면적 (m2)" type="number" value={getVal('exclusive_area') as number} onChange={v => onChange('exclusive_area', Number(v) || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="세대수" type="number" value={getVal('unit_count') as number} onChange={v => onChange('unit_count', Number(v) || null)} locked={apiFieldsLocked} />
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
