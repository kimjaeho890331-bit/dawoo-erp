import { NextRequest } from 'next/server'
import { admin, resolveActor, loadReport } from '@/lib/approval/guard'
import {
  canApprove, canResumeCompletion, currentTurnLine, isFinalApprover,
} from '@/lib/approval/status'
import { issueDocNo } from '@/lib/approval/docNo'
import { paymentsToExpenses } from '@/lib/approval/toExpense'
import { sendPush } from '@/lib/push/send'
import { EXPENSE_CATEGORIES, type ExpenseReport } from '@/types/approval'

/**
 * 최종 승인 완료 처리(채번 + 지출 생성 + 문서 확정)를 실행한다.
 * 정상 경로(차례 선점 직후)와 재개 경로(끊긴 완료 처리 이어가기) 양쪽이 공유한다.
 *
 * doc_no는 채번 직후 바로 저장하므로(report.doc_no가 이미 있으면 재채번하지 않는다)
 * 이 함수 도중에 실패해도 재시도 시 번호가 겹치거나 허공에 소모되지 않는다.
 */
async function completeApproval({
  id, report, category, now,
}: {
  id: string
  report: Pick<ExpenseReport, 'doc_no' | 'title' | 'drafter_staff_id' | 'site_id' | 'project_id'>
  category: string
  now: string
}): Promise<Response> {
  let docNo: string

  if (report.doc_no) {
    docNo = report.doc_no
  } else {
    try {
      docNo = await issueDocNo(admin)
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : '문서번호 채번 실패' },
        { status: 500 },
      )
    }

    // 조건부 저장: 문서에 아직 doc_no가 없을 때만 내가 채번한 번호를 박는다.
    // 두 요청이 동시에 재개 경로에 들어와도 먼저 박는 쪽만 이기고, 진 쪽은
    // 자기가 뽑은 번호를 버리고 문서를 다시 읽어 이긴 쪽 번호로 수렴한다
    // (순번에 구멍이 나는 것은 허용된다).
    const { data: claimed, error: docNoError } = await admin
      .from('expense_reports')
      .update({ doc_no: docNo })
      .eq('id', id)
      .is('doc_no', null)
      .select('doc_no')
      .maybeSingle()

    if (docNoError) {
      return Response.json(
        { error: `문서번호 저장 실패: ${docNoError.message}` },
        { status: 500 },
      )
    }

    if (claimed) {
      docNo = claimed.doc_no!
    } else {
      const { data: existing, error: rereadError } = await admin
        .from('expense_reports')
        .select('doc_no')
        .eq('id', id)
        .single()

      if (rereadError || !existing?.doc_no) {
        return Response.json(
          { error: `문서번호 재조회 실패: ${rereadError?.message ?? '알 수 없는 오류'}` },
          { status: 500 },
        )
      }

      docNo = existing.doc_no
    }
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
    report: { ...report, doc_no: docNo },
    payments: payments ?? [],
    category,
    firstFileUrl: files?.[0]?.file_url ?? null,
  })

  let created = 0
  for (const row of rows) {
    const { data: exp, error } = await admin
      .from('expenses')
      .insert(row.expense)
      .select('id')
      .single()

    if (error?.code === '23505') {
      // uq_expenses_report_payment 위반: 다른 요청(동시에 들어온 재개 경로 등)이
      // 이 지급 건의 지출을 이미 만들었다는 뜻이다. 중단하지 않고 이 행만 건너뛴다.
      continue
    }

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

  // 알림 실패가 완료 처리 응답을 막아선 안 된다(sendPush는 예외를 던지지 않는다).
  await sendPush([report.drafter_staff_id], {
    title: '결재 완료',
    body: `${docNo} — ${report.title}`,
    url: `/approval/${id}`,
    tag: `approval-${id}`,
  })

  return Response.json({ ok: true, final: true, doc_no: docNo, expenses_created: created })
}

export async function POST(request: NextRequest) {
  const { id, category, comment, actor_staff_id } = (await request.json()) as {
    id: string; category?: string; comment?: string; actor_staff_id?: string
  }

  const actor = await resolveActor(actor_staff_id)
  if (actor instanceof Response) return actor
  const { staff, authEmail } = actor

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  const { report, lines } = loaded

  // 평소 경로: 지금이 내 차례. 재개 경로: 결재선은 전부 처리됐지만(끊긴 완료 처리)
  // 내가 최종 결재자라서 이어서 완료할 수 있다.
  const normal = canApprove(report, lines, staff.id)
  const resume = !normal && canResumeCompletion(report, lines, staff.id)

  if (!normal && !resume) {
    return Response.json({ error: '지금 결재할 차례가 아닙니다' }, { status: 403 })
  }

  const final = resume || isFinalApprover(lines, staff.id)
  const now = new Date().toISOString()

  if (final && !(EXPENSE_CATEGORIES as readonly string[]).includes(category ?? '')) {
    return Response.json({ error: '계정과목을 선택해 주세요' }, { status: 400 })
  }

  if (normal) {
    const turn = currentTurnLine(lines)!

    // 차례를 원자적으로 선점한다: 아직 'waiting'일 때만 갱신되도록 조건을 걸고,
    // 실제로 갱신된 행을 돌려받는지 확인한다. 동시에 도착한 다른 요청은 여기서 걸러진다.
    const { data: claimed, error: claimError } = await admin
      .from('expense_report_lines')
      .update({
        state: 'approved', acted_at: now, comment: comment ?? null,
        acted_by_email: authEmail,
      })
      .eq('id', turn.id)
      .eq('state', 'waiting')
      .select('id')
      .maybeSingle()

    if (claimError) {
      return Response.json({ error: `결재 처리 실패: ${claimError.message}` }, { status: 500 })
    }
    if (!claimed) {
      return Response.json({ error: '이미 처리된 결재입니다' }, { status: 409 })
    }

    if (!final) {
      // 방금 갱신한 상태(turn을 approved로 반영)를 기준으로 다음 차례를 판정한다 —
      // 갱신 전 스냅샷(lines)을 그대로 쓰면 지금 막 처리한 사람에게 다시 알림이 간다.
      const next = currentTurnLine(
        lines.map(l => (l.id === turn.id ? { ...l, state: 'approved' as const } : l)),
      )
      if (next) {
        await sendPush([next.staff_id], {
          title: '결재 요청',
          body: report.title,
          url: `/approval/${id}`,
          tag: `approval-${id}`,
        })
      }
      return Response.json({ ok: true, final: false })
    }
  }

  // --- 최종 승인 완료: 채번 + 지출 생성 (정상 경로·재개 경로 공용) ---
  return completeApproval({ id, report, category: category!, now })
}
