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

/**
 * 로그인 사용자를 staff 행으로 바꾼다.
 * 클라이언트가 보낸 staff_id는 쓰지 않는다 — 위조를 막는 유일한 지점이다.
 * 실패하면 Response를 돌려주므로 호출부에서 `instanceof Response`로 분기한다.
 */
export async function requireStaff(): Promise<Staff | Response> {
  const user = await getAuthUser()
  if (!user?.email) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { data, error } = await admin
    .from('staff')
    .select('id, name, role')
    .eq('email', user.email)
    .maybeSingle()

  // DB 조회 자체가 실패한 경우도 "미등록 직원"과 같은 403으로 fail-closed 처리한다(보안 동작 유지).
  // 다만 원인 구분을 위해 서버 로그에는 남겨 둔다.
  if (error) {
    console.error('[requireStaff] staff 조회 실패:', error.message)
  }

  if (!data) {
    return Response.json({ error: '등록된 직원이 아닙니다' }, { status: 403 })
  }
  return data as Staff
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
