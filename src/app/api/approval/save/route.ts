import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { validateApprovalLine, canSubmit } from '@/lib/approval/status'

interface PaymentInput {
  vendor_name: string; amount: number; pay_request_date: string
  bank: string; account_no: string; business_no?: string | null
}
interface DetailInput {
  vendor_name?: string | null; account?: string | null; content?: string | null
  dept_name?: string | null; amount?: number | null; note?: string | null
}
interface LineInput { staff_id: string; role: 'approval' | 'cooperation' }

interface Body {
  id?: string
  title: string
  body_html?: string | null
  payments: PaymentInput[]
  details: DetailInput[]
  lines: LineInput[]
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const body = (await request.json()) as Body

  // 요청 본문에 필드가 통째로 누락될 수 있으므로 안전하게 기본값을 둔다
  const payments = body.payments ?? []
  const details = body.details ?? []
  const lines = body.lines ?? []

  if (!body.title?.trim()) {
    return Response.json({ error: '기안제목을 입력해 주세요' }, { status: 400 })
  }
  if (body.title.length > 50) {
    return Response.json({ error: '기안제목은 50자까지 입력할 수 있습니다' }, { status: 400 })
  }

  // 결재선은 비어 있어도 임시저장은 되지만, 내용이 있으면 규칙을 지켜야 한다
  if (lines.length > 0) {
    const err = validateApprovalLine(
      lines.map((l, i) => ({ ...l, seq: i, state: 'waiting' as const })),
      staff.id,
    )
    if (err) return Response.json({ error: err }, { status: 400 })
  }

  const total = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)

  let reportId = body.id

  if (reportId) {
    // 기존 문서 수정 — 본인이 기안자이고 편집 가능한 상태여야 한다
    const loaded = await loadReport(reportId)
    if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })
    if (!canSubmit(loaded.report, staff.id)) {
      return Response.json({ error: '수정할 수 없는 문서입니다' }, { status: 403 })
    }

    const { error: updateError } = await admin.from('expense_reports').update({
      title: body.title,
      body_html: body.body_html ?? null,
      total_amount: total,
      updated_at: new Date().toISOString(),
    }).eq('id', reportId)

    if (updateError) {
      return Response.json({ error: `문서 수정 실패: ${updateError.message}` }, { status: 500 })
    }

    // 자식 행은 통째로 갈아끼운다. 부분 갱신은 seq 정합성을 깨뜨린다.
    // 트랜잭션은 쓰지 않으므로(Supabase JS 클라이언트 한계) delete와 이어지는 insert 사이에
    // 실패가 나면 자식 행이 일부만 비어 있는 상태로 남을 수 있다. 최소한 그 실패는 놓치지 않고 알린다.
    const { error: delPaymentsError } = await admin
      .from('expense_report_payments').delete().eq('report_id', reportId)
    if (delPaymentsError) {
      return Response.json(
        { error: `기존 지급 정보 삭제 실패: ${delPaymentsError.message}` },
        { status: 500 },
      )
    }

    const { error: delDetailsError } = await admin
      .from('expense_report_details').delete().eq('report_id', reportId)
    if (delDetailsError) {
      return Response.json(
        { error: `기존 상세내용 삭제 실패: ${delDetailsError.message}` },
        { status: 500 },
      )
    }

    const { error: delLinesError } = await admin
      .from('expense_report_lines').delete().eq('report_id', reportId)
    if (delLinesError) {
      return Response.json(
        { error: `기존 결재선 삭제 실패: ${delLinesError.message}` },
        { status: 500 },
      )
    }
  } else {
    const { data, error } = await admin.from('expense_reports').insert({
      title: body.title,
      body_html: body.body_html ?? null,
      status: 'draft',
      drafter_staff_id: staff.id,   // 클라이언트 값이 아니라 로그인 사용자로 강제
      total_amount: total,
    }).select('id').single()

    if (error || !data) {
      return Response.json({ error: `저장 실패: ${error?.message}` }, { status: 500 })
    }
    reportId = data.id
  }

  if (payments.length > 0) {
    const { error: paymentsError } = await admin.from('expense_report_payments').insert(
      payments.map((p, i) => ({
        report_id: reportId, seq: i,
        vendor_name: p.vendor_name, amount: p.amount,
        pay_request_date: p.pay_request_date, bank: p.bank,
        account_no: p.account_no, business_no: p.business_no ?? null,
      })),
    )
    if (paymentsError) {
      return Response.json(
        { error: `지급 정보 저장 실패: ${paymentsError.message}` },
        { status: 500 },
      )
    }
  }

  if (details.length > 0) {
    const { error: detailsError } = await admin.from('expense_report_details').insert(
      details.map((d, i) => ({ report_id: reportId, seq: i, ...d })),
    )
    if (detailsError) {
      return Response.json(
        { error: `상세내용 저장 실패: ${detailsError.message}` },
        { status: 500 },
      )
    }
  }

  if (lines.length > 0) {
    const { error: linesError } = await admin.from('expense_report_lines').insert(
      lines.map((l, i) => ({
        report_id: reportId, seq: i,
        staff_id: l.staff_id, role: l.role, state: 'waiting',
      })),
    )
    if (linesError) {
      return Response.json(
        { error: `결재선 저장 실패: ${linesError.message}` },
        { status: 500 },
      )
    }
  }

  return Response.json({ id: reportId })
}
