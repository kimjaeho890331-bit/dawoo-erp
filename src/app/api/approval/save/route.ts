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

  if (!body.title?.trim()) {
    return Response.json({ error: '기안제목을 입력해 주세요' }, { status: 400 })
  }
  if (body.title.length > 50) {
    return Response.json({ error: '기안제목은 50자까지 입력할 수 있습니다' }, { status: 400 })
  }

  // 결재선은 비어 있어도 임시저장은 되지만, 내용이 있으면 규칙을 지켜야 한다
  if (body.lines.length > 0) {
    const err = validateApprovalLine(
      body.lines.map((l, i) => ({ ...l, seq: i, state: 'waiting' as const })),
      staff.id,
    )
    if (err) return Response.json({ error: err }, { status: 400 })
  }

  const total = body.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)

  let reportId = body.id

  if (reportId) {
    // 기존 문서 수정 — 본인이 기안자이고 편집 가능한 상태여야 한다
    const loaded = await loadReport(reportId)
    if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })
    if (!canSubmit(loaded.report, staff.id)) {
      return Response.json({ error: '수정할 수 없는 문서입니다' }, { status: 403 })
    }

    await admin.from('expense_reports').update({
      title: body.title,
      body_html: body.body_html ?? null,
      total_amount: total,
      updated_at: new Date().toISOString(),
    }).eq('id', reportId)

    // 자식 행은 통째로 갈아끼운다. 부분 갱신은 seq 정합성을 깨뜨린다.
    await admin.from('expense_report_payments').delete().eq('report_id', reportId)
    await admin.from('expense_report_details').delete().eq('report_id', reportId)
    await admin.from('expense_report_lines').delete().eq('report_id', reportId)
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

  if (body.payments.length > 0) {
    await admin.from('expense_report_payments').insert(
      body.payments.map((p, i) => ({
        report_id: reportId, seq: i,
        vendor_name: p.vendor_name, amount: p.amount,
        pay_request_date: p.pay_request_date, bank: p.bank,
        account_no: p.account_no, business_no: p.business_no ?? null,
      })),
    )
  }

  if (body.details.length > 0) {
    await admin.from('expense_report_details').insert(
      body.details.map((d, i) => ({ report_id: reportId, seq: i, ...d })),
    )
  }

  if (body.lines.length > 0) {
    await admin.from('expense_report_lines').insert(
      body.lines.map((l, i) => ({
        report_id: reportId, seq: i,
        staff_id: l.staff_id, role: l.role, state: 'waiting',
      })),
    )
  }

  return Response.json({ id: reportId })
}
