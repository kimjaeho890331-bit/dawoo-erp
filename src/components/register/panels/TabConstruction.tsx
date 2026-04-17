'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import FileDropZone from '@/components/common/FileDropZone'
import PaymentTable from '@/components/register/PaymentTable'
import type { TabProps } from './panelHelpers'
import { FormInput, DateTimeInput, StaffSelect } from './panelHelpers'

// --- 시공업체 검색 자동완성 ---
function VendorSearch({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) {
  const [query, setQuery] = useState((value as string) || '')
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([])
  const [showList, setShowList] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery((value as string) || '') }, [value])

  useEffect(() => {
    if (!query.trim()) { setVendors([]); return }
    supabase.from('vendors').select('id, name').ilike('name', `%${query}%`).limit(10)
      .then(({ data }) => setVendors(data || []))
  }, [query])

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShowList(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">시공업체</label>
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value || null); setShowList(true) }}
        onFocus={() => query && setShowList(true)}
        placeholder="업체명 검색"
        className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
      />
      {showList && vendors.length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-border-primary rounded-lg shadow-lg max-h-[150px] overflow-y-auto">
          {vendors.map(v => (
            <button key={v.id} onClick={() => { setQuery(v.name); onChange(v.name); setShowList(false) }}
              className="w-full text-left px-3 py-2 text-[13px] hover:bg-surface-secondary transition-colors border-b border-border-tertiary last:border-b-0">
              {v.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TabConstruction({ project, category, getVal, onChange, currentStepIdx }: TabProps & { category: '소규모' | '수도'; currentStepIdx: number }) {
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
            <DateTimeInput label="승인일" value={getVal('approval_received_date') as string} onChange={v => onChange('approval_received_date', v)} />
          </div>
          {category === '소규모' && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <DateTimeInput label="착공서류 제출일" value={getVal('construction_doc_date') as string} onChange={v => onChange('construction_doc_date', v)} timeValue={getVal('construction_doc_time') as string} onTimeChange={v => onChange('construction_doc_time', v)} />
              <StaffSelect label="착공서류 제출자" value={getVal('construction_doc_submitter') as string} onChange={v => onChange('construction_doc_submitter', v)} />
            </div>
          )}
        </section>

        <section className="mt-5">
          <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">시공</h3>
          <div className="grid grid-cols-2 gap-3">
            <DateTimeInput label="시공일" value={getVal('construction_date') as string} onChange={v => onChange('construction_date', v)} timeValue={getVal('construction_time') as string} onTimeChange={v => onChange('construction_time', v)} />
            <VendorSearch value={getVal('contractor') as string} onChange={v => onChange('contractor', v)} />
            {category === '수도' && (
              <FormInput label="직영 시공자" value={getVal('direct_worker') as string} onChange={v => onChange('direct_worker', v || null)} />
            )}
            <FormInput label="장비/일용직" value={getVal('equipment') as string} onChange={v => onChange('equipment', v || null)} />
            <DateTimeInput label="공사완료일" value={getVal('construction_end_date') as string} onChange={v => onChange('construction_end_date', v)} />
          </div>

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
            {['시공전', '시공중', '시공후'].map(type => (
              <div key={type}>
                <p className="text-[11px] font-medium text-txt-tertiary mb-1.5">{type}</p>
                <FileDropZone projectId={project.id} fileType={type} accept="image/*" multiple compact />
              </div>
            ))}
            <p className="text-[10px] text-txt-quaternary">각 단계별 여러 장 업로드 가능</p>
          </div>
        </section>

        {/* 수금 (1~3단계 공통) */}
        <section className="mt-5">
          <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">수금</h3>
          <PaymentTable projectId={project.id} totalCost={project.total_cost || 0} additionalCost={project.additional_cost || 0} onOutstandingChange={() => {}} />
        </section>
      </div>
    </div>
  )
}
