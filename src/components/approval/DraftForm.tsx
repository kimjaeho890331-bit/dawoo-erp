'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useActor } from './ActorPicker'
import ApprovalLineModal, { type LineDraft } from './ApprovalLineModal'
import ApprovalLineView from './ApprovalLineView'
import PaymentTable from './PaymentTable'
import FileAttach, { MAX_FILES, type AttachedFile } from './FileAttach'
import MobileField from './MobileField'
import { EMPTY_PAYMENT, type ApprovalStatus, type PaymentRow } from '@/types/approval'
import { validateApprovalLine } from '@/lib/approval/status'
import { formatMoney } from '@/lib/utils/format'
import WorkTargetPicker from '@/components/common/WorkTargetPicker'
import { workKindFromIds, projectLabel, selectedWorkTarget, type WorkKind, type WorkProjectOption, type WorkSiteOption } from '@/lib/workTarget'
import { draftTitleFromTarget } from '@/lib/approval/draftTitle'
import { vendorDocsToAttachments } from '@/lib/approval/vendorDocs'
import { suggestedLaborCategory, validateLaborApproval } from '@/lib/expenseCategory'

const DEFAULT_BODY = '※ 첨부 파일에 견적서, 세금계산서 첨부할 것!!'

/**
 * 아무것도 안 적은 지급정보 행. 화면에는 빈 줄이 하나 미리 놓여 있어야 바로 쓸 수 있는데,
 * 그대로 저장하면 pay_request_date가 DATE NOT NULL이라 DB가 거부한다.
 * 그래서 저장 직전에 이런 줄을 걸러낸다 — 안 적었으면 없는 줄로 본다.
 */
const isBlankPayment = (p: PaymentRow) =>
  !p.vendor_name?.trim() && !p.amount && !p.pay_request_date?.trim() &&
  !p.bank?.trim() && !p.account_no?.trim() && !p.business_no?.trim()

/**
 * 쓰다 만 줄에 지급요청일이 없으면 무엇을 채워야 하는지 알려준다.
 *
 * pay_request_date는 DATE NOT NULL이라 빈 값이면 DB가 거부하는데, 그대로 두면
 * `invalid input syntax for type date: ""` 같은 문구가 사용자에게 그대로 나온다.
 * 특히 거래처를 고르면 은행·계좌는 자동으로 채워지고 날짜만 비어 있어서 밟기 쉽다.
 * 아무것도 안 적은 줄은 저장 전에 걸러지므로 여기서 보지 않는다.
 */
const missingDateRow = (rows: PaymentRow[]): number | null => {
  const i = rows.findIndex(p => !isBlankPayment(p) && !p.pay_request_date?.trim())
  return i === -1 ? null : i + 1
}

/**
 * 모바일 기안 작성은 단계별로 나눈다. 한 화면에 다 넣으면 폰에서 끝없이 스크롤해야 하고,
 * 어디까지 채웠는지 알 수 없다.
 *
 * 데스크톱은 이 단계를 무시하고 전부 한 화면에 그린다 — 지금 쓰고 있는 화면을 바꾸지 않는다.
 * 그래서 단계는 "데이터"가 아니라 "모바일에서 무엇을 보여줄지 고르는 필터"일 뿐이다.
 */
const STEPS = ['기안 정보', '지급 정보', '첨부', '결재선', '확인'] as const
const LAST_STEP = STEPS.length - 1

export default function DraftForm({ reportId, copyFromId }: { reportId?: string; copyFromId?: string }) {
  const router = useRouter()
  const { actor, actorId, setActorId, staffList, loading: actorLoading } = useActor()

  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_BODY)
  // 빈 줄 하나를 미리 놓아 "추가"를 누르지 않고 바로 쓸 수 있게 한다.
  const [payments, setPayments] = useState<PaymentRow[]>([{ ...EMPTY_PAYMENT }])
  const [lines, setLines] = useState<LineDraft[]>([])
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [lineOpen, setLineOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [excelBusy, setExcelBusy] = useState(false)
  const [workKind, setWorkKind] = useState<WorkKind>('')
  const [existingStatus, setExistingStatus] = useState<ApprovalStatus | null>(null)
  const [siteId, setSiteId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [sites, setSites] = useState<WorkSiteOption[]>([])
  const [projects, setProjects] = useState<WorkProjectOption[]>([])
  /** 모바일 단계. 데스크톱에서는 이 값이 바뀌지 않고, 화면도 이 값을 보지 않는다. */
  const [step, setStep] = useState(0)
  const excelInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('sites').select('id, name, contract_type, status').order('name').then(({ data }) => {
      setSites((data ?? []) as WorkSiteOption[])
    })
    supabase.from('projects').select('id, building_name, ho, dong').order('created_at', { ascending: false }).then(({ data }) => {
      setProjects((data ?? []) as WorkProjectOption[])
    })
  }, [])

  useEffect(() => {
    const sourceId = reportId ?? copyFromId
    if (!sourceId) return
    const load = async () => {
      const { data: r } = await supabase.from('expense_reports').select('*').eq('id', sourceId).maybeSingle()
      if (!r) return
      if (reportId) setExistingStatus(r.status as ApprovalStatus)
      setTitle(r.title)
      setBodyHtml(r.body_html ?? DEFAULT_BODY)
      setSiteId((r.site_id as string) || '')
      setProjectId((r.project_id as string) || '')
      setWorkKind(workKindFromIds(r.site_id as string | null, r.project_id as string | null))

      const [{ data: p }, { data: l }, { data: f }] = await Promise.all([
        supabase.from('expense_report_payments').select('*').eq('report_id', sourceId).order('seq'),
        supabase.from('expense_report_lines').select('*, staff(name)').eq('report_id', sourceId).order('seq'),
        supabase.from('expense_report_files').select('*').eq('report_id', sourceId).order('uploaded_at'),
      ])

      const loaded = (p ?? []).map(x => ({
        vendor_name: x.vendor_name, amount: x.amount,
        pay_request_date: x.pay_request_date, bank: x.bank,
        account_no: x.account_no, business_no: x.business_no ?? '',
      })) as PaymentRow[]
      setPayments(loaded.length > 0 ? loaded : [{ ...EMPTY_PAYMENT }])

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
      }
    }
    load()
  }, [reportId, copyFromId])

  const save = useCallback(async (thenSubmit: boolean) => {
    if (!actor) { setError('기안자를 선택해 주세요'); return }

    const rowNo = missingDateRow(payments)
    if (rowNo !== null) { setError(`지급 정보 ${rowNo}행의 지급요청일을 입력해 주세요`); return }

    if (thenSubmit) {
      const lineErr = validateApprovalLine(
        lines.map((l, i) => ({ ...l, seq: i, state: 'waiting' as const })),
        actor.id,
      )
      if (lineErr) { setError(lineErr); return }
    }

    const laborErr = validateLaborApproval({
      title,
      site_id: siteId,
      project_id: projectId,
      payments: payments.filter(x => !isBlankPayment(x)),
      mode: thenSubmit ? 'submit' : 'save',
    })
    if (laborErr) { setError(laborErr); return }

    setBusy(true); setError(null)

    try {
      const res = await fetch('/api/approval/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reportId, actor_staff_id: actor.id, title, body_html: bodyHtml,
          site_id: siteId || null, project_id: projectId || null,
          payments: payments.filter(x => !isBlankPayment(x)),
          lines: lines.map(l => ({ staff_id: l.staff_id, role: l.role })),
          files,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); return }

      // 이미 상신된 문서는 내용만 고친다. 다시 상신하면 서버가 막는다.
      if (!thenSubmit || existingStatus === 'pending') {
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
  }, [actor, reportId, existingStatus, title, bodyHtml, siteId, projectId, payments, lines, files, router])

  const handleExcelUpload = useCallback(async (file: File) => {
    // 빈 줄 하나는 기본으로 놓여 있다. 지울 게 정말 있을 때만 묻는다.
    if (payments.some(p => !isBlankPayment(p))) {
      const ok = window.confirm('현재 표에 입력된 지급 정보가 모두 지워지고 엑셀 내용으로 바뀝니다. 계속할까요?')
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
  }, [payments])

  // 데스크톱·모바일 두 경로가 현장 선택 시 다르게 동작하지 않도록 핸들러를 하나로 통합한다.
  // 나중에 로직을 고칠 때 한쪽만 빠뜨리는 버그를 방지한다.
  const handleWorkTargetChange = useCallback((next: { kind: WorkKind; siteId: string; projectId: string }) => {
    setWorkKind(next.kind)
    setSiteId(next.siteId)
    setProjectId(next.projectId)
    // 제목이 비어 있을 때만 채운다 — 손으로 고친 제목이 날아가면 안 된다
    setTitle(prev => {
      if (prev.trim()) return prev
      let picked: string | undefined
      if (next.siteId) {
        picked = sites.find(s => s.id === next.siteId)?.name
      } else {
        // building_name만 쓰면 동·호가 빠진다. 화면 목록(WorkTargetPicker)과 같은
        // projectLabel로 만들어야 "대광빌라 F동 302호"처럼 동·호가 제목에 남고,
        // 이 제목이 그대로 expenses.title로 복사돼도 어느 세대 건인지 알 수 있다.
        const project = projects.find(p => p.id === next.projectId)
        picked = project ? projectLabel(project) : undefined
      }
      // picked가 빈 문자열/공백뿐이면 draftTitleFromTarget이 ''을 돌려주고,
      // 그때는 아래 삼항이 prev(기존 동작)를 지킨다 — 억지로 채우지 않는다.
      return picked ? draftTitleFromTarget(picked) : prev
    })
  }, [sites, projects])

  // 단계 이동 시 위로 올려준다. 긴 단계를 지나온 뒤 다음 단계의 중간부터 보이면
  // 무엇을 입력해야 하는지 알 수 없다.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  const goNext = () => {
    // 그 단계에서 확인할 수 있는 것만 본다. 전체 검증은 상신할 때 서버가 다시 한다.
    if (step === 0 && !actor) { setError('기안자를 선택해 주세요'); return }
    if (step === 0 && !title.trim()) { setError('기안제목을 입력해 주세요'); return }
    if (step === 0 && suggestedLaborCategory(title) && !siteId && !projectId) {
      setError('노무비는 현장 또는 지원사업을 연결해야 합니다'); return
    }
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
  const laborDraft = Boolean(suggestedLaborCategory(title))

  // 지급 정보 표 머리에 붙는 엑셀 버튼. 업로드 로직이 여기 있어 노드로 넘긴다.
  const excelActions = (
    <>
      <a
        href="/api/approval/excel-template"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border-primary px-3 text-[13px] hover:bg-surface-secondary"
      >
        <Download size={14} className="text-txt-tertiary" /> 양식 받기
      </a>
      <label
        className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border-primary px-3 text-[13px] hover:bg-surface-secondary ${excelBusy ? 'pointer-events-none opacity-40' : ''}`}
      >
        <Upload size={14} className="text-txt-tertiary" /> {excelBusy ? '업로드 중…' : '엑셀 업로드'}
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
    </>
  )

  return (
    <div className="mx-auto max-w-4xl pb-28 md:py-2 md:pb-10">
      <div className="mb-6 flex items-center justify-between md:mb-8">
        <h1>지출결의서</h1>
        {/* 임시저장은 어느 단계에서든 눌릴 수 있어야 한다. 폰 작업은 중간에 끊기기 쉽다. */}
        <button
          onClick={() => save(false)}
          disabled={busy || excelBusy || !actor}
          className="h-9 rounded-lg border border-border-primary px-3 text-sm text-txt-primary disabled:opacity-40 md:hidden"
        >
          임시저장
        </button>
      </div>

      {/* 진행 표시 — 모바일 전용 */}
      <div className="mb-6 md:hidden">
        <div className="mb-3 flex gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-border-primary'}`} />
          ))}
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-medium text-txt-primary">{STEPS[step]}</span>
          <span className="text-[12px] text-txt-tertiary">{step + 1}/{STEPS.length}</span>
        </div>
      </div>

      {/* 기안정보 — 모바일 */}
      <div className={`${mobileOnly(0)} mb-6 rounded-lg border border-border-primary bg-surface px-5 py-4`}>
        <MobileField label="기안양식" value="지출결의서" />
        <MobileField label="문서번호" value="완료 시 부여" />
        <MobileField label="보존연한" value="5년" />
        <MobileField label="기안부서" value="주식회사 다우건설" />
        <div className="pt-3">
          <label className="mb-1.5 block text-label">
            기안자 <span className="text-danger">*</span>
          </label>
          <select
            value={actorId ?? ''}
            onChange={e => setActorId(e.target.value)}
            aria-label="기안자 선택"
            className="h-11 w-full rounded-lg border border-border-primary bg-surface px-3 text-base text-txt-primary"
          >
            <option value="">{actorLoading ? '불러오는 중' : '선택해 주세요'}</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="pt-3">
          <label className="mb-1.5 block text-label">
            현장 {laborDraft && <span className="text-danger">*</span>}
          </label>
          <WorkTargetPicker
            kind={workKind}
            siteId={siteId}
            projectId={projectId}
            sites={sites}
            projects={projects}
            onChange={handleWorkTargetChange}
          />
        </div>
      </div>

      <div className="mb-8 hidden overflow-hidden rounded-lg border border-border-primary bg-surface md:block">
        <table className="w-full table-fixed">
          <tbody>
            <tr>
              <td className="w-[18%] border-b border-border-primary px-5 py-3.5 text-label">기안양식</td>
              <td className="w-[32%] border-b border-border-primary px-5 py-3.5">지출결의서</td>
              <td className="w-[18%] border-b border-border-primary px-5 py-3.5 text-label">문서번호</td>
              <td className="border-b border-border-primary px-5 py-3.5 text-txt-tertiary">완료 시 부여</td>
            </tr>
            <tr>
              <td className="border-b border-border-primary px-5 py-3.5 text-label">보존연한</td>
              <td className="border-b border-border-primary px-5 py-3.5">5년</td>
              <td className="border-b border-border-primary px-5 py-3.5 text-label">기안부서</td>
              <td className="border-b border-border-primary px-5 py-3.5">주식회사 다우건설</td>
            </tr>
            <tr>
              <td className="border-b border-border-primary px-5 py-3.5 text-label">기안자 <span className="text-danger">*</span></td>
              <td className="border-b border-border-primary px-5 py-3.5">
                <select
                  value={actorId ?? ''}
                  onChange={e => setActorId(e.target.value)}
                  aria-label="기안자 선택"
                  className="h-9 rounded-lg border border-border-primary bg-surface px-3 text-[13px] text-txt-primary"
                >
                  <option value="">{actorLoading ? '불러오는 중' : '선택해 주세요'}</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </td>
              <td className="border-b border-border-primary px-5 py-3.5 text-label">
                현장 {laborDraft && <span className="text-danger">*</span>}
              </td>
              <td className="border-b border-border-primary px-5 py-3.5">
                <WorkTargetPicker
                  compact
                  kind={workKind}
                  siteId={siteId}
                  projectId={projectId}
                  sites={sites}
                  projects={projects}
                  onChange={handleWorkTargetChange}
                />
              </td>
            </tr>
            {/*
              결재선을 기안정보 표 안에 둔다. 예전에는 표 아래 별도 구역이었는데,
              이름 몇 개만 확인하면 되는 정보가 화면을 크게 차지했다.
            */}
            <tr>
              <td className="px-5 py-3.5 align-top text-label">결재선 <span className="text-danger">*</span></td>
              <td colSpan={3} className="px-5 py-3.5">
                <div className="flex flex-wrap items-start gap-3">
                  <button
                    onClick={() => setLineOpen(true)}
                    className="h-8 shrink-0 rounded-lg border border-border-primary px-3 text-[13px] hover:bg-surface-secondary"
                  >
                    결재선 설정
                  </button>
                  {/* 결재자를 아직 안 골랐어도 기안자 칸은 늘 보여준다 — 누가 올리는 문서인지가 먼저다. */}
                  <ApprovalLineView compact drafterName={actor?.name ?? ''} lines={lines} />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 폰은 단계별로 넘기므로 결재선 구역이 따로 있어야 한다. 데스크톱은 위 표 안에 있다. */}
      <div className={`${step === 3 ? 'flex' : 'hidden'} mb-3 items-center justify-between md:hidden`}>
        <h2>결재선 <span className="text-danger">*</span></h2>
        <button onClick={() => setLineOpen(true)} className="h-11 rounded-lg border border-border-primary px-4 text-sm">
          결재선 설정
        </button>
      </div>
      <div className={`${step === 3 ? 'block' : 'hidden'} mb-8 md:hidden`}>
        <ApprovalLineView drafterName={actor?.name ?? ''} lines={lines} />
      </div>

      <h2 className={`${stepBlock(0)} mb-4`}>기안내용</h2>
      <div className={`${stepFlex(0)} mb-5 flex-col gap-2 md:flex-row md:items-center md:gap-4`}>
        <span className="w-20 text-label">기안제목 <span className="text-danger">*</span></span>
        <input value={title} onChange={e => setTitle(e.target.value.slice(0, 50))}
          className="h-11 flex-1 rounded-lg border border-border-primary px-3 text-base md:h-9 md:text-[13px]" placeholder="기안제목 입력" />
        {laborDraft && (
          <span className="text-[11px] text-txt-tertiary md:ml-0">노무 제목은 현장 연결과 지급 대상이 필요합니다</span>
        )}
        <span className="self-end text-[12px] text-txt-tertiary md:self-auto">{title.length}/50</span>
      </div>
      <div className={`${stepFlex(2)} mb-8 flex-col gap-2 md:flex-row md:gap-4`}>
        <span className="w-20 text-label md:pt-2">파일첨부</span>
        <div className="flex-1"><FileAttach files={files} onChange={setFiles} /></div>
      </div>

      <div className={`${stepBlock(1)} mb-8`}>
        <PaymentTable
          actions={excelActions}
          rows={payments}
          onChange={setPayments}
          onPickVendor={v => {
            const toAdd = vendorDocsToAttachments(v, files)
            // 서류가 등록 안 된 거래처는 toAdd가 빈 배열이다 — 이 경우 파일도, 오류도 건드리지 않는다.
            if (toAdd.length === 0) return

            // 상한(MAX_FILES)은 FileAttach.tsx 한 곳에서만 정의한다. 자동 첨부가 직접 올리기와
            // 다른 상한을 쓰면(또는 상한 자체가 없으면) 직접 올린 파일이 상한 근처일 때
            // 거래처를 고르는 것만으로 조용히 상한을 넘게 된다.
            const room = Math.max(0, MAX_FILES - files.length)
            const fit = toAdd.slice(0, room)
            if (fit.length > 0) setFiles(prev => [...prev, ...fit])

            // 자리가 모자라 일부를 못 붙였으면 조용히 버리지 않고 알린다.
            // 전부 붙었을 때는 오류를 띄우지 않는다 — 기존에 떠 있던 다른 오류는 그대로 둔다.
            if (fit.length < toAdd.length) {
              setError(`첨부는 최대 ${MAX_FILES}개까지 가능합니다 — 거래처 서류 일부를 붙이지 못했습니다`)
            }
          }}
        />
      </div>

      <div className={`${stepBlock(2)} mb-8`}>
        <textarea value={bodyHtml} onChange={e => setBodyHtml(e.target.value)}
          className="min-h-36 w-full rounded-lg border border-border-primary px-4 py-3 text-base leading-relaxed md:text-[13px]" />
      </div>

      {/* 확인 단계 — 모바일 전용. 단계별의 약점인 "중간 수정이 번거롭다"를 여기서 보완한다.
          항목마다 해당 단계로 바로 돌아갈 수 있다. */}
      <div className={`${mobileOnly(LAST_STEP)} mb-5`}>
        {[
          { label: '기안자', to: 0, value: actor?.name ?? '선택 안 됨' },
          { label: '현장', to: 0, value: selectedWorkTarget({ sites, projects, siteId, projectId })?.label ?? (workKind ? '미선택' : '현장 없음') },
          { label: '기안제목', to: 0, value: title || '입력 안 됨' },
          // 저장되는 건수와 같아야 한다 — 빈 줄은 서버로 보내지 않는다.
          { label: '지급 정보', to: 1, value: `${payments.filter(p => !isBlankPayment(p)).length}건 · ${formatMoney(totalAmount)}원` },
          { label: '첨부', to: 2, value: `첨부 ${files.length}건` },
          { label: '결재선', to: 3, value: lines.length > 0 ? lines.map(l => l.name).join(' → ') : '지정 안 됨' },
        ].map(item => (
          <div key={item.label} className="flex items-start justify-between gap-4 border-b border-border-primary py-4">
            <span className="w-16 shrink-0 text-label">{item.label}</span>
            <span className="flex-1 break-all text-[13px] text-txt-primary">{item.value}</span>
            <button onClick={() => { setError(null); setStep(item.to) }} className="shrink-0 text-[13px] text-accent-text">
              수정
            </button>
          </div>
        ))}
      </div>

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}

      {/* 데스크톱 액션 — 지금 모양 그대로 */}
      <div className="hidden justify-center gap-3 border-t border-border-primary pt-8 md:flex">
        <button disabled={busy || excelBusy || !actor} onClick={() => save(false)}
          className="h-9 rounded-lg border border-border-primary px-6 text-sm disabled:opacity-40">임시저장</button>
        <button disabled={busy || excelBusy || !actor} onClick={() => save(true)}
          className="h-9 rounded-lg bg-accent px-6 text-sm text-txt-inverse disabled:opacity-40">상신하기</button>
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
