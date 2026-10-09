import { NextRequest, after } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { admin } from '@/lib/approval/guard'
import { sendPush } from '@/lib/push/send'
import { isLeaveNotifyEvent, planLeaveNotice, type LeaveNoticeRow } from '@/lib/notify/leave'
import { isUuid } from '@/lib/notify/text'
import type { NoticeStaff } from '@/lib/notify/types'

/**
 * POST /api/notify/leave  { leave_id, event: 'requested' | 'decided' }
 *
 * 연차 화면이 신청·승인·반려를 저장한 직후 부른다.
 * 받는 사람과 문구는 화면이 보낸 값이 아니라 DB의 현재 행으로 서버가 정한다 —
 * 로그인만 하면 누구나 부를 수 있으므로, 아무 내용이나 아무에게 보내는 통로가 되면 안 된다.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }

  const { leave_id, event } = (body ?? {}) as { leave_id?: unknown; event?: unknown }
  if (!isUuid(leave_id) || !isLeaveNotifyEvent(event)) {
    return Response.json({ error: 'leave_id와 event(requested·decided)가 필요합니다' }, { status: 400 })
  }

  const [rowRes, staffRes] = await Promise.all([
    admin
      .from('leave_requests')
      .select('id, staff_id, leave_type, start_date, end_date, days, status, approved_by')
      .eq('id', leave_id)
      .maybeSingle(),
    admin.from('staff').select('id, name, role, resign_date'),
  ])

  if (rowRes.error || staffRes.error) {
    const message = rowRes.error?.message ?? staffRes.error?.message
    console.error('[notify/leave] 조회 실패:', message)
    return Response.json({ error: `조회 실패: ${message}` }, { status: 500 })
  }
  if (!rowRes.data) return Response.json({ error: '연차 신청을 찾을 수 없습니다' }, { status: 404 })

  const plan = planLeaveNotice(event, rowRes.data as LeaveNoticeRow, (staffRes.data ?? []) as NoticeStaff[])
  if (!plan.ok) return Response.json({ error: plan.error }, { status: plan.status })

  // 응답을 먼저 돌려주고 보낸다(after). sendPush는 실패해도 예외를 던지지 않는다.
  if (plan.recipients.length > 0) {
    after(() => sendPush(plan.recipients, plan.payload))
  }

  return Response.json({ ok: true, recipients: plan.recipients.length })
}
