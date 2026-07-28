import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { canApprove, currentTurnLine, isFinalApprover } from '@/lib/approval/status'
import { issueDocNo } from '@/lib/approval/docNo'
import { paymentsToExpenses } from '@/lib/approval/toExpense'
import { EXPENSE_CATEGORIES } from '@/types/approval'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const { id, category, comment } = (await request.json()) as {
    id: string; category?: string; comment?: string
  }

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canApprove(loaded.report, loaded.lines, staff.id)) {
    return Response.json({ error: '지금 결재할 차례가 아닙니다' }, { status: 403 })
  }

  const turn = currentTurnLine(loaded.lines)!
  const final = isFinalApprover(loaded.lines, staff.id)

  if (final && !(EXPENSE_CATEGORIES as readonly string[]).includes(category ?? '')) {
    return Response.json({ error: '계정과목을 선택해 주세요' }, { status: 400 })
  }

  const now = new Date().toISOString()

  const { error: lineError } = await admin.from('expense_report_lines').update({
    state: 'approved', acted_at: now, comment: comment ?? null,
  }).eq('id', turn.id)

  if (lineError) {
    return Response.json({ error: `결재 처리 실패: ${lineError.message}` }, { status: 500 })
  }

  if (!final) {
    return Response.json({ ok: true, final: false })
  }

  // --- 최종 승인: 채번 + 지출 생성 ---
  // 주의: 위의 결재선 update는 이미 커밋됐다. 아래에서 실패하면 이 문서는
  // "최종 승인 행은 approved, 문서는 pending" 상태로 멈춘다. currentTurnLine이
  // 더 이상 이 행을 대기 행으로 보지 않으므로 이 라우트로는 재시도할 수 없고
  // 수동 개입(관리자가 DB에서 상태를 되돌리거나 별도 재개 처리)이 필요하다.
  // 이는 브리프가 지시한 순서(라인 승인 → 채번/지출)를 그대로 따른 데서 오는
  // 구조적 한계이며, 트랜잭션 없이는 이 라우트 범위 안에서 해결할 수 없다.
  let docNo: string
  try {
    docNo = await issueDocNo(admin)
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : '문서번호 채번 실패' },
      { status: 500 },
    )
  }

  const { data: payments, error: paymentsError } = await admin
    .from('expense_report_payments')
    .select('*')
    .eq('report_id', id)
    .order('seq')

  if (paymentsError) {
    return Response.json(
      { error: `지급 정보 조회 실패: ${paymentsError.message}` },
      { status: 500 },
    )
  }

  const { data: files, error: filesError } = await admin
    .from('expense_report_files')
    .select('file_url')
    .eq('report_id', id)
    .order('uploaded_at')
    .limit(1)

  if (filesError) {
    return Response.json(
      { error: `첨부파일 조회 실패: ${filesError.message}` },
      { status: 500 },
    )
  }

  const rows = paymentsToExpenses({
    report: { ...loaded.report, doc_no: docNo },
    payments: payments ?? [],
    category: category!,
    firstFileUrl: files?.[0]?.file_url ?? null,
  })

  let created = 0
  for (const row of rows) {
    const { data: exp, error } = await admin
      .from('expenses')
      .insert(row.expense)
      .select('id')
      .single()

    if (error || !exp) {
      // 여기서 멈춘다. 이미 만든 건 expense_id가 박혀 있어 재시도해도 중복되지 않는다.
      return Response.json(
        { error: `지출 등록 실패: ${error?.message}. 생성 ${created}건까지 반영됨` },
        { status: 500 },
      )
    }

    // 지출을 만든 직후 바로 되기록한다 — 이 되기록이 실패하면 이 행은
    // expense_id 없이 남아 재시도 시 중복 생성될 수 있다(비-트랜잭션 한계).
    const { error: backfillError } = await admin
      .from('expense_report_payments')
      .update({ expense_id: exp.id })
      .eq('id', row.payment_id)

    if (backfillError) {
      return Response.json(
        {
          error:
            `지출 등록 후 연결 실패: ${backfillError.message}. ` +
            `생성 ${created + 1}건까지 반영됨(마지막 건은 재시도 시 중복 생성될 수 있어 확인이 필요합니다)`,
        },
        { status: 500 },
      )
    }

    created++
  }

  const { error: finalizeError } = await admin.from('expense_reports').update({
    status: 'approved',
    doc_no: docNo,
    category,
    completed_at: now,
    updated_at: now,
  }).eq('id', id)

  if (finalizeError) {
    return Response.json(
      {
        error:
          `문서 완료 처리 실패: ${finalizeError.message}. ` +
          `지출 ${created}건은 이미 등록됨(문서 상태만 수동 확인 필요)`,
      },
      { status: 500 },
    )
  }

  return Response.json({ ok: true, final: true, doc_no: docNo, expenses_created: created })
}
