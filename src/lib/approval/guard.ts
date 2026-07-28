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

  const { data } = await admin
    .from('staff')
    .select('id, name, role')
    .eq('email', user.email)
    .maybeSingle()

  if (!data) {
    return Response.json({ error: '등록된 직원이 아닙니다' }, { status: 403 })
  }
  return data as Staff
}

/** 문서 + 결재선을 한 번에 읽는다. 권한 검증은 항상 DB의 현재 상태로 한다. */
export async function loadReport(reportId: string) {
  const { data: report } = await admin
    .from('expense_reports')
    .select('*')
    .eq('id', reportId)
    .maybeSingle()

  if (!report) return null

  const { data: lines } = await admin
    .from('expense_report_lines')
    .select('*')
    .eq('report_id', reportId)
    .order('seq')

  return { report, lines: lines ?? [] }
}
