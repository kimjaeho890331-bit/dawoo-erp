'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Upload } from 'lucide-react'
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

export default function DraftForm({ reportId, copyFromId }: { reportId?: string; copyFromId?: string }) {
  const router = useRouter()
  const { actor, actorId, setActorId, staffList, loading: actorLoading } = useActor()

  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_BODY)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [details, setDetails] = useState<DetailRow[]>([])
  const [lines, setLines] = useState<LineDraft[]>([])
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [refs, setRefs] = useState<{ id: string; doc_no: string | null; title: string }[]>([])
  const [refPool, setRefPool] = useState<{ id: string; doc_no: string | null; title: string }[]>([])
  const [lineOpen, setLineOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [excelBusy, setExcelBusy] = useState(false)
  const excelInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase
      .from('expense_reports')
      .select('id, doc_no, title')
      .eq('status', 'approved')
      .order('completed_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setRefPool(data ?? []))
  }, [])

  useEffect(() => {
    const sourceId = reportId ?? copyFromId
    if (!sourceId) return
    const load = async () => {
      const { data: r } = await supabase.from('expense_reports').select('*').eq('id', sourceId).maybeSingle()
      if (!r) return
      setTitle(r.title)
      setBodyHtml(r.body_html ?? DEFAULT_BODY)

      const [{ data: p }, { data: d }, { data: l }, { data: f }] = await Promise.all([
        supabase.from('expense_report_payments').select('*').eq('report_id', sourceId).order('seq'),
        supabase.from('expense_report_details').select('*').eq('report_id', sourceId).order('seq'),
        supabase.from('expense_report_lines').select('*, staff(name)').eq('report_id', sourceId).order('seq'),
        supabase.from('expense_report_files').select('*').eq('report_id', sourceId).order('uploaded_at'),
      ])

      setPayments((p ?? []).map(x => ({ ...x, business_no: x.business_no ?? '' })) as PaymentRow[])
      setDetails((d ?? []) as DetailRow[])

      if (copyFromId) {
        setLines([])
        setFiles([])
      } else {
        setLines((l ?? []).map((x: Record<string, unknown>) => ({
          staff_id: x.staff_id as string,
          name: (x.staff as { name: string })?.name ?? '',
          role: x.role as LineDraft['role'],
        })))
        setFiles((f ?? []) as AttachedFile[])

        const { data: rf } = await supabase
          .from('expense_report_refs')
          .select('ref_report_id, expense_reports!expense_report_refs_ref_report_id_fkey(id, doc_no, title)')
          .eq('report_id', sourceId)
        setRefs((rf ?? []).map((x: Record<string, unknown>) =>
          x.expense_reports as { id: string; doc_no: string | null; title: string }))
      }
    }
    load()
  }, [reportId, copyFromId])

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
          refs: refs.map(r => r.id),
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
  }, [actor, reportId, title, bodyHtml, payments, details, lines, files, refs, router])

  const handleExcelUpload = useCallback(async (file: File) => {
    if (payments.length > 0 || details.length > 0) {
      const ok = window.confirm('현재 표에 입력된 지급 정보·상세내용이 모두 지워지고 엑셀 내용으로 바뀝니다. 계속할까요?')
      if (!ok) {
        if (excelInputRef.current) excelInputRef.current.value = ''
        return
      }
    }

    setExcelBusy(true); setError(null)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/approval/excel-parse', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setError(json.error); return }

      setPayments(json.payments)
      setDetails(json.details)
      setError(json.errors.length > 0
        ? json.errors.map((x: { sheet: string; row: number; message: string }) =>
            x.row > 0 ? `${x.sheet} ${x.row}행: ${x.message}` : `${x.sheet}: ${x.message}`).join(' / ')
        : null)
    } catch {
      setError('엑셀 업로드 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setExcelBusy(false)
      if (excelInputRef.current) excelInputRef.current.value = ''
    }
  }, [payments, details])

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

      <div className="flex gap-3 mb-6">
        <span className="w-16 text-xs text-txt-secondary pt-1.5">참조문서</span>
        <div className="flex-1">
          <div className="flex flex-wrap gap-2 mb-2">
            {refs.map(r => (
              <span key={r.id} className="flex items-center gap-1.5 px-2 py-1 text-xs bg-surface-secondary rounded">
                {r.doc_no ?? ''} {r.title}
                <button onClick={() => setRefs(refs.filter(x => x.id !== r.id))} aria-label="참조 해제" className="text-txt-tertiary">×</button>
              </span>
            ))}
          </div>
          <select
            value=""
            onChange={e => {
              const found = refPool.find(r => r.id === e.target.value)
              if (found && !refs.some(x => x.id === found.id)) setRefs([...refs, found])
            }}
            aria-label="참조문서 추가"
            className="px-3 py-1.5 text-xs border border-border-primary rounded-lg bg-surface text-txt-primary"
          >
            <option value="">완료된 문서 추가</option>
            {refPool.filter(r => r.id !== reportId).map(r => (
              <option key={r.id} value={r.id}>{r.doc_no ?? ''} {r.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 mb-2">
        <a
          href="/api/approval/excel-template"
          className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border-primary rounded hover:bg-surface-secondary"
        >
          <Download size={12} /> 양식 받기
        </a>
        <label
          className={`flex items-center gap-1 px-2.5 py-1 text-xs border border-border-primary rounded cursor-pointer hover:bg-surface-secondary ${excelBusy ? 'opacity-40 pointer-events-none' : ''}`}
        >
          <Upload size={12} /> {excelBusy ? '업로드 중…' : '엑셀 업로드'}
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            disabled={excelBusy}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleExcelUpload(f)
            }}
          />
        </label>
      </div>
      <div className="mb-5"><PaymentTable rows={payments} onChange={setPayments} /></div>
      <div className="mb-5"><DetailTable rows={details} vendors={vendors} onChange={setDetails} /></div>

      <textarea value={bodyHtml} onChange={e => setBodyHtml(e.target.value)}
        className="w-full min-h-32 px-3 py-3 text-sm border border-border-primary rounded-lg mb-6" />

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}

      <div className="flex justify-center gap-2 border-t border-border-primary pt-5">
        <button disabled={busy || excelBusy || !actor} onClick={() => save(false)}
          className="px-6 py-2 text-sm border border-border-primary rounded-lg disabled:opacity-40">임시저장</button>
        <button disabled={busy || excelBusy || !actor} onClick={() => save(true)}
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
