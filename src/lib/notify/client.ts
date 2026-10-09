import type { LeaveNotifyEvent } from './leave'
import type { TaskNotifyEvent } from './task'

/**
 * 알림 요청을 보내고 결과는 기다리지 않는다.
 *
 * 신청·승인·지시는 이미 저장된 뒤라, 알림이 안 갔다고 화면 동작을 막거나
 * 실패로 보이게 하면 안 된다. 오류는 콘솔에만 남긴다.
 * keepalive — 저장 직후 화면을 닫거나 다른 메뉴로 가도 요청이 끝까지 간다.
 *
 * 알림 문구는 서버가 행을 다시 읽어 만든다. 여기서는 어떤 행의 어떤 일인지만 넘긴다.
 */
export function notify(path: string, body: Record<string, unknown>): void {
  try {
    fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    })
      .then(res => { if (!res.ok) console.warn(`[notify] ${path} 응답 ${res.status}`) })
      .catch(e => console.warn(`[notify] ${path} 요청 실패`, e))
  } catch (e) {
    console.warn(`[notify] ${path} 요청 실패`, e)
  }
}

export function notifyLeave(leaveId: string, event: LeaveNotifyEvent): void {
  notify('/api/notify/leave', { leave_id: leaveId, event })
}

export function notifyTask(taskId: string, event: TaskNotifyEvent): void {
  notify('/api/notify/task', { task_id: taskId, event })
}
