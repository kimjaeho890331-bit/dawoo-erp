'use client'

import { Plus, Upload, FileCheck, ArrowRight } from 'lucide-react'

/**
 * 공사건 섹션 머리줄. 한 표 안에서 공사건을 구분하고 그 묶음의 소계와 동작을 모은다.
 * 결의서는 공사건을 문서당 하나만 가지므로(026) 묶음별로 한 장씩 만든다.
 */
export default function LaborSectionHead({
  colSpan, label, sourceLabel, count, netPay, assigned, busy,
  onAddWorker, onImport, onMove, onDraft,
}: {
  colSpan: number
  label: string
  /** 입찰 / 수의계약 / 지원사업 */
  sourceLabel: string | null
  count: number
  netPay: number
  /** 공사건이 지정된 묶음인가. 미지정이면 결의서를 만들 수 없다 */
  assigned: boolean
  busy?: boolean
  onAddWorker: () => void
  onImport: () => void
  onMove: () => void
  onDraft: () => void
}) {
  const btn = 'inline-flex items-center gap-1 rounded-md border border-border-primary bg-surface px-2 py-1 text-[12px] text-txt-secondary hover:bg-surface-tertiary transition disabled:opacity-50'
  return (
    <tr className="border-t-2 border-border-primary bg-surface-secondary">
      <td colSpan={colSpan} className="px-2 py-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {sourceLabel && (
            <span className="rounded border border-border-secondary px-1.5 py-0.5 text-[11px] text-txt-tertiary">
              {sourceLabel}
            </span>
          )}
          <b className={`text-[13px] ${assigned ? 'text-txt-primary' : 'text-txt-tertiary'}`}>{label}</b>
          <span className="text-[12px] text-txt-tertiary">{count}명</span>
          {assigned ? (
            <span className="text-[12px] text-txt-tertiary">
              실지급 <b className="tabular-nums text-txt-primary">{netPay.toLocaleString()}</b>원
            </span>
          ) : (
            <span className="text-[12px] text-txt-tertiary">공사건을 지정해야 결의서를 만들 수 있습니다</span>
          )}
          <span className="flex-1" />
          <button type="button" className={btn} onClick={onAddWorker}><Plus size={13} /> 근무자 추가</button>
          {assigned && (
            <button type="button" className={btn} onClick={onImport}><Upload size={13} /> 엑셀 불러오기</button>
          )}
          <button type="button" className={btn} onClick={onMove}>
            <ArrowRight size={13} /> {assigned ? '공사건 바꾸기' : '공사건 지정'}
          </button>
          {assigned && (
            <button type="button" className={btn} onClick={onDraft} disabled={busy}>
              <FileCheck size={13} /> 결의서 만들기
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
