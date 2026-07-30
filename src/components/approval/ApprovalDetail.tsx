'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Paperclip } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { formatMoney } from '@/lib/utils/format'
import ApprovalLineView, { type LineCard } from './ApprovalLineView'
import ApproveModal from './ApproveModal'
import {
  canApprove, canWithdraw, canDelete, canSubmit, canCancel, canResumeCompletion, isFinalApprover,
} from '@/lib/approval/status'
import {
  APPROVAL_STATUS_LABEL, LINE_ROLE_LABEL, LINE_STATE_LABEL,
  type ExpenseReport, type ExpenseReportPayment, type ExpenseReportDetail,
  type ExpenseReportLine, type ExpenseReportFile,
} from '@/types/approval'

type LineWithStaff = ExpenseReportLine & { staff: { name: string } | null }
type ActionKey = 'withdraw' | 'delete' | 'cancel'

export default function ApprovalDetail({ reportId }: { reportId: string }) {
  const router = useRouter()
  const { staff, loading: authLoading } = useAuth()

  const [report, setReport] = useState<ExpenseReport | null>(null)
  const [drafterName, setDrafterName] = useState('')
  const [payments, setPayments] = useState<ExpenseReportPayment[]>([])
  const [details, setDetails] = useState<ExpenseReportDetail[]>([])
  const [lines, setLines] = useState<LineWithStaff[]>([])
  const [files, setFiles] = useState<ExpenseReportFile[]>([])
  const [modal, setModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<ActionKey | null>(null)

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

    const [{ data: p }, { data: d }, { data: l }, { data: f }] = await Promise.all([
      supabase.from('expense_report_payments').select('*').eq('report_id', reportId).order('seq'),
      supabase.from('expense_report_details').select('*').eq('report_id', reportId).order('seq'),
      supabase.from('expense_report_lines').select('*, staff(name)').eq('report_id', reportId).order('seq'),
      supabase.from('expense_report_files').select('*').eq('report_id', reportId).order('uploaded_at'),
    ])
    setPayments((p ?? []) as ExpenseReportPayment[])
    setDetails((d ?? []) as ExpenseReportDetail[])
    setLines((l ?? []) as LineWithStaff[])
    setFiles((f ?? []) as ExpenseReportFile[])
  }, [reportId])

  useEffect(() => { load() }, [load])

  const act = async (path: ActionKey) => {
    setError(null)
    setActionBusy(path)
    try {
      const res = await fetch(`/api/approval/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId }),
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

  if (!authLoading && !staff) {
    return (
      <div className="px-8 py-10 text-sm text-danger">
        로그인 계정과 직원 정보가 연결되어 있지 않습니다. 관리자에게 직원 정보(이메일) 등록을 요청해 주세요.
      </div>
    )
  }

  if (!report || !staff) return <div className="px-8 py-10 text-sm text-txt-tertiary">불러오는 중</div>

  const cards: LineCard[] = lines.map(l => ({
    staff_id: l.staff_id, name: l.staff?.name ?? '', role: l.role, state: l.state, acted_at: l.acted_at,
  }))

  const canApproveNow = canApprove(report, lines, staff.id)
  const canResumeNow = canResumeCompletion(report, lines, staff.id)
  const showApprove = canApproveNow || canResumeNow
  const resumeOnly = !canApproveNow && canResumeNow
  const final = isFinalApprover(lines, staff.id)
  const busy = actionBusy !== null

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-lg font-medium mb-4">{report.title}</h1>

      <table className="w-full table-fixed text-xs mb-6">
        <tbody>
          <tr>
            <td className="w-[18%] px-2 py-2 text-txt-secondary border-b border-border-primary">기안양식</td>
            <td className="w-[32%] px-2 py-2 border-b border-border-primary">지출결의서</td>
            <td className="w-[18%] px-2 py-2 text-txt-secondary border-b border-border-primary">문서번호</td>
            <td className="px-2 py-2 border-b border-border-primary">{report.doc_no ?? '-'}</td>
          </tr>
          <tr>
            <td className="px-2 py-2 text-txt-secondary border-b border-border-primary">보존연한</td>
            <td className="px-2 py-2 border-b border-border-primary">{report.retention_years}년</td>
            <td className="px-2 py-2 text-txt-secondary border-b border-border-primary">상태</td>
            <td className="px-2 py-2 border-b border-border-primary">{APPROVAL_STATUS_LABEL[report.status]}</td>
          </tr>
          <tr>
            <td className="px-2 py-2 text-txt-secondary">기안자</td>
            <td className="px-2 py-2">{drafterName}</td>
            <td className="px-2 py-2 text-txt-secondary">기안부서</td>
            <td className="px-2 py-2">주식회사 다우건설</td>
          </tr>
        </tbody>
      </table>

      <div className="text-sm font-medium mb-2">결재선</div>
      <div className="mb-6">
        <ApprovalLineView drafterName={drafterName} drafterActedAt={report.submitted_at} lines={cards} />
      </div>

      {files.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-medium mb-2">파일첨부</div>
          <div className="flex flex-col gap-1">
            {files.map(f => (
              <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-accent-text hover:underline">
                <Paperclip size={12} /> {f.file_name}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="border border-border-primary rounded-lg overflow-hidden mb-5">
        <div className="flex items-center gap-3 px-3 py-3 border-b border-border-primary">
          <span className="text-xs text-txt-secondary">지급 총계(원)</span>
          <span className="text-lg font-medium">{formatMoney(report.total_amount)}</span>
        </div>
        <table className="w-full table-fixed text-xs">
          <thead className="bg-surface-secondary text-txt-secondary">
            <tr>
              <th className="w-[18%] px-2 py-2 text-left font-normal border-r border-border-primary">거래처명</th>
              <th className="w-[16%] px-2 py-2 text-right font-normal border-r border-border-primary">지급금액</th>
              <th className="w-[14%] px-2 py-2 text-left font-normal border-r border-border-primary">지급요청일</th>
              <th className="w-[13%] px-2 py-2 text-left font-normal border-r border-border-primary">은행</th>
              <th className="w-[22%] px-2 py-2 text-left font-normal border-r border-border-primary">계좌번호</th>
              <th className="w-[17%] px-2 py-2 text-left font-normal">사업자번호</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id} className="border-t border-border-primary">
                <td className="px-2 py-2.5 border-r border-border-primary">{p.vendor_name}</td>
                <td className="px-2 py-2.5 text-right border-r border-border-primary">{formatMoney(p.amount)}</td>
                <td className="px-2 py-2.5 border-r border-border-primary">{p.pay_request_date}</td>
                <td className="px-2 py-2.5 border-r border-border-primary">{p.bank}</td>
                <td className="px-2 py-2.5 border-r border-border-primary">{p.account_no}</td>
                <td className="px-2 py-2.5">{p.business_no ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {details.length > 0 && (
        <div className="border border-border-primary rounded-lg overflow-hidden mb-5">
          <div className="px-3 py-2 border-b border-border-primary text-xs font-medium">상세 내용</div>
          <table className="w-full table-fixed text-xs">
            <thead className="bg-surface-secondary text-txt-secondary">
              <tr>
                <th className="px-2 py-2 text-left font-normal border-r border-border-primary">거래처명</th>
                <th className="px-2 py-2 text-left font-normal border-r border-border-primary">계정</th>
                <th className="px-2 py-2 text-left font-normal border-r border-border-primary">내용</th>
                <th className="px-2 py-2 text-left font-normal border-r border-border-primary">부서명</th>
                <th className="px-2 py-2 text-right font-normal border-r border-border-primary">금액</th>
                <th className="px-2 py-2 text-left font-normal">비고</th>
              </tr>
            </thead>
            <tbody>
              {details.map(d => (
                <tr key={d.id} className="border-t border-border-primary">
                  <td className="px-2 py-2.5 border-r border-border-primary">{d.vendor_name ?? ''}</td>
                  <td className="px-2 py-2.5 border-r border-border-primary">{d.account ?? ''}</td>
                  <td className="px-2 py-2.5 border-r border-border-primary">{d.content ?? ''}</td>
                  <td className="px-2 py-2.5 border-r border-border-primary">{d.dept_name ?? ''}</td>
                  <td className="px-2 py-2.5 text-right border-r border-border-primary">{d.amount ? formatMoney(d.amount) : ''}</td>
                  <td className="px-2 py-2.5">{d.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.body_html && (
        <div className="border border-border-primary rounded-lg px-3 py-3 text-xs mb-6">{report.body_html}</div>
      )}

      <div className="text-sm font-medium mb-2">결재의견</div>
      <table className="w-full table-fixed text-xs mb-6">
        <thead className="bg-surface-secondary text-txt-secondary">
          <tr>
            <th className="w-[12%] px-2 py-2 text-left font-normal border-r border-border-primary">결재구분</th>
            <th className="w-[18%] px-2 py-2 text-left font-normal border-r border-border-primary">결재자</th>
            <th className="w-[12%] px-2 py-2 text-left font-normal border-r border-border-primary">상태</th>
            <th className="w-[20%] px-2 py-2 text-left font-normal border-r border-border-primary">일시</th>
            <th className="px-2 py-2 text-left font-normal">결재의견</th>
          </tr>
        </thead>
        <tbody>
          {lines.filter(l => l.acted_at).map(l => (
            <tr key={l.id} className="border-t border-border-primary">
              <td className="px-2 py-2.5 border-r border-border-primary">{LINE_ROLE_LABEL[l.role]}</td>
              <td className="px-2 py-2.5 border-r border-border-primary">{l.staff?.name ?? ''}</td>
              <td className="px-2 py-2.5 border-r border-border-primary">{LINE_STATE_LABEL[l.state]}</td>
              <td className="px-2 py-2.5 border-r border-border-primary">{l.acted_at ? new Date(l.acted_at).toLocaleString('ko-KR') : ''}</td>
              <td className="px-2 py-2.5">{l.comment ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}

      <div className="flex justify-center gap-2 border-t border-border-primary pt-5">
        <Link href="/approval" className="px-5 py-2 text-sm border border-border-primary rounded-lg">목록</Link>

        {canSubmit(report, staff.id) && (
          <Link href={`/approval/${reportId}/edit`} className="px-5 py-2 text-sm border border-border-primary rounded-lg">
            수정
          </Link>
        )}
        {canWithdraw(report, lines, staff.id) && (
          <button onClick={() => act('withdraw')} disabled={busy}
            className="px-5 py-2 text-sm border border-border-primary rounded-lg disabled:opacity-40">
            {actionBusy === 'withdraw' ? '처리 중' : '회수'}
          </button>
        )}
        {canDelete(report, staff.id) && (
          <button onClick={() => act('delete')} disabled={busy}
            className="px-5 py-2 text-sm border border-border-primary rounded-lg text-danger disabled:opacity-40">
            {actionBusy === 'delete' ? '처리 중' : '삭제'}
          </button>
        )}
        {canCancel(report, lines, staff.id) && (
          <button onClick={() => act('cancel')} disabled={busy}
            className="px-5 py-2 text-sm border border-border-primary rounded-lg disabled:opacity-40">
            {actionBusy === 'cancel' ? '처리 중' : '결재취소'}
          </button>
        )}
        {showApprove && (
          <button onClick={() => setModal(true)} disabled={busy}
            className="px-5 py-2 text-sm rounded-lg bg-accent text-txt-inverse disabled:opacity-40">
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
        onClose={() => setModal(false)}
        onDone={() => { setModal(false); load() }}
      />
    </div>
  )
}
