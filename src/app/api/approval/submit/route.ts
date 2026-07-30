import { NextRequest } from 'next/server'
import { admin, resolveActor, loadReport } from '@/lib/approval/guard'
import { canSubmit, currentTurnLine, validateApprovalLine } from '@/lib/approval/status'
import { sendPush } from '@/lib/push/send'
import { formatMoney } from '@/lib/utils/format'

export async function POST(request: NextRequest) {
  const { id, actor_staff_id } = (await request.json()) as { id: string; actor_staff_id?: string }

  const actor = await resolveActor(actor_staff_id)
  if (actor instanceof Response) return actor
  const { staff } = actor

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canSubmit(loaded.report, staff.id)) {
    return Response.json({ error: '상신할 수 없는 문서입니다' }, { status: 403 })
  }

  const lineErr = validateApprovalLine(loaded.lines, staff.id)
  if (lineErr) return Response.json({ error: lineErr }, { status: 400 })

  const { data: payments, error: paymentsError } = await admin
    .from('expense_report_payments')
    .select('seq, vendor_name, bank, account_no, pay_request_date')
    .eq('report_id', id)
    .order('seq')

  if (paymentsError) {
    return Response.json(
      { error: `지급 정보 확인 실패: ${paymentsError.message}` },
      { status: 500 },
    )
  }

  if (!payments || payments.length === 0) {
    return Response.json({ error: '지급 정보를 한 행 이상 입력해 주세요' }, { status: 400 })
  }

  // 임시저장은 빈 값을 허용하지만(작성 중일 수 있으므로), 상신부터는 승인 즉시
  // expenses 레코드가 생성되므로 필수값이 비어 있으면 여기서 막는다.
  for (const p of payments) {
    const rowNo = p.seq + 1
    if (!p.vendor_name?.trim()) {
      return Response.json({ error: `지급 정보 ${rowNo}행의 거래처명을 입력해 주세요` }, { status: 400 })
    }
    if (!p.bank?.trim()) {
      return Response.json({ error: `지급 정보 ${rowNo}행의 은행을 입력해 주세요` }, { status: 400 })
    }
    if (!p.account_no?.trim()) {
      return Response.json({ error: `지급 정보 ${rowNo}행의 계좌번호를 입력해 주세요` }, { status: 400 })
    }
    if (!p.pay_request_date?.trim()) {
      return Response.json({ error: `지급 정보 ${rowNo}행의 지급요청일을 입력해 주세요` }, { status: 400 })
    }
  }

  // 재상신: state만 되돌리고 acted_at·comment는 남긴다
  // → 결재자가 자기가 왜 반려했는지(누가, 언제, 무슨 의견) 다시 볼 수 있어야 한다
  const { error: linesError } = await admin
    .from('expense_report_lines')
    .update({ state: 'waiting' })
    .eq('report_id', id)

  if (linesError) {
    return Response.json(
      { error: `결재선 초기화 실패: ${linesError.message}` },
      { status: 500 },
    )
  }

  const { error } = await admin.from('expense_reports').update({
    status: 'pending',
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) {
    return Response.json({ error: `상신 실패: ${error.message}` }, { status: 500 })
  }

  // 방금 모든 행을 'waiting'으로 되돌렸으므로, 그 상태 그대로 1차 결재자를 구한다.
  // 알림 실패는 상신 자체를 실패시키지 않는다(sendPush는 예외를 던지지 않는다).
  const turn = currentTurnLine(loaded.lines.map(l => ({ ...l, state: 'waiting' as const })))
  if (turn) {
    await sendPush([turn.staff_id], {
      title: '결재 요청',
      body: `${loaded.report.title} / ${formatMoney(loaded.report.total_amount)}원`,
      url: `/approval/${id}`,
      tag: `approval-${id}`,
    })
  }

  return Response.json({ ok: true })
}
