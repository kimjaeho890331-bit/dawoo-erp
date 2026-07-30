import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'

export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export interface Staff {
  id: string
  name: string
  role: string
}

export interface ResolvedActor {
  staff: Staff
  /** 로그인 계정 이메일(감사용). staff 선택과 별개로, 실제 조작한 계정을 기록해 둔다. */
  authEmail: string | null
}

/**
 * 행위자(누구 이름으로 기안·결재하는가)를 화면에서 고른 staff_id로 결정한다.
 *
 * 2026-07-30 변경: 당초에는 로그인 계정 이메일로 staff 행을 찾아 행위자를 확정했다
 * (requireStaff). 그런데 운영 staff 테이블에 이메일이 사실상 채워져 있지 않고
 * 직원들이 카카오·네이버 등 여러 계정을 섞어 써서, 그 방식으로는 아무도 기안조차
 * 할 수 없었다. 그래서 행위자는 화면에서 직접 고르게 바꿨다. 근거·한계는
 * docs/superpowers/specs/2026-07-25-expense-approval-design.md의
 * "행위자를 로그인 계정에서 뽑지 않고 화면에서 고르는 이유 (2026-07-30 변경)" 절 참고.
 *
 * 로그인 세션 확인(401)은 그대로 유지한다 — 신원 선택이 자유로워지는 것은
 * 사내 로그인 사용자 사이에서일 뿐, 로그인 자체가 없어도 되는 것은 아니다.
 * 로그인 계정 이메일은 감사용으로 함께 돌려준다(authEmail) — 호출부가
 * expense_reports.drafted_by_email / expense_report_lines.acted_by_email에 남긴다.
 *
 * 실패하면 Response를 돌려주므로 호출부에서 `instanceof Response`로 분기한다.
 */
export async function resolveActor(
  actorStaffId: string | null | undefined,
): Promise<ResolvedActor | Response> {
  const user = await getAuthUser()
  if (!user?.email) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  if (!actorStaffId) {
    return Response.json({ error: '작성자를 선택해 주세요' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('staff')
    .select('id, name, role')
    .eq('id', actorStaffId)
    .maybeSingle()

  // DB 조회 자체가 실패한 경우도 "미등록 직원"과 같은 403으로 fail-closed 처리한다(보안 동작 유지).
  // 다만 원인 구분을 위해 서버 로그에는 남겨 둔다.
  if (error) {
    console.error('[resolveActor] staff 조회 실패:', error.message)
  }

  if (!data) {
    return Response.json({ error: '등록되지 않은 직원입니다' }, { status: 403 })
  }

  return { staff: data as Staff, authEmail: user.email ?? null }
}

/** 문서 + 결재선을 한 번에 읽는다. 권한 검증은 항상 DB의 현재 상태로 한다. */
export async function loadReport(reportId: string) {
  const { data: report, error: reportError } = await admin
    .from('expense_reports')
    .select('*')
    .eq('id', reportId)
    .maybeSingle()

  // 여기서도 시그니처(null 반환)는 유지한다 — 호출부가 이미 "문서를 찾을 수 없습니다"로 처리 중이며,
  // 그 fail-closed 동작은 바꾸지 않는다. DB 오류와 미존재를 구분하기 위해 로그만 남긴다.
  if (reportError) {
    console.error('[loadReport] expense_reports 조회 실패:', reportError.message)
  }

  if (!report) return null

  const { data: lines, error: linesError } = await admin
    .from('expense_report_lines')
    .select('*')
    .eq('report_id', reportId)
    .order('seq')

  if (linesError) {
    console.error('[loadReport] expense_report_lines 조회 실패:', linesError.message)
  }

  return { report, lines: lines ?? [] }
}
