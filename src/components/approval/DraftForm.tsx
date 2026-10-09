'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Download, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useActor } from './ActorPicker'
import ApprovalLineModal, { type LineDraft } from './ApprovalLineModal'
import ApprovalLineView from './ApprovalLineView'
import PaymentTable from './PaymentTable'
import type { VendorOption } from './VendorNameCell'
import FileAttach, { MAX_FILES, type AttachedFile } from './FileAttach'
import { BTN_PRIMARY, BTN_SECONDARY } from './ui'
import { EMPTY_PAYMENT, type ApprovalStatus, type PaymentRow } from '@/types/approval'
import { validateApprovalLine } from '@/lib/approval/status'
import { defaultLines } from '@/lib/approval/linePresets'
import { formatMoney } from '@/lib/utils/format'
import WorkTargetPicker from '@/components/common/WorkTargetPicker'
import { workKindFromIds, projectLabel, selectedWorkTarget, type WorkKind, type WorkProjectOption, type WorkSiteOption } from '@/lib/workTarget'
import { draftTitleFromTarget } from '@/lib/approval/draftTitle'
import { vendorDocsToAttachments } from '@/lib/approval/vendorDocs'
import { suggestedLaborCategory, validateLaborApproval } from '@/lib/expenseCategory'

/**
 * 예전에는 본문 기본값이 "※ 첨부 파일에 견적서, 세금계산서 첨부할 것!!"이었다.
 * 안내문이 문서 내용으로 들어가 지우지 않으면 그대로 결재에 올라갔다.
 * 안내는 첨부 칸 아래로 옮기고 본문(메모)은 비워서 시작한다.
 */
const TITLE_MAX = 50

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
 * 화면 순서는 일하는 순서다 — 어디에 쓴 돈인지 → 누구에게 얼마 → 증빙 → 결재선 → 올리기.
 * 예전에는 PC가 결재선을 제목보다 먼저 묻고 지급정보를 뒤에서 물어, 폰과 순서가 달랐다.
 *
 * 폰은 이 순서를 한 단계씩 넘기고, PC는 같은 순서로 한 화면에 모두 그린다.
 * 그래서 단계는 "데이터"가 아니라 "폰에서 무엇을 보여줄지 고르는 필터"일 뿐이다.
 */
const STEPS = ['어디에 쓴 돈', '지급 정보', '증빙 첨부', '결재선', '확인'] as const
const LAST_STEP = STEPS.length - 1

/** 오류가 가리키는 칸. 그 구역에 빨간 테두리를 두르고 화면을 그리로 옮긴다. */
type ErrorField = 'basic' | 'payments' | 'files' | 'lines'
const FIELD_STEP: Record<ErrorField, number> = { basic: 0, payments: 1, files: 2, lines: 3 }

interface FormError { msg: string; field?: ErrorField }

/** 저장 안 한 내용이 있는지 비교할 때 쓰는 입력값 묶음. */
interface FormSnapshot {
  title: string
  bodyHtml: string
  siteId: string
  projectId: string
  payments: PaymentRow[]
  lineChoice: LineDraft[] | null
  files: AttachedFile[]
}
const INITIAL_FORM: FormSnapshot = {
  title: '', bodyHtml: '', siteId: '', projectId: '',
  payments: [{ ...EMPTY_PAYMENT }], lineChoice: null, files: [],
}
const snapshotOf = (f: FormSnapshot) => JSON.stringify(f)

const LEAVE_MSG = '저장하지 않은 내용이 있습니다. 목록으로 나가면 적은 내용이 사라집니다. 나갈까요?'

/** 폰 화면(단계별 입력)인지. Tailwind md 경계(768px)와 같다. */
const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches

/** 노무비 검사 문구가 어느 칸 이야기인지 고른다. */
const laborErrorField = (msg: string): ErrorField =>
  msg.includes('현장') || msg.includes('적요') ? 'basic' : 'payments'

export default function DraftForm({ reportId, copyFromId }: { reportId?: string; copyFromId?: string }) {
  const router = useRouter()
  const { actor, actorId, setActorId, staffList, loading: actorLoading } = useActor()

  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  // 빈 줄 하나를 미리 놓아 "추가"를 누르지 않고 바로 쓸 수 있게 한다.
  const [payments, setPayments] = useState<PaymentRow[]>([{ ...EMPTY_PAYMENT }])
  /**
   * 사람이 직접 정한 결재선. null이면 아직 손대지 않았다는 뜻이고, 그동안은
   * 자주 쓰는 결재선(defaultLines)을 보여주고 그대로 올린다.
   * 작성자를 바꾸면 기본값도 따라 바뀐다 — 본인이 결재선에 들어가면 안 되므로.
   */
  const [lineChoice, setLineChoice] = useState<LineDraft[] | null>(null)
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [lineOpen, setLineOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setErrorState] = useState<FormError | null>(null)
  const [excelBusy, setExcelBusy] = useState(false)
  const [workKind, setWorkKind] = useState<WorkKind>('')
  const [existingStatus, setExistingStatus] = useState<ApprovalStatus | null>(null)
  const [siteId, setSiteId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [sites, setSites] = useState<WorkSiteOption[]>([])
  const [projects, setProjects] = useState<WorkProjectOption[]>([])
  /** 폰 단계. PC에서는 이 값이 바뀌지 않고, 화면도 이 값을 보지 않는다. */
  const [step, setStep] = useState(0)
  /**
   * 수정·복사 화면은 저장된 문서를 다 읽기 전까지 저장 버튼을 잠근다.
   * 예전에는 제목이 먼저 채워지고 지급정보·결재선은 조금 뒤에 채워졌는데, 그 사이에
   * 저장을 누르면 빈 지급정보와 빈 결재선으로 문서를 덮어쓸 수 있었다.
   */
  const [ready, setReady] = useState(!reportId && !copyFromId)
  /** 읽어 온(또는 처음) 내용. 지금 내용과 다르면 "저장 안 한 내용이 있다"고 본다. */
  const [baseline, setBaseline] = useState(() => snapshotOf(INITIAL_FORM))
  /** 오류가 난 구역으로 화면을 옮겨야 할 때 그 구역 이름. 화면을 다시 그린 뒤에 옮긴다. */
  const [scrollTarget, setScrollTarget] = useState<ErrorField | null>(null)
  const excelInputRef = useRef<HTMLInputElement>(null)
  const sectionRefs = {
    basic: useRef<HTMLElement>(null),
    payments: useRef<HTMLElement>(null),
    files: useRef<HTMLElement>(null),
    lines: useRef<HTMLElement>(null),
  }

  const suggestedLines = useMemo(
    () => (actor ? defaultLines(staffList, actor.id) : []),
    [actor, staffList],
  )
  const lines = lineChoice ?? suggestedLines
  const usingSuggested = lineChoice === null && suggestedLines.length > 0

  /**
   * 오류는 맨 아래 한 줄로만 띄우지 않는다. 어느 칸 문제인지 그 구역을 빨갛게 두르고
   * 화면을 그리로 옮긴다 — 예전에는 위쪽 칸 문제도 맨 아래 버튼 옆에만 나와 찾아다녀야 했다.
   */
  /** 고치라고 한 구역을 손대면 그 오류는 바로 내린다 — 고쳤는데도 빨간 글씨가 남아 있으면 안 된 줄 안다. */
  const clearErrorFor = (field: ErrorField) => {
    if (error?.field === field) setErrorState(null)
  }

  const setError = useCallback((e: FormError | null) => {
    setErrorState(e)
    if (!e?.field) return
    // 폰은 그 구역이 있는 단계로 넘어가야 보인다. PC는 단계와 상관없이 다 보인다.
    if (isPhone()) setStep(FIELD_STEP[e.field])
    setScrollTarget(e.field)
  }, [])

  // 단계가 바뀐 화면이 그려진 다음에 옮겨야 그 구역이 실제로 보인다.
  useEffect(() => {
    if (!scrollTarget) return
    sectionRefs[scrollTarget].current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setScrollTarget(null)
    // sectionRefs는 렌더마다 새 객체지만 안의 ref는 같다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget])

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
      if (!r) { setErrorState({ msg: '문서를 불러오지 못했습니다. 목록에서 다시 열어 주세요.' }); return }

      const [{ data: p }, { data: l }, { data: f }] = await Promise.all([
        supabase.from('expense_report_payments').select('*').eq('report_id', sourceId).order('seq'),
        supabase.from('expense_report_lines').select('*, staff(name)').eq('report_id', sourceId).order('seq'),
        supabase.from('expense_report_files').select('*').eq('report_id', sourceId).order('uploaded_at'),
      ])

      const loadedPayments = (p ?? []).map(x => ({
        vendor_name: x.vendor_name, amount: x.amount,
        pay_request_date: x.pay_request_date, bank: x.bank,
        account_no: x.account_no, business_no: x.business_no ?? '',
      })) as PaymentRow[]
      const loadedLines = (l ?? []).map((x: Record<string, unknown>) => ({
        staff_id: x.staff_id as string,
        name: (x.staff as { name: string })?.name ?? '',
        role: x.role as LineDraft['role'],
      }))

      // 다 읽은 뒤 한꺼번에 채운다 — 일부만 채워진 상태로 저장되는 틈을 없앤다.
      const next: FormSnapshot = {
        title: r.title as string,
        bodyHtml: (r.body_html as string | null) ?? '',
        siteId: (r.site_id as string) || '',
        projectId: (r.project_id as string) || '',
        payments: loadedPayments.length > 0 ? loadedPayments : [{ ...EMPTY_PAYMENT }],
        // 복사해서 새로 쓸 때는 결재선·첨부를 새로 정한다 — 결재선은 기본값이 다시 깔린다.
        // 결재선 없이 임시저장해 둔 문서도 기본값을 깐다.
        lineChoice: copyFromId || loadedLines.length === 0 ? null : loadedLines,
        files: copyFromId ? [] : ((f ?? []) as AttachedFile[]),
      }
      if (reportId) setExistingStatus(r.status as ApprovalStatus)
      setTitle(next.title)
      setBodyHtml(next.bodyHtml)
      setSiteId(next.siteId)
      setProjectId(next.projectId)
      setWorkKind(workKindFromIds(next.siteId || null, next.projectId || null))
      setPayments(next.payments)
      setLineChoice(next.lineChoice)
      setFiles(next.files)
      setBaseline(snapshotOf(next))
      setReady(true)
    }
    load()
  }, [reportId, copyFromId])

  const save = useCallback(async (thenSubmit: boolean) => {
    if (!actor) { setError({ msg: '작성자를 골라 주세요', field: 'basic' }); return }

    const rowNo = missingDateRow(payments)
    if (rowNo !== null) { setError({ msg: `지급 정보 ${rowNo}번째 줄의 지급요청일을 넣어 주세요`, field: 'payments' }); return }

    if (thenSubmit) {
      const lineErr = validateApprovalLine(
        lines.map((l, i) => ({ ...l, seq: i, state: 'waiting' as const })),
        actor.id,
      )
      if (lineErr) { setError({ msg: lineErr, field: 'lines' }); return }
    }

    const laborErr = validateLaborApproval({
      title,
      site_id: siteId,
      project_id: projectId,
      payments: payments.filter(x => !isBlankPayment(x)),
      mode: thenSubmit ? 'submit' : 'save',
    })
    if (laborErr) { setError({ msg: laborErr, field: laborErrorField(laborErr) }); return }

    setBusy(true); setError(null)

    try {
      const res = await fetch('/api/approval/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reportId, actor_staff_id: actor.id, title, body_html: bodyHtml.trim() || null,
          site_id: siteId || null, project_id: projectId || null,
          payments: payments.filter(x => !isBlankPayment(x)),
          lines: lines.map(l => ({ staff_id: l.staff_id, role: l.role })),
          files,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError({ msg: json.error }); return }

      // 이미 올린 문서는 내용만 고친다. 다시 올리면 서버가 막는다.
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
      if (!sub.ok) { setError({ msg: subJson.error }); return }
      router.push(`/approval/${json.id}`)
    } catch {
      setError({ msg: '저장하지 못했습니다. 잠시 후 다시 눌러 주세요.' })
    } finally {
      setBusy(false)
    }
  }, [actor, reportId, existingStatus, title, bodyHtml, siteId, projectId, payments, lines, files, router, setError])

  const handleExcelUpload = useCallback(async (file: File) => {
    // 빈 줄 하나는 기본으로 놓여 있다. 지울 게 정말 있을 때만 묻는다.
    if (payments.some(p => !isBlankPayment(p))) {
      const ok = window.confirm('지금 표에 적은 지급 정보가 모두 지워지고 엑셀 내용으로 바뀝니다. 계속할까요?')
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
      if (!res.ok) { setError({ msg: json.error, field: 'payments' }); return }

      setPayments(json.payments)
      setError(json.errors.length > 0
        ? {
            msg: json.errors.map((x: { sheet: string; row: number; message: string }) =>
              x.row > 0 ? `${x.sheet} ${x.row}행: ${x.message}` : `${x.sheet}: ${x.message}`).join(' / '),
            field: 'payments',
          }
        : null)
    } catch {
      setError({ msg: '엑셀을 읽지 못했습니다. 잠시 후 다시 올려 주세요.', field: 'payments' })
    } finally {
      setExcelBusy(false)
      if (excelInputRef.current) excelInputRef.current.value = ''
    }
  }, [payments, setError])

  // PC·폰 두 경로가 현장 선택 시 다르게 동작하지 않도록 핸들러를 하나로 통합한다.
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
      return picked ? draftTitleFromTarget(picked) : prev
    })
  }, [sites, projects])

  // 단계를 넘기면 위로 올려준다. 긴 단계를 지나온 뒤 다음 단계의 중간부터 보이면
  // 무엇을 입력해야 하는지 알 수 없다. (오류로 단계를 옮길 때는 그 구역으로 간다.)
  const moveStep = (n: number) => {
    setStep(Math.max(0, Math.min(n, LAST_STEP)))
    window.scrollTo({ top: 0 })
  }

  const goNext = () => {
    // 그 단계에서 확인할 수 있는 것만 본다. 전체 검증은 올릴 때 서버가 다시 한다.
    if (step === 0 && !actor) { setError({ msg: '작성자를 골라 주세요', field: 'basic' }); return }
    if (step === 0 && !title.trim()) { setError({ msg: '제목을 적어 주세요', field: 'basic' }); return }
    if (step === 0 && suggestedLaborCategory(title) && !siteId && !projectId) {
      setError({ msg: '노무비는 현장 또는 지원사업을 연결해야 합니다', field: 'basic' }); return
    }
    // 지급 정보는 비워둔 채로도 다음 단계·올리기가 가능하다 — 계좌가 아직 안 나온
    // 상태에서 결재를 먼저 올리는 실무가 있어서 막지 않는다.
    setError(null)
    moveStep(step + 1)
  }

  const onPickVendor = (v: VendorOption) => {
    const toAdd = vendorDocsToAttachments(v, files)
    // 서류가 등록 안 된 거래처는 toAdd가 빈 배열이다 — 이 경우 파일도, 오류도 건드리지 않는다.
    if (toAdd.length === 0) return

    // 상한(MAX_FILES)은 FileAttach.tsx 한 곳에서만 정의한다.
    const room = Math.max(0, MAX_FILES - files.length)
    const fit = toAdd.slice(0, room)
    if (fit.length > 0) setFiles(prev => [...prev, ...fit])

    // 자리가 모자라 일부를 못 붙였으면 조용히 버리지 않고 알린다.
    if (fit.length < toAdd.length) {
      setError({ msg: `첨부는 최대 ${MAX_FILES}개까지입니다 — 거래처 서류 일부를 붙이지 못했습니다`, field: 'files' })
    }
  }

  const totalAmount = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const filledPayments = payments.filter(p => !isBlankPayment(p)).length
  const laborDraft = Boolean(suggestedLaborCategory(title))
  const disabled = busy || excelBusy || !actor || !ready
  const dirty = ready && !busy && snapshotOf({ title, bodyHtml, siteId, projectId, payments, lineChoice, files }) !== baseline

  // 새로고침·창 닫기로 적던 내용을 잃지 않게 브라우저가 한 번 묻게 한다.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
  const pageTitle = reportId ? '지출결의서 수정' : copyFromId ? '새 지출결의서 (복사)' : '새 지출결의서'
  const submitLabel = reportId && existingStatus === 'pending' ? '고친 내용 저장' : '결재 올리기'

  /** 폰에서 이 단계가 아니면 숨긴다. PC는 언제나 보인다. */
  const onStep = (n: number) => (step === n ? '' : 'hidden md:block')

  // 지급 정보 표 머리에 붙는 엑셀 버튼. 업로드 로직이 여기 있어 노드로 넘긴다.
  const excelActions = (
    <>
      <a href="/api/approval/excel-template" className={BTN_SECONDARY}>
        <Download size={14} className="text-txt-tertiary" /> 엑셀 양식
      </a>
      <label className={`${BTN_SECONDARY} cursor-pointer ${excelBusy ? 'pointer-events-none opacity-40' : ''}`}>
        <Upload size={14} className="text-txt-tertiary" /> {excelBusy ? '읽는 중…' : '엑셀로 채우기'}
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
    <div className="mx-auto max-w-4xl pb-36 md:pb-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/approval"
            onClick={e => { if (dirty && !window.confirm(LEAVE_MSG)) e.preventDefault() }}
            className="mb-1 inline-flex min-h-9 items-center gap-0.5 text-[13px] text-txt-tertiary hover:text-txt-primary"
          >
            <ChevronLeft size={15} /> 목록
          </Link>
          <h1>{pageTitle}</h1>
        </div>
        {/* 임시저장은 어느 단계에서든 눌릴 수 있어야 한다. 폰 작업은 중간에 끊기기 쉽다. */}
        <button onClick={() => save(false)} disabled={disabled} className={`${BTN_SECONDARY} md:hidden`}>
          임시저장
        </button>
      </div>

      {/* 진행 표시 — 폰 전용. 단계 이름은 아래 구역 제목이 보여주므로 막대와 숫자만 둔다. */}
      <div className="mb-6 flex items-center gap-3 md:hidden">
        <div className="flex flex-1 gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-border-primary'}`} />
          ))}
        </div>
        <span className="shrink-0 text-[12px] text-txt-tertiary">{step + 1}/{STEPS.length}</span>
      </div>

      {/* 1. 어디에 쓴 돈 */}
      <Section
        sectionRef={sectionRefs.basic}
        n={1}
        title="어디에 쓴 돈인가요"
        visibility={onStep(0)}
        invalid={error?.field === 'basic'}
      >
        <Field label="작성자" required>
          <select
            value={actorId ?? ''}
            onChange={e => { setActorId(e.target.value); clearErrorFor('basic') }}
            aria-label="작성자"
            className="h-11 w-full rounded-lg border border-border-primary bg-surface px-3 text-base text-txt-primary md:h-9 md:w-48 md:text-[13px]"
          >
            <option value="">{actorLoading ? '불러오는 중' : '골라 주세요'}</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="현장" required={laborDraft} hint={laborDraft ? '노무비는 현장 연결이 필요합니다' : undefined}>
          <WorkTargetPicker
            compact
            kind={workKind}
            siteId={siteId}
            projectId={projectId}
            sites={sites}
            projects={projects}
            onChange={handleWorkTargetChange}
          />
        </Field>
        <Field label="제목" required>
          <div className="flex flex-col gap-1">
            <input
              value={title}
              onChange={e => { setTitle(e.target.value.slice(0, TITLE_MAX)); clearErrorFor('basic') }}
              maxLength={TITLE_MAX}
              className="h-11 w-full rounded-lg border border-border-primary bg-surface px-3 text-base md:h-9 md:text-[13px]"
              placeholder="현장을 고르면 자동으로 채워집니다"
            />
            <span className={`self-end text-[12px] ${title.length >= TITLE_MAX ? 'text-danger' : 'text-txt-tertiary'}`}>
              {title.length >= TITLE_MAX ? `최대 ${TITLE_MAX}자까지 적을 수 있습니다` : `${title.length}/${TITLE_MAX}`}
            </span>
          </div>
        </Field>
      </Section>

      {/* 2. 누구에게 얼마 */}
      <section ref={sectionRefs.payments} className={`mb-8 scroll-mt-6 ${onStep(1)}`}>
        <SectionTitle n={2} title="누구에게 얼마를 주나요" />
        <div className={`rounded-lg ${error?.field === 'payments' ? 'ring-1 ring-danger' : ''}`}>
          <PaymentTable
            actions={excelActions}
            rows={payments}
            onChange={rows => { setPayments(rows); clearErrorFor('payments') }}
            onPickVendor={onPickVendor}
          />
        </div>
      </section>

      {/* 3. 증빙 첨부 + 메모 */}
      <Section
        sectionRef={sectionRefs.files}
        n={3}
        title="증빙 첨부"
        visibility={onStep(2)}
        invalid={error?.field === 'files'}
      >
        <FileAttach files={files} onChange={f => { setFiles(f); clearErrorFor('files') }} />
        <div className="mt-5">
          <label htmlFor="draft-memo" className="mb-1.5 block text-label">메모 (선택)</label>
          <textarea
            id="draft-memo"
            value={bodyHtml}
            onChange={e => setBodyHtml(e.target.value)}
            placeholder="결재하는 사람이 알아야 할 내용이 있으면 적어 주세요"
            className="min-h-24 w-full rounded-lg border border-border-primary bg-surface px-3 py-2.5 text-base leading-relaxed md:text-[13px]"
          />
        </div>
      </Section>

      {/* 4. 결재선 */}
      <Section
        sectionRef={sectionRefs.lines}
        n={4}
        title="결재선"
        visibility={onStep(3)}
        invalid={error?.field === 'lines'}
        action={
          <button onClick={() => setLineOpen(true)} className={BTN_SECONDARY}>
            {lines.length > 0 ? '바꾸기' : '정하기'}
          </button>
        }
      >
        {/* 결재자를 아직 안 골랐어도 작성자 칸은 늘 보여준다 — 누가 올리는 문서인지가 먼저다. */}
        <ApprovalLineView compact drafterName={actor?.name ?? ''} lines={lines} />
        {usingSuggested && (
          <p className="mt-3 text-[12px] text-txt-tertiary">자주 쓰는 결재선으로 미리 채웠습니다. 다르면 &lsquo;바꾸기&rsquo;를 눌러 주세요.</p>
        )}
        {lines.length === 0 && (
          <p className="mt-3 text-[12px] text-txt-tertiary">&lsquo;정하기&rsquo;를 눌러 결재할 사람을 골라 주세요.</p>
        )}
      </Section>

      {/* 확인 단계 — 폰 전용. 단계별의 약점인 "중간 수정이 번거롭다"를 여기서 보완한다.
          항목마다 해당 단계로 바로 돌아갈 수 있다. */}
      <div className={`${step === LAST_STEP ? '' : 'hidden'} mb-5 md:hidden`}>
        <h2 className="mb-1">올리기 전에 확인</h2>
        {[
          { label: '작성자', to: 0, value: actor?.name ?? '선택 안 됨' },
          { label: '현장', to: 0, value: selectedWorkTarget({ sites, projects, siteId, projectId })?.label ?? (workKind ? '미선택' : '현장 없음') },
          { label: '제목', to: 0, value: title || '입력 안 됨' },
          // 저장되는 건수와 같아야 한다 — 빈 줄은 서버로 보내지 않는다.
          { label: '지급 정보', to: 1, value: `${filledPayments}건 · ${formatMoney(totalAmount)}원` },
          { label: '첨부', to: 2, value: `${files.length}건` },
          { label: '결재선', to: 3, value: lines.length > 0 ? lines.map(l => l.name).join(' → ') : '지정 안 됨' },
        ].map(item => (
          <div key={item.label} className="flex items-start justify-between gap-4 border-b border-border-primary py-4">
            <span className="w-16 shrink-0 text-label">{item.label}</span>
            <span className="flex-1 break-all text-[13px] text-txt-primary">{item.value}</span>
            <button onClick={() => { setError(null); moveStep(item.to) }} className="min-h-9 shrink-0 px-1 text-[13px] text-accent-text">
              수정
            </button>
          </div>
        ))}
      </div>

      {/*
        PC 하단 바 — 화면 아래에 붙어 있어 긴 지급정보를 적다가도 바로 올릴 수 있다.
        예전에는 긴 화면 맨 아래 가운데에만 있었다. 오류도 버튼 바로 옆에 보인다.
      */}
      <div className="sticky bottom-4 z-20 hidden items-center gap-3 rounded-xl border border-border-primary bg-surface px-4 py-3 shadow-[0_4px_20px_rgba(20,20,19,0.08)] md:flex">
        <div className="min-w-0 flex-1 text-[13px]">
          {error ? (
            <span className="text-danger">{error.msg}</span>
          ) : (
            <span className="text-txt-secondary">
              지급 {filledPayments}건 · <span className="text-money text-txt-primary">{formatMoney(totalAmount)}원</span>
              {lines.length > 0 && <> · 결재 {lines.map(l => l.name).join(' → ')}</>}
            </span>
          )}
        </div>
        <button disabled={disabled} onClick={() => save(false)} className={BTN_SECONDARY}>임시저장</button>
        <button disabled={disabled} onClick={() => save(true)} className={BTN_PRIMARY}>
          {busy ? '올리는 중…' : submitLabel}
        </button>
      </div>

      {/* 폰 단계 이동 — 화면 아래 고정. 오류는 버튼 바로 위에 띄운다. */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border-primary
                   px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        {error && <p className="mb-2 text-[13px] text-danger">{error.msg}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => { setError(null); moveStep(step - 1) }}
            disabled={step === 0}
            className={`${BTN_SECONDARY} w-24`}
          >
            이전
          </button>
          {step < LAST_STEP ? (
            <button onClick={goNext} className={`${BTN_PRIMARY} flex-1`}>
              다음
            </button>
          ) : (
            <button disabled={disabled} onClick={() => save(true)} className={`${BTN_PRIMARY} flex-1`}>
              {busy ? '올리는 중…' : submitLabel}
            </button>
          )}
        </div>
      </div>

      <ApprovalLineModal
        open={lineOpen}
        drafterStaffId={actor?.id ?? ''}
        value={lines}
        onChange={l => { setLineChoice(l); if (error?.field === 'lines') setError(null) }}
        onClose={() => setLineOpen(false)}
      />
    </div>
  )
}

function SectionTitle({ n, title, action }: { n: number; title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
      <h2 className="flex items-baseline gap-2">
        <span className="text-[13px] font-medium text-txt-tertiary">{n}</span>
        {title}
      </h2>
      {action}
    </div>
  )
}

/** 번호 붙은 한 구역. 테두리 상자 안에 내용을 담는다. */
function Section({ sectionRef, n, title, action, visibility, invalid, children }: {
  sectionRef: React.RefObject<HTMLElement | null>
  n: number
  title: string
  action?: ReactNode
  /** 폰에서 이 단계가 아니면 숨기는 클래스 */
  visibility: string
  /** 오류가 이 구역을 가리키면 빨간 테두리 */
  invalid: boolean
  children: ReactNode
}) {
  return (
    <section ref={sectionRef} className={`mb-8 scroll-mt-6 ${visibility}`}>
      <SectionTitle n={n} title={title} action={action} />
      <div className={`rounded-lg border bg-surface px-4 py-4 md:px-5 ${invalid ? 'border-danger ring-1 ring-danger' : 'border-border-primary'}`}>
        {children}
      </div>
    </section>
  )
}

/** 구역 안의 "이름 · 입력칸" 한 줄. PC는 옆으로, 폰은 위아래로 놓는다. */
function Field({ label, required, hint, children }: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border-tertiary py-3 first:pt-0 last:border-b-0 last:pb-0 md:flex-row md:items-start md:gap-4">
      <div className="shrink-0 md:w-24 md:pt-2">
        <span className="text-label">
          {label} {required && <span className="text-danger">*</span>}
        </span>
        {hint && <p className="mt-0.5 text-[11px] text-txt-tertiary">{hint}</p>}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
