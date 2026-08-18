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
  canApprove, canWithdraw, canDelete, canSubmit, canCancel, canResumeCompletion, isFinalApprover,
} from '@/lib/approval/status'
import {
  APPROVAL_STATUS_LABEL, LINE_ROLE_LABEL, LINE_STATE_LABEL,
  type ExpenseReport, type ExpenseReportPayment, type ExpenseReportDetail,
  type ExpenseReportLine, type ExpenseReportFile,
} from '@/types/approval'
import { projectLabel, workTargetLabel } from '@/lib/workTarget'

type LineWithStaff = ExpenseReportLine & { staff: { name: string } | null }
type ActionKey = 'withdraw' | 'delete' | 'cancel'

// 하단 액션 버튼. 모바일에서는 남는 폭을 나눠 갖고 높이를 44px로 키워 손가락에 맞춘다.
// md 이상에서는 예전 크기(px-5 py-2)로 되돌아간다.
const ACTION_BTN =
  'flex-1 min-h-11 flex items-center justify-center rounded-lg text-sm md:flex-none md:min-h-0 md:px-5 md:py-2'

// 저장 경로는 한글을 못 쓰므로(Storage 제약) 파일명이 밑줄로 바뀌어 있다.
// 브라우저에서 바로 볼 수 없는 형식은 ?download=로 원래 파일명을 되살려 내려받게 한다.
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
    setPayments((p ?? []) as ExpenseReportPayment[])
    setDetails((d ?? []) as ExpenseReportDetail[])
    setLines((l ?? []) as LineWithStaff[])
    setFiles((f ?? []) as ExpenseReportFile[])
    setRefs((rf ?? []).map((x: Record<string, unknown>) =>
      x.expense_reports as { id: string; doc_no: string | null; title: string }))
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
    // 모바일은 액션 바가 화면 아래에 고정되므로, 마지막 내용이 가리지 않도록 아래 여백을 둔다.
    <div className="max-w-4xl mx-auto px-4 py-5 pb-28 md:px-6 md:py-8 md:pb-8">
      <div className="flex flex-col gap-2 mb-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-lg font-medium">{report.title}</h1>
        <ActorPicker actorId={actorId} staffList={staffList} onChange={setActorId} loading={actorLoading} fullWidth />
      </div>

      {/* 기안정보 — 모바일 */}
      <div className="md:hidden mb-6 border border-border-primary rounded-lg px-3 py-2.5">
        <MobileField label="문서번호" value={report.doc_no ?? '-'} />
        <MobileField label="상태" value={APPROVAL_STATUS_LABEL[report.status]} />
        <MobileField label="기안자" value={drafterName} />
        <MobileField label="기안양식" value="지출결의서" />
        <MobileField label="현장" value={targetText.text} />
        <MobileField label="보존연한" value={`${report.retention_years}년`} />
      </div>

      <table className="hidden md:table w-full table-fixed text-xs mb-6">
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
            <td className="px-2 py-2 text-txt-secondary">현장</td>
            <td className={`px-2 py-2 ${targetText.missing ? 'text-[#b53333] font-medium' : ''}`}>{targetText.text}</td>
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
              <a key={f.id} href={attachHref(f)} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 py-2 text-sm text-accent-text hover:underline md:py-0 md:text-xs">
                <Paperclip size={12} /> {f.file_name}
              </a>
            ))}
          </div>
        </div>
      )}

      {refs.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-medium mb-2">참조문서</div>
          <div className="flex flex-col gap-1">
            {refs.map(r => (
              <Link key={r.id} href={`/approval/${r.id}`} className="py-2 text-sm text-accent-text hover:underline md:py-0 md:text-xs">
                {r.doc_no ?? ''} {r.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="border border-border-primary rounded-lg overflow-hidden mb-5">
        <div className="flex items-center gap-3 px-3 py-3 border-b border-border-primary">
          <span className="text-xs text-txt-secondary">지급 총계(원)</span>
          <span className="text-lg font-medium">{formatMoney(report.total_amount)}</span>
        </div>
        {/* 지급정보 — 모바일. 거래처와 금액을 카드 머리에 두고 나머지는 라벨과 함께 아래에 둔다. */}
        <div className="md:hidden px-3 py-3">
          {payments.map(p => (
            <MobileCard key={p.id}>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className="text-[15px] text-txt-primary">{p.vendor_name}</span>
                <span className="text-base text-txt-primary shrink-0">{formatMoney(p.amount)}</span>
              </div>
              <MobileField label="지급요청일" value={p.pay_request_date} />
              <MobileField label="은행" value={p.bank} />
              <MobileField label="계좌번호" value={p.account_no} />
              <MobileField label="사업자번호" value={p.business_no ?? ''} />
            </MobileCard>
          ))}
          {payments.length === 0 && (
            <div className="py-3 text-center text-xs text-txt-tertiary">지급 정보가 없습니다</div>
          )}
        </div>

        <table className="hidden md:table w-full table-fixed text-xs">
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

          {/* 상세내용 — 모바일 */}
          <div className="md:hidden px-3 py-3">
            {details.map(d => (
              <MobileCard key={d.id}>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="text-[15px] text-txt-primary">{d.content || d.vendor_name || '내용 없음'}</span>
                  {d.amount ? (
                    <span className="text-base text-txt-primary shrink-0">{formatMoney(d.amount)}</span>
                  ) : null}
                </div>
                <MobileField label="거래처명" value={d.vendor_name ?? ''} />
                <MobileField label="계정" value={d.account ?? ''} />
                <MobileField label="부서명" value={d.dept_name ?? ''} />
                <MobileField label="비고" value={d.note ?? ''} />
              </MobileCard>
            ))}
          </div>

          <table className="hidden md:table w-full table-fixed text-xs">
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

      {/* 결재의견 — 모바일 */}
      <div className="md:hidden mb-6">
        {lines.filter(l => l.acted_at).map(l => (
          <MobileCard key={l.id}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-[15px] text-txt-primary">{l.staff?.name ?? ''}</span>
              <span className="text-xs text-txt-secondary shrink-0">
                {LINE_ROLE_LABEL[l.role]} · {LINE_STATE_LABEL[l.state]}
              </span>
            </div>
            <MobileField label="일시" value={l.acted_at ? new Date(l.acted_at).toLocaleString('ko-KR') : ''} />
            <MobileField label="의견" value={l.comment ?? ''} />
          </MobileCard>
        ))}
        {lines.filter(l => l.acted_at).length === 0 && (
          <div className="py-3 text-xs text-txt-tertiary">아직 결재한 사람이 없습니다</div>
        )}
      </div>

      <table className="hidden md:table w-full table-fixed text-xs mb-6">
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

      {/*
        모바일에서는 화면 아래에 고정한다 — 문서가 길어도 승인·반려가 엄지에 닿아야 한다.
        아이폰 홈바에 가리지 않도록 safe-area만큼 아래 여백을 더한다.
        md 이상에서는 static으로 되돌아가 지금 데스크톱 모양 그대로다.
      */}
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
        {actor && canSubmit(report, actor.id) && (
          <Link href={`/approval/${reportId}/edit`} className={`${ACTION_BTN} border border-border-primary`}>
            수정
          </Link>
        )}
        {actor && canWithdraw(report, lines, actor.id) && (
          <button onClick={() => act('withdraw')} disabled={busy}
            className={`${ACTION_BTN} border border-border-primary disabled:opacity-40`}>
            {actionBusy === 'withdraw' ? '처리 중' : '회수'}
          </button>
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
