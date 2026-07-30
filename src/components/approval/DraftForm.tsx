'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useActor } from './ActorPicker'
import ApprovalLineModal, { type LineDraft } from './ApprovalLineModal'
import ApprovalLineView from './ApprovalLineView'
import PaymentTable from './PaymentTable'
import DetailTable from './DetailTable'
import FileAttach, { type AttachedFile } from './FileAttach'
import type { PaymentRow, DetailRow } from '@/types/approval'
import { validateApprovalLine } from '@/lib/approval/status'

const DEFAULT_BODY = '※ 첨부 파일에 견적서, 세금계산서 첨부할 것!!'

export default function DraftForm({ reportId }: { reportId?: string }) {
  const router = useRouter()
  const { actor, actorId, setActorId, staffList, loading: actorLoading } = useActor()

  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_BODY)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [details, setDetails] = useState<DetailRow[]>([])
  const [lines, setLines] = useState<LineDraft[]>([])
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [lineOpen, setLineOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!reportId) return
    const load = async () => {
      const { data: r } = await supabase.from('expense_reports').select('*').eq('id', reportId).maybeSingle()
      if (!r) return
      setTitle(r.title)
      setBodyHtml(r.body_html ?? DEFAULT_BODY)

      const [{ data: p }, { data: d }, { data: l }, { data: f }] = await Promise.all([
        supabase.from('expense_report_payments').select('*').eq('report_id', reportId).order('seq'),
        supabase.from('expense_report_details').select('*').eq('report_id', reportId).order('seq'),
        supabase.from('expense_report_lines').select('*, staff(name)').eq('report_id', reportId).order('seq'),
        supabase.from('expense_report_files').select('*').eq('report_id', reportId).order('uploaded_at'),
      ])

      setPayments((p ?? []).map(x => ({ ...x, business_no: x.business_no ?? '' })) as PaymentRow[])
      setDetails((d ?? []) as DetailRow[])
      setLines((l ?? []).map((x: Record<string, unknown>) => ({
        staff_id: x.staff_id as string,
        name: (x.staff as { name: string })?.name ?? '',
        role: x.role as LineDraft['role'],
      })))
      setFiles((f ?? []) as AttachedFile[])
    }
    load()
  }, [reportId])

  const save = useCallback(async (thenSubmit: boolean) => {
    if (!actor) { setError('기안자를 선택해 주세요'); return }

    if (thenSubmit) {
      const lineErr = validateApprovalLine(
        lines.map((l, i) => ({ ...l, seq: i, state: 'waiting' as const })),
        actor.id,
      )
      if (lineErr) { setError(lineErr); return }
    }

    setBusy(true); setError(null)

    try {
      const res = await fetch('/api/approval/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reportId, actor_staff_id: actor.id, title, body_html: bodyHtml,
          payments, details,
          lines: lines.map(l => ({ staff_id: l.staff_id, role: l.role })),
          files,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); return }

      if (!thenSubmit) {
        router.push(`/approval/${json.id}`)
        return
      }

      const sub = await fetch('/api/approval/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: json.id, actor_staff_id: actor.id }),
      })
      const subJson = await sub.json()
      if (!sub.ok) { setError(subJson.error); return }
      router.push(`/approval/${json.id}`)
    } catch {
      setError('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }, [actor, reportId, title, bodyHtml, payments, details, lines, files, router])

  const vendors = payments.map(p => p.vendor_name).filter(Boolean)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-lg font-medium mb-4">지출결의서</h1>

      <table className="w-full table-fixed text-xs mb-6">
        <tbody>
          <tr>
            <td className="w-[18%] px-2 py-2 text-txt-secondary border-b border-border-primary">기안양식</td>
            <td className="w-[32%] px-2 py-2 border-b border-border-primary">지출결의서</td>
            <td className="w-[18%] px-2 py-2 text-txt-secondary border-b border-border-primary">문서번호</td>
            <td className="px-2 py-2 text-txt-tertiary border-b border-border-primary">완료 시 부여</td>
          </tr>
          <tr>
            <td className="px-2 py-2 text-txt-secondary border-b border-border-primary">보존연한</td>
            <td className="px-2 py-2 border-b border-border-primary">5년</td>
            <td className="px-2 py-2 text-txt-secondary border-b border-border-primary">기안부서</td>
            <td className="px-2 py-2 border-b border-border-primary">주식회사 다우건설</td>
          </tr>
          <tr>
            <td className="px-2 py-2 text-txt-secondary">기안자 <span className="text-danger">*</span></td>
            <td className="px-2 py-2">
              <select
                value={actorId ?? ''}
                onChange={e => setActorId(e.target.value)}
                aria-label="기안자 선택"
                className="px-2 py-1.5 text-xs border border-border-primary rounded-lg bg-surface text-txt-primary"
              >
                <option value="">{actorLoading ? '불러오는 중' : '선택해 주세요'}</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </td>
            <td /><td />
          </tr>
        </tbody>
      </table>

      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">결재선 <span className="text-danger">*</span></span>
        <button onClick={() => setLineOpen(true)} className="px-3 py-1.5 text-xs border border-border-primary rounded">
          결재선 설정
        </button>
      </div>
      <div className="mb-6">
        <ApprovalLineView drafterName={actor?.name ?? ''} lines={lines} />
      </div>

      <div className="bg-accent-light text-accent-text text-xs rounded-lg px-3 py-2.5 mb-6">
        결제 관련 지출결의서 입니다.
      </div>

      <div className="text-sm font-medium mb-2">기안내용</div>
      <div className="flex items-center gap-3 mb-3">
        <span className="w-16 text-xs text-txt-secondary">기안제목 <span className="text-danger">*</span></span>
        <input value={title} onChange={e => setTitle(e.target.value.slice(0, 50))}
          className="flex-1 px-3 py-2 text-sm border border-border-primary rounded-lg" placeholder="기안제목 입력" />
        <span className="text-xs text-txt-tertiary">{title.length}/50</span>
      </div>
      <div className="flex gap-3 mb-6">
        <span className="w-16 text-xs text-txt-secondary pt-1.5">파일첨부</span>
        <div className="flex-1"><FileAttach files={files} onChange={setFiles} /></div>
      </div>

      <div className="mb-5"><PaymentTable rows={payments} onChange={setPayments} /></div>
      <div className="mb-5"><DetailTable rows={details} vendors={vendors} onChange={setDetails} /></div>

      <textarea value={bodyHtml} onChange={e => setBodyHtml(e.target.value)}
        className="w-full min-h-32 px-3 py-3 text-sm border border-border-primary rounded-lg mb-6" />

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}

      <div className="flex justify-center gap-2 border-t border-border-primary pt-5">
        <button disabled={busy || !actor} onClick={() => save(false)}
          className="px-6 py-2 text-sm border border-border-primary rounded-lg disabled:opacity-40">임시저장</button>
        <button disabled={busy || !actor} onClick={() => save(true)}
          className="px-6 py-2 text-sm rounded-lg bg-accent text-txt-inverse disabled:opacity-40">상신하기</button>
      </div>

      <ApprovalLineModal
        open={lineOpen}
        drafterStaffId={actor?.id ?? ''}
        value={lines}
        onChange={setLines}
        onClose={() => setLineOpen(false)}
      />
    </div>
  )
}
