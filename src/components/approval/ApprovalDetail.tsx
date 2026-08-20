'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Paperclip } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/utils/format'
import ApprovalLineView, { type LineCard } from './ApprovalLineView'
import ApproveModal from './ApproveModal'
import ActorPicker, { useActor } from './ActorPicker'
import MobileField, { MobileCard } from './MobileField'
import {
  canApprove, canDelete, canEdit, canCancel, canResumeCompletion, isFinalApprover,
} from '@/lib/approval/status'
import {
  APPROVAL_STATUS_LABEL, LINE_ROLE_LABEL, LINE_STATE_LABEL,
  type ExpenseReport, type ExpenseReportPayment, type ExpenseReportDetail,
  type ExpenseReportLine, type ExpenseReportFile,
} from '@/types/approval'
import { APPROVAL_STATUS_BADGE } from '@/lib/approval/statusStyle'
import { projectLabel, workTargetLabel } from '@/lib/workTarget'

type LineWithStaff = ExpenseReportLine & { staff: { name: string } | null }
type ActionKey = 'delete' | 'cancel'
type DailyInfo = { phone: string; resident_id: string }

const ACTION_BTN =
  'flex-1 min-h-11 flex items-center justify-center rounded-lg text-sm md:flex-none md:min-h-0 md:px-5 md:py-2'

const PREVIEWABLE = /\.(jpe?g|png|gif|webp|pdf)$/i
const attachHref = (f: ExpenseReportFile) =>
  PREVIEWABLE.test(f.file_name)
    ? f.file_url
    : `${f.file_url}?download=${encodeURIComponent(f.file_name)}`

export default function ApprovalDetail({ reportId }: { reportId: string }) {
  const router = useRouter()
  const { actor, actorId, setActorId, staffList, loading: actorLoading } = useActor()

  const [report, setReport] = useState<ExpenseReport | null>(null)
  const [drafterName, setDrafterName] = useState('')
  const [payments, setPayments] = useState<ExpenseReportPayment[]>([])
  const [details, setDetails] = useState<ExpenseReportDetail[]>([])
  const [lines, setLines] = useState<LineWithStaff[]>([])
  const [files, setFiles] = useState<ExpenseReportFile[]>([])
  const [refs, setRefs] = useState<{ id: string; doc_no: string | null; title: string }[]>([])
  const [modal, setModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<ActionKey | null>(null)
  const [targetText, setTargetText] = useState({ text: '현장 없음', missing: true })
  const [dailyInfo, setDailyInfo] = useState<Record<string, DailyInfo>>({})

  const load = useCallback(async () => {
    const { data: r } = await supabase
      .from('expense_reports')
      .select('*, staff:drafter_staff_id(name)')
      .eq('id', reportId)
      .maybeSingle()

    if (!r) return
    const { staff: drafter, ...rest } = r as ExpenseReport & { staff: { name: string } | null }
    setReport(rest as ExpenseReport)
    setDrafterName(drafter?.name ?? '')

    let siteName: string | null = null
    let projectName: string | null = null
    if (rest.site_id) {
      const { data: site } = await supabase.from('sites').select('name').eq('id', rest.site_id).maybeSingle()
      siteName = site?.name ?? null
    }
    if (rest.project_id) {
      const { data: proj } = await supabase.from('projects').select('building_name, ho, dong').eq('id', rest.project_id).maybeSingle()
      projectName = proj ? projectLabel(proj) : null
    }
    setTargetText(workTargetLabel({
      siteId: rest.site_id, projectId: rest.project_id, siteName, projectName,
    }))

    const [{ data: p }, { data: d }, { data: l }, { data: f }, { data: rf }] = await Promise.all([
      supabase.from('expense_report_payments').select('*').eq('report_id', reportId).order('seq'),
      supabase.from('expense_report_details').select('*').eq('report_id', reportId).order('seq'),
      supabase.from('expense_report_lines').select('*, staff(name)').eq('report_id', reportId).order('seq'),
      supabase.from('expense_report_files').select('*').eq('report_id', reportId).order('uploaded_at'),
      supabase
        .from('expense_report_refs')
        .select('ref_report_id, expense_reports!expense_report_refs_ref_report_id_fkey(id, doc_no, title)')
        .eq('report_id', reportId),
    ])
    const pay = (p ?? []) as ExpenseReportPayment[]
    setPayments(pay)
    setDetails((d ?? []) as ExpenseReportDetail[])
    setLines((l ?? []) as LineWithStaff[])
    setFiles((f ?? []) as ExpenseReportFile[])
    setRefs((rf ?? []).map((x: Record<string, unknown>) =>
      x.expense_reports as { id: string; doc_no: string | null; title: string }))

    const names = [...new Set(pay.map(x => x.vendor_name).filter(Boolean))]
    if (names.length > 0) {
      const { data: vs } = await supabase
        .from('vendors')
        .select('name, phone, resident_id')
        .eq('vendor_type', '일용직')
        .in('name', names)
      const m: Record<string, DailyInfo> = {}
      for (const v of vs ?? []) {
        m[v.name as string] = {
          phone: (v.phone as string) || '',
          resident_id: (v.resident_id as string) || '',
        }
      }
      setDailyInfo(m)
    } else {
      setDailyInfo({})
    }
  }, [reportId])

  useEffect(() => { load() }, [load])

  const act = async (path: ActionKey) => {
    if (!actor) { setError('행위자를 선택해 주세요'); return }
    setError(null)
    setActionBusy(path)
    try {
      const res = await fetch(`/api/approval/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId, actor_staff_id: actor.id }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? '처리에 실패했습니다'); return }
      if (path === 'delete') { router.push('/approval'); return }
      await load()
    } catch {
      setError('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setActionBusy(null)
    }
  }

  if (!report) return <div className="px-8 py-10 text-sm text-txt-tertiary">불러오는 중</div>

  const cards: LineCard[] = lines.map(l => ({
    staff_id: l.staff_id, name: l.staff?.name ?? '', role: l.role, state: l.state, acted_at: l.acted_at,
  }))

  const canApproveNow = actor ? canApprove(report, lines, actor.id) : false
  const canResumeNow = actor ? canResumeCompletion(report, lines, actor.id) : false
  const showApprove = canApproveNow || canResumeNow
  const resumeOnly = !canApproveNow && canResumeNow
  const final = actor ? isFinalApprover(lines, actor.id) : false
  const busy = actionBusy !== null

  return (
    <div className="mx-auto max-w-4xl pb-28 md:py-2 md:pb-10">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1>{report.title}</h1>
          <span className={`mt-3 inline-block ${APPROVAL_STATUS_BADGE[report.status]}`}>
            {APPROVAL_STATUS_LABEL[report.status]}
          </span>
        </div>
        <ActorPicker actorId={actorId} staffList={staffList} onChange={setActorId} loading={actorLoading} fullWidth />
      </div>

      <div className="mb-8 rounded-lg border border-border-primary bg-surface px-5 py-4 md:hidden">
        <MobileField label="문서번호" value={report.doc_no ?? '-'} />
        <MobileField label="상태" value={APPROVAL_STATUS_LABEL[report.status]} />
        <MobileField label="기안자" value={drafterName} />
        <MobileField label="기안양식" value="지출결의서" />
        <MobileField label="현장" value={targetText.text} />
        <MobileField label="보존연한" value={`${report.retention_years}년`} />
      </div>

      <div className="mb-8 hidden overflow-hidden rounded-lg border border-border-primary bg-surface md:block">
        <table className="w-full table-fixed">
          <tbody>
            <tr>
              <td className="w-[18%] border-b border-border-primary px-5 py-3.5 text-label">기안양식</td>
              <td className="w-[32%] border-b border-border-primary px-5 py-3.5">지출결의서</td>
              <td className="w-[18%] border-b border-border-primary px-5 py-3.5 text-label">문서번호</td>
              <td className="border-b border-border-primary px-5 py-3.5">{report.doc_no ?? '-'}</td>
            </tr>
            <tr>
              <td className="border-b border-border-primary px-5 py-3.5 text-label">보존연한</td>
              <td className="border-b border-border-primary px-5 py-3.5">{report.retention_years}년</td>
              <td className="border-b border-border-primary px-5 py-3.5 text-label">상태</td>
              <td className="border-b border-border-primary px-5 py-3.5">
                <span className={`inline-block ${APPROVAL_STATUS_BADGE[report.status]}`}>
                  {APPROVAL_STATUS_LABEL[report.status]}
                </span>
              </td>
            </tr>
            <tr>
              <td className="px-5 py-3.5 text-label">기안자</td>
              <td className="px-5 py-3.5">{drafterName}</td>
              <td className="px-5 py-3.5 text-label">현장</td>
              <td className={`px-5 py-3.5 ${targetText.missing ? 'font-medium text-danger' : ''}`}>{targetText.text}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mb-3">결재선</h2>
      <div className="mb-8">
        <ApprovalLineView drafterName={drafterName} drafterActedAt={report.submitted_at} lines={cards} />
      </div>

      {files.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3">파일첨부</h2>
          <div className="flex flex-col gap-1">
            {files.map(f => (
              <a key={f.id} href={attachHref(f)} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 py-2.5 text-[13px] text-accent-text hover:underline md:py-1.5">
                <Paperclip size={14} className="text-txt-tertiary" /> {f.file_name}
              </a>
            ))}
          </div>
        </div>
      )}

      {refs.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3">참조문서</h2>
          <div className="flex flex-col gap-1">
            {refs.map(r => (
              <Link key={r.id} href={`/approval/${r.id}`} className="py-2.5 text-[13px] text-accent-text hover:underline md:py-1.5">
                {r.doc_no ?? ''} {r.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8 overflow-hidden rounded-lg border border-border-primary bg-surface">
        <div className="flex items-center gap-3 border-b border-border-primary px-5 py-4">
          <span className="text-label">지급 총계(원)</span>
          <span className="text-money text-[15px]">{formatMoney(report.total_amount)}</span>
        </div>
        <div className="px-4 py-4 md:hidden">
          {payments.map(p => {
            const daily = dailyInfo[p.vendor_name]
            return (
              <MobileCard key={p.id}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-medium text-txt-primary">{p.vendor_name}</span>
                  <span className="text-money shrink-0 text-[15px] text-txt-primary">{formatMoney(p.amount)}</span>
                </div>
                <MobileField label="지급요청일" value={p.pay_request_date} />
                <MobileField label="은행" value={p.bank} />
                <MobileField label="계좌번호" value={p.account_no} />
                {daily ? (
                  <>
                    <MobileField label="주민번호" value={daily.resident_id || p.business_no || ''} />
                    <MobileField label="연락처" value={daily.phone} />
                  </>
                ) : (
                  <MobileField label="사업자번호" value={p.business_no ?? ''} />
                )}
              </MobileCard>
            )
          })}
          {payments.length === 0 && (
            <div className="py-6 text-center text-[13px] text-txt-tertiary">지급 정보가 없습니다</div>
          )}
        </div>

        <table className="hidden w-full table-fixed md:table">
          <thead>
            <tr>
              <th className="w-[18%] border-r border-border-primary px-4 py-3 text-left">거래처명</th>
              <th className="w-[16%] border-r border-border-primary px-4 py-3 text-right">지급금액</th>
              <th className="w-[14%] border-r border-border-primary px-4 py-3 text-left">지급요청일</th>
              <th className="w-[13%] border-r border-border-primary px-4 py-3 text-left">은행</th>
              <th className="w-[22%] border-r border-border-primary px-4 py-3 text-left">계좌번호</th>
              <th className="w-[17%] px-4 py-3 text-left">사업자·주민번호</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => {
              const daily = dailyInfo[p.vendor_name]
              return (
                <tr key={p.id} className="border-t border-border-primary">
                  <td className="border-r border-border-primary px-4 py-3">
                    <div>{p.vendor_name}</div>
                    {daily?.phone && <div className="mt-1 text-[12px] text-txt-tertiary">{daily.phone}</div>}
                  </td>
                  <td className="text-money border-r border-border-primary px-4 py-3 text-right">{formatMoney(p.amount)}</td>
                  <td className="border-r border-border-primary px-4 py-3">{p.pay_request_date}</td>
                  <td className="border-r border-border-primary px-4 py-3">{p.bank}</td>
                  <td className="border-r border-border-primary px-4 py-3">{p.account_no}</td>
                  <td className="px-4 py-3">{daily ? (daily.resident_id || p.business_no || '') : (p.business_no ?? '')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {details.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-lg border border-border-primary bg-surface">
          <div className="border-b border-border-primary px-5 py-4 text-card-title">상세 내용</div>
          <div className="px-4 py-4 md:hidden">
            {details.map(d => (
              <MobileCard key={d.id}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-medium text-txt-primary">{d.content || d.vendor_name || '내용 없음'}</span>
                  {d.amount ? (
                    <span className="text-money shrink-0 text-[15px] text-txt-primary">{formatMoney(d.amount)}</span>
                  ) : null}
                </div>
                <MobileField label="거래처명" value={d.vendor_name ?? ''} />
                <MobileField label="계정" value={d.account ?? ''} />
                <MobileField label="부서명" value={d.dept_name ?? ''} />
                <MobileField label="비고" value={d.note ?? ''} />
              </MobileCard>
            ))}
          </div>
          <table className="hidden w-full table-fixed md:table">
            <thead>
              <tr>
                <th className="border-r border-border-primary px-4 py-3 text-left">거래처명</th>
                <th className="border-r border-border-primary px-4 py-3 text-left">계정</th>
                <th className="border-r border-border-primary px-4 py-3 text-left">내용</th>
                <th className="border-r border-border-primary px-4 py-3 text-left">부서명</th>
                <th className="border-r border-border-primary px-4 py-3 text-right">금액</th>
                <th className="px-4 py-3 text-left">비고</th>
              </tr>
            </thead>
            <tbody>
              {details.map(d => (
                <tr key={d.id} className="border-t border-border-primary">
                  <td className="border-r border-border-primary px-4 py-3">{d.vendor_name ?? ''}</td>
                  <td className="border-r border-border-primary px-4 py-3">{d.account ?? ''}</td>
                  <td className="border-r border-border-primary px-4 py-3">{d.content ?? ''}</td>
                  <td className="border-r border-border-primary px-4 py-3">{d.dept_name ?? ''}</td>
                  <td className="text-money border-r border-border-primary px-4 py-3 text-right">{d.amount ? formatMoney(d.amount) : ''}</td>
                  <td className="px-4 py-3">{d.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.body_html && (
        <div className="mb-8 rounded-lg border border-border-primary bg-surface px-5 py-4 text-[13px] leading-relaxed">{report.body_html}</div>
      )}

      <h2 className="mb-3">결재의견</h2>

      <div className="mb-8 md:hidden">
        {lines.filter(l => l.acted_at).map(l => (
          <MobileCard key={l.id}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-medium text-txt-primary">{l.staff?.name ?? ''}</span>
              <span className="shrink-0 text-[12px] text-txt-secondary">
                {LINE_ROLE_LABEL[l.role]} · {LINE_STATE_LABEL[l.state]}
              </span>
            </div>
            <MobileField label="일시" value={l.acted_at ? new Date(l.acted_at).toLocaleString('ko-KR') : ''} />
            <MobileField label="의견" value={l.comment ?? ''} />
          </MobileCard>
        ))}
        {lines.filter(l => l.acted_at).length === 0 && (
          <div className="py-4 text-[13px] text-txt-tertiary">아직 결재한 사람이 없습니다</div>
        )}
      </div>

      <div className="mb-8 hidden overflow-hidden rounded-lg border border-border-primary bg-surface md:block">
        <table className="w-full table-fixed">
          <thead>
            <tr>
              <th className="w-[12%] border-r border-border-primary px-4 py-3 text-left">결재구분</th>
              <th className="w-[18%] border-r border-border-primary px-4 py-3 text-left">결재자</th>
              <th className="w-[12%] border-r border-border-primary px-4 py-3 text-left">상태</th>
              <th className="w-[22%] border-r border-border-primary px-4 py-3 text-left">일시</th>
              <th className="px-4 py-3 text-left">결재의견</th>
            </tr>
          </thead>
          <tbody>
            {lines.filter(l => l.acted_at).map(l => (
              <tr key={l.id} className="border-t border-border-primary">
                <td className="border-r border-border-primary px-4 py-3">{LINE_ROLE_LABEL[l.role]}</td>
                <td className="border-r border-border-primary px-4 py-3">{l.staff?.name ?? ''}</td>
                <td className="border-r border-border-primary px-4 py-3">{LINE_STATE_LABEL[l.state]}</td>
                <td className="border-r border-border-primary px-4 py-3">{l.acted_at ? new Date(l.acted_at).toLocaleString('ko-KR') : ''}</td>
                <td className="px-4 py-3">{l.comment ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}

      <div
        className="fixed bottom-0 left-0 right-0 z-30 flex gap-2 px-4 py-3 bg-surface border-t border-border-primary
                   pb-[calc(0.75rem+env(safe-area-inset-bottom))]
                   md:static md:z-auto md:justify-center md:bg-transparent md:px-0 md:py-0 md:pt-5 md:pb-0"
      >
        <Link href="/approval" className={`${ACTION_BTN} border border-border-primary`}>목록</Link>

        {report.status === 'approved' && (
          <Link href={`/approval/${reportId}/reissue`} className={`${ACTION_BTN} border border-border-primary`}>
            재기안
          </Link>
        )}
        {actor && canEdit(report, actor.id) && (
          <Link href={`/approval/${reportId}/edit`} className={`${ACTION_BTN} border border-border-primary`}>
            수정
          </Link>
        )}
        {actor && canDelete(report, actor.id) && (
          <button onClick={() => act('delete')} disabled={busy}
            className={`${ACTION_BTN} border border-border-primary text-danger disabled:opacity-40`}>
            {actionBusy === 'delete' ? '처리 중' : '삭제'}
          </button>
        )}
        {actor && canCancel(report, lines, actor.id) && (
          <button onClick={() => act('cancel')} disabled={busy}
            className={`${ACTION_BTN} border border-border-primary disabled:opacity-40`}>
            {actionBusy === 'cancel' ? '처리 중' : '결재취소'}
          </button>
        )}
        {showApprove && (
          <button onClick={() => setModal(true)} disabled={busy}
            className={`${ACTION_BTN} bg-accent text-txt-inverse disabled:opacity-40`}>
            결재
          </button>
        )}
      </div>

      <ApproveModal
        open={modal}
        reportId={reportId}
        title={report.title}
        drafterName={drafterName}
        totalAmount={report.total_amount}
        paymentCount={payments.length}
        isFinal={final}
        resumeOnly={resumeOnly}
        docNo={report.doc_no}
        actorId={actor?.id ?? ''}
        actorName={actor?.name ?? ''}
        onClose={() => setModal(false)}
        onDone={() => { setModal(false); load() }}
      />
    </div>
  )
}
