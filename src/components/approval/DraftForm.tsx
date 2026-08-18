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
import MobileField from './MobileField'
import type { PaymentRow, DetailRow } from '@/types/approval'
import { validateApprovalLine } from '@/lib/approval/status'
import { formatMoney } from '@/lib/utils/format'
import WorkTargetPicker from '@/components/common/WorkTargetPicker'
import { workKindFromIds, type WorkKind } from '@/lib/workTarget'

const DEFAULT_BODY = '※ 첨부 파일에 견적서, 세금계산서 첨부할 것!!'

/**
 * 모바일 기안 작성은 단계별로 나눈다. 한 화면에 다 넣으면 폰에서 끝없이 스크롤해야 하고,
 * 어디까지 채웠는지 알 수 없다.
 *
 * 데스크톱은 이 단계를 무시하고 전부 한 화면에 그린다 — 지금 쓰고 있는 화면을 바꾸지 않는다.
 * 그래서 단계는 "데이터"가 아니라 "모바일에서 무엇을 보여줄지 고르는 필터"일 뿐이다.
 */
const STEPS = ['기안 정보', '지급 정보', '상세 내용', '첨부·참조', '결재선', '확인'] as const
const LAST_STEP = STEPS.length - 1

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
  const [workKind, setWorkKind] = useState<WorkKind>('')
  const [siteId, setSiteId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [projects, setProjects] = useState<{ id: string; building_name: string | null; ho: string | null; dong: string | null }[]>([])
  /** 모바일 단계. 데스크톱에서는 이 값이 바뀌지 않고, 화면도 이 값을 보지 않는다. */
  const [step, setStep] = useState(0)
  const excelInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase
      .from('expense_reports')
      .select('id, doc_no, title')
      .eq('status', 'approved')
      .order('completed_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setRefPool(data ?? []))
    supabase.from('sites').select('id, name').order('name').then(({ data }) => setSites((data ?? []) as { id: string; name: string }[]))
    supabase.from('projects').select('id, building_name, ho, dong').order('created_at', { ascending: false }).then(({ data }) => {
      setProjects((data ?? []) as { id: string; building_name: string | null; ho: string | null; dong: string | null }[])
    })
  }, [])

  useEffect(() => {
    const sourceId = reportId ?? copyFromId
    if (!sourceId) return
    const load = async () => {
      const { data: r } = await supabase.from('expense_reports').select('*').eq('id', sourceId).maybeSingle()
      if (!r) return
      setTitle(r.title)
      setBodyHtml(r.body_html ?? DEFAULT_BODY)
      setSiteId((r.site_id as string) || '')
      setProjectId((r.project_id as string) || '')
      setWorkKind(workKindFromIds(r.site_id as string | null, r.project_id as string | null))

      const [{ data: p }, { data: d }, { data: l }, { data: f }] = await Promise.all([
        supabase.from('expense_report_payments').select('*').eq('report_id', sourceId).order('seq'),
        supabase.from('expense_report_details').select('*').eq('report_id', sourceId).order('seq'),
        supabase.from('expense_report_lines').select('*, staff(name)').eq('report_id', sourceId).order('seq'),
        supabase.from('expense_report_files').select('*').eq('report_id', sourceId).order('uploaded_at'),
      ])

      setPayments((p ?? []).map(x => ({
        vendor_name: x.vendor_name, amount: x.amount,
        pay_request_date: x.pay_request_date, bank: x.bank,
        account_no: x.account_no, business_no: x.business_no ?? '',
      })) as PaymentRow[])
      setDetails((d ?? []).map(x => ({
        vendor_name: x.vendor_name ?? '', account: x.account ?? '', content: x.content ?? '',
        dept_name: x.dept_name ?? '', amount: x.amount ?? 0, note: x.note ?? '',
      })) as DetailRow[])

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
          site_id: siteId || null, project_id: projectId || null,
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
  }, [actor, reportId, title, bodyHtml, siteId, projectId, payments, details, lines, files, refs, router])

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

  // 단계 이동 시 위로 올려준다. 긴 단계를 지나온 뒤 다음 단계의 중간부터 보이면
  // 무엇을 입력해야 하는지 알 수 없다.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  const goNext = () => {
    // 그 단계에서 확인할 수 있는 것만 본다. 전체 검증은 상신할 때 서버가 다시 한다.
    if (step === 0 && !actor) { setError('기안자를 선택해 주세요'); return }
    if (step === 0 && !title.trim()) { setError('기안제목을 입력해 주세요'); return }
    // 지급 정보는 비워둔 채로도 다음 단계·상신이 가능하다 — 계좌가 아직 안 나온
    // 상태에서 결재를 먼저 올리는 실무가 있어서 막지 않는다.
    setError(null)
    setStep(s => Math.min(s + 1, LAST_STEP))
  }

  // 아래 세 함수는 "이 단계에서 이 덩어리를 보일지"를 정한다.
  // 데스크톱(md 이상)은 언제나 전부 보인다. Tailwind가 소스에서 클래스 문자열을 찾아야 하므로
  // 문자열을 조합하지 않고 통째로 적는다.
  const stepBlock = (n: number) => (step === n ? 'md:block' : 'hidden md:block')
  const stepFlex = (n: number) => (step === n ? 'flex md:flex' : 'hidden md:flex')
  const mobileOnly = (n: number) => (step === n ? 'md:hidden' : 'hidden')

  const totalAmount = payments.reduce((s, p) => s + (p.amount || 0), 0)

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 pb-28 md:px-6 md:py-8 md:pb-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium">지출결의서</h1>
        {/* 임시저장은 어느 단계에서든 눌릴 수 있어야 한다. 폰 작업은 중간에 끊기기 쉽다. */}
        <button
          onClick={() => save(false)}
          disabled={busy || excelBusy || !actor}
          className="md:hidden px-3 h-9 text-sm border border-border-primary rounded-lg text-txt-primary disabled:opacity-40"
        >
          임시저장
        </button>
      </div>

      {/* 진행 표시 — 모바일 전용 */}
      <div className="md:hidden mb-4">
        <div className="flex gap-1 mb-2">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex-1 h-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-border-primary'}`} />
          ))}
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] text-txt-primary">{STEPS[step]}</span>
          <span className="text-xs text-txt-tertiary">{step + 1}/{STEPS.length}</span>
        </div>
      </div>

      {/* 기안정보 — 모바일 */}
      <div className={`${mobileOnly(0)} mb-5 border border-border-primary rounded-lg px-3 py-2.5`}>
        <MobileField label="기안양식" value="지출결의서" />
        <MobileField label="문서번호" value="완료 시 부여" />
        <MobileField label="보존연한" value="5년" />
        <MobileField label="기안부서" value="주식회사 다우건설" />
        <div className="pt-2">
          <label className="block mb-1 text-xs text-txt-secondary">
            기안자 <span className="text-danger">*</span>
          </label>
          <select
            value={actorId ?? ''}
            onChange={e => setActorId(e.target.value)}
            aria-label="기안자 선택"
            className="w-full h-11 px-3 text-base border border-border-primary rounded-lg bg-surface text-txt-primary"
          >
            <option value="">{actorLoading ? '불러오는 중' : '선택해 주세요'}</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="pt-2">
          <label className="block mb-1 text-xs text-txt-secondary">현장</label>
          <WorkTargetPicker
            kind={workKind}
            siteId={siteId}
            projectId={projectId}
            sites={sites}
            projects={projects}
            onChange={next => { setWorkKind(next.kind); setSiteId(next.siteId); setProjectId(next.projectId) }}
          />
        </div>
      </div>

      <table className="hidden md:table w-full table-fixed text-xs mb-6">
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
            <td className="px-2 py-2 text-txt-secondary">현장</td>
            <td className="px-2 py-2">
              <WorkTargetPicker
                compact
                kind={workKind}
                siteId={siteId}
                projectId={projectId}
                sites={sites}
                projects={projects}
                onChange={next => { setWorkKind(next.kind); setSiteId(next.siteId); setProjectId(next.projectId) }}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <div className={`${stepFlex(4)} items-center justify-between mb-2`}>
        <span className="text-sm font-medium">결재선 <span className="text-danger">*</span></span>
        <button onClick={() => setLineOpen(true)} className="px-3 h-11 text-sm border border-border-primary rounded md:h-auto md:py-1.5 md:text-xs">
          결재선 설정
        </button>
      </div>
      <div className={`${stepBlock(4)} mb-6`}>
        <ApprovalLineView drafterName={actor?.name ?? ''} lines={lines} />
      </div>

      <div className={`${stepBlock(0)} bg-accent-light text-accent-text text-xs rounded-lg px-3 py-2.5 mb-6`}>
        결제 관련 지출결의서 입니다.
      </div>

      <div className={`${stepBlock(0)} text-sm font-medium mb-2`}>기안내용</div>
      <div className={`${stepFlex(0)} flex-col gap-1 mb-3 md:flex-row md:items-center md:gap-3`}>
        <span className="w-16 text-xs text-txt-secondary">기안제목 <span className="text-danger">*</span></span>
        <input value={title} onChange={e => setTitle(e.target.value.slice(0, 50))}
          className="flex-1 h-11 px-3 text-base border border-border-primary rounded-lg md:h-auto md:py-2 md:text-sm" placeholder="기안제목 입력" />
        <span className="text-xs text-txt-tertiary self-end md:self-auto">{title.length}/50</span>
      </div>
      <div className={`${stepFlex(3)} flex-col gap-1 mb-6 md:flex-row md:gap-3`}>
        <span className="w-16 text-xs text-txt-secondary md:pt-1.5">파일첨부</span>
        <div className="flex-1"><FileAttach files={files} onChange={setFiles} /></div>
      </div>

      <div className={`${stepFlex(3)} flex-col gap-1 mb-6 md:flex-row md:gap-3`}>
        <span className="w-16 text-xs text-txt-secondary md:pt-1.5">참조문서</span>
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
            className="w-full h-11 px-3 text-base border border-border-primary rounded-lg bg-surface text-txt-primary md:w-auto md:h-auto md:py-1.5 md:text-xs"
          >
            <option value="">완료된 문서 추가</option>
            {refPool.filter(r => r.id !== reportId).map(r => (
              <option key={r.id} value={r.id}>{r.doc_no ?? ''} {r.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={`${stepFlex(1)} justify-end gap-2 mb-2`}>
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
      <div className={`${stepBlock(1)} mb-5`}><PaymentTable rows={payments} onChange={setPayments} /></div>
      <div className={`${stepBlock(2)} mb-5`}><DetailTable rows={details} vendors={vendors} onChange={setDetails} /></div>

      <div className={`${stepBlock(2)} mb-6`}>
        <textarea value={bodyHtml} onChange={e => setBodyHtml(e.target.value)}
          className="w-full min-h-32 px-3 py-3 text-base border border-border-primary rounded-lg md:text-sm" />
      </div>

      {/* 확인 단계 — 모바일 전용. 단계별의 약점인 "중간 수정이 번거롭다"를 여기서 보완한다.
          항목마다 해당 단계로 바로 돌아갈 수 있다. */}
      <div className={`${mobileOnly(LAST_STEP)} mb-5`}>
        {[
          { label: '기안자', to: 0, value: actor?.name ?? '선택 안 됨' },
          { label: '현장', to: 0, value: workKind === 'site' ? (sites.find(s => s.id === siteId)?.name || '미선택') : workKind === 'project' ? (projects.find(p => p.id === projectId)?.building_name || '미선택') : '현장 없음' },
          { label: '기안제목', to: 0, value: title || '입력 안 됨' },
          { label: '지급 정보', to: 1, value: `${payments.length}건 · ${formatMoney(totalAmount)}원` },
          { label: '상세 내용', to: 2, value: details.length > 0 ? `${details.length}건` : '없음' },
          { label: '첨부·참조', to: 3, value: `첨부 ${files.length}건 · 참조 ${refs.length}건` },
          { label: '결재선', to: 4, value: lines.length > 0 ? lines.map(l => l.name).join(' → ') : '지정 안 됨' },
        ].map(item => (
          <div key={item.label} className="flex items-start justify-between gap-3 py-3 border-b border-border-primary">
            <span className="shrink-0 text-xs text-txt-secondary w-16">{item.label}</span>
            <span className="flex-1 text-sm text-txt-primary break-all">{item.value}</span>
            <button onClick={() => { setError(null); setStep(item.to) }} className="shrink-0 text-xs text-accent-text">
              수정
            </button>
          </div>
        ))}
      </div>

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}

      {/* 데스크톱 액션 — 지금 모양 그대로 */}
      <div className="hidden md:flex justify-center gap-2 border-t border-border-primary pt-5">
        <button disabled={busy || excelBusy || !actor} onClick={() => save(false)}
          className="px-6 py-2 text-sm border border-border-primary rounded-lg disabled:opacity-40">임시저장</button>
        <button disabled={busy || excelBusy || !actor} onClick={() => save(true)}
          className="px-6 py-2 text-sm rounded-lg bg-accent text-txt-inverse disabled:opacity-40">상신하기</button>
      </div>

      {/* 모바일 단계 이동 — 화면 아래 고정 */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex gap-2 px-4 py-3 bg-surface border-t border-border-primary
                   pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        <button
          onClick={() => { setError(null); setStep(s => Math.max(s - 1, 0)) }}
          disabled={step === 0}
          className="w-24 min-h-11 flex items-center justify-center text-sm border border-border-primary rounded-lg disabled:opacity-40"
        >
          이전
        </button>
        {step < LAST_STEP ? (
          <button
            onClick={goNext}
            className="flex-1 min-h-11 flex items-center justify-center text-sm rounded-lg bg-accent text-txt-inverse"
          >
            다음
          </button>
        ) : (
          <button
            disabled={busy || excelBusy || !actor}
            onClick={() => save(true)}
            className="flex-1 min-h-11 flex items-center justify-center text-sm rounded-lg bg-accent text-txt-inverse disabled:opacity-40"
          >
            {busy ? '처리 중' : '상신하기'}
          </button>
        )}
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
