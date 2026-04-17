'use client'

import { useCallback } from 'react'
import FileDropZone from '@/components/common/FileDropZone'
import PaymentTable from '@/components/register/PaymentTable'
import type { TabProps } from './panelHelpers'
import { DateTimeInput, StaffSelect } from './panelHelpers'

export default function TabCompletion({ project, getVal, onChange }: TabProps) {
  const handleOutstandingChange = useCallback((outstanding: number, collected: number) => {
    // projects 테이블 업데이트는 PaymentTable 내에서 처리
  }, [])

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">완료서류</h3>
        <div className="grid grid-cols-2 gap-3">
          <DateTimeInput label="완료서류 제출일" value={getVal('completion_doc_date') as string} onChange={v => onChange('completion_doc_date', v)} timeValue={getVal('completion_doc_time') as string} onTimeChange={v => onChange('completion_doc_time', v)} />
          <StaffSelect label="제출자" value={getVal('completion_submitter') as string} onChange={v => onChange('completion_submitter', v)} />
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
