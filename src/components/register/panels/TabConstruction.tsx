'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
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
        className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-[#c96442] focus:ring-2 focus:ring-[#c96442]/10"
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

export default function TabConstruction({ project, category, getVal, onChange, currentStepIdx, onRefresh }: TabProps & { category: '소규모' | '수도'; currentStepIdx: number; onRefresh?: () => void }) {
  const isBeforeApproval = currentStepIdx < 5 // '승인' 이전
  const approvalDate = getVal('approval_received_date') as string | null | undefined
  const isApproved = !!approvalDate
  const [approving, setApproving] = useState(false)

  // 승인 처리: approval_received_date=오늘 + status='승인' + status_logs
  const handleApprove = async () => {
    if (approving) return
    if (!confirm('승인 단계로 진행할까요?')) return
    setApproving(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const { error: uErr } = await supabase
        .from('projects')
        .update({ approval_received_date: today, status: '승인' })
        .eq('id', project.id)
      if (uErr) throw uErr
      await supabase.from('status_logs').insert({
        project_id: project.id,
        from_status: project.status,
        to_status: '승인',
        note: '승인 버튼 처리',
      })
      onRefresh?.()
    } catch (err) {
      console.error('승인 처리 실패:', err)
      alert('승인 처리에 실패했습니다.\n' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setApproving(false)
    }
  }

  // 승인 취소: 날짜 비우고 status를 '신청서제출'로 되돌림
  const handleUnapprove = async () => {
    if (approving) return
    if (!confirm('승인을 취소하고 신청서제출 단계로 되돌릴까요?')) return
    setApproving(true)
    try {
      const { error: uErr } = await supabase
        .from('projects')
        .update({ approval_received_date: null, status: '신청서제출' })
        .eq('id', project.id)
      if (uErr) throw uErr
      await supabase.from('status_logs').insert({
        project_id: project.id,
        from_status: project.status,
        to_status: '신청서제출',
        note: '승인 취소',
      })
      onRefresh?.()
    } catch (err) {
      console.error('승인 취소 실패:', err)
      alert('승인 취소에 실패했습니다.')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 승인 처리 영역 (opacity 영향 없이 항상 활성) */}
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">승인</h3>
        {isApproved ? (
          <div className="flex items-center justify-between gap-3 p-3 bg-[#ecfdf5] border border-[#a7f3d0] rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#059669]" />
              <span className="text-[13px] font-medium text-[#065f46]">승인 완료</span>
              <span className="text-[11px] text-[#047857] tabular-nums">({approvalDate})</span>
            </div>
            <button
              onClick={handleUnapprove}
              disabled={approving}
              className="px-2 py-1 text-[11px] text-[#065f46]/70 hover:text-[#065f46] underline disabled:opacity-50"
              title="승인 취소"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={handleApprove}
            disabled={approving}
            className="w-full h-[44px] flex items-center justify-center gap-2 bg-[#c96442] text-white font-medium rounded-lg hover:bg-[#b5573a] transition-colors disabled:opacity-50"
          >
            {approving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                처리 중...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                승인 처리
              </>
            )}
          </button>
        )}
      </section>

      {isBeforeApproval && !isApproved && (
        <div className="p-3 bg-surface-secondary rounded-lg border border-border-tertiary text-center">
          <p className="text-[12px] text-txt-tertiary">아래 항목은 승인 처리 후 입력 가능합니다.</p>
        </div>
      )}

      <div className={isBeforeApproval && !isApproved ? 'opacity-50' : ''}>
        {category === '소규모' && (
          <section>
            <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">착공서류</h3>
            <div className="grid grid-cols-2 gap-3">
              <DateTimeInput label="착공서류 제출일" value={getVal('construction_doc_date') as string} onChange={v => onChange('construction_doc_date', v)} timeValue={getVal('construction_doc_time') as string} onTimeChange={v => onChange('construction_doc_time', v)} />
              <StaffSelect label="착공서류 제출자" value={getVal('construction_doc_submitter') as string} onChange={v => onChange('construction_doc_submitter', v)} />
            </div>
          </section>
        )}

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
