import { NextRequest, after } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { admin } from '@/lib/approval/guard'
import { sendPush } from '@/lib/push/send'
import { isTaskNotifyEvent, planTaskNotice, type TaskNoticeRow } from '@/lib/notify/task'
import { isUuid } from '@/lib/notify/text'
import type { NoticeStaff } from '@/lib/notify/types'

/**
 * POST /api/notify/task  { task_id, event: 'assigned' | 'done' }
 *
 * 대시보드가 지시를 저장하거나 받은 일을 완료한 직후 부른다.
 * 받는 사람과 문구는 DB의 현재 행으로 서버가 정한다(화면이 보낸 내용을 그대로 싣지 않는다).
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

  const { task_id, event } = (body ?? {}) as { task_id?: unknown; event?: unknown }
  if (!isUuid(task_id) || !isTaskNotifyEvent(event)) {
    return Response.json({ error: 'task_id와 event(assigned·done)가 필요합니다' }, { status: 400 })
  }

  const [rowRes, staffRes] = await Promise.all([
    admin
      .from('tasks')
      .select('id, content, assigned_to, assigned_by, deadline, done')
      .eq('id', task_id)
      .maybeSingle(),
    admin.from('staff').select('id, name, resign_date'),
  ])

  if (rowRes.error || staffRes.error) {
    const message = rowRes.error?.message ?? staffRes.error?.message
    console.error('[notify/task] 조회 실패:', message)
    return Response.json({ error: `조회 실패: ${message}` }, { status: 500 })
  }
  if (!rowRes.data) return Response.json({ error: '할 일을 찾을 수 없습니다' }, { status: 404 })

  const plan = planTaskNotice(event, rowRes.data as TaskNoticeRow, (staffRes.data ?? []) as NoticeStaff[])
  if (!plan.ok) return Response.json({ error: plan.error }, { status: plan.status })

  // 응답을 먼저 돌려주고 보낸다(after). sendPush는 실패해도 예외를 던지지 않는다.
  if (plan.recipients.length > 0) {
    after(() => sendPush(plan.recipients, plan.payload))
  }

  return Response.json({ ok: true, recipients: plan.recipients.length })
}
