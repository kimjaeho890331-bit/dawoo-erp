import {
  STAFF_STORAGE_KEY,
  statusLogStaffRefuseReason,
  type StatusLogInsertInput,
} from '@/lib/statusLog'

function actorStaffIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(STAFF_STORAGE_KEY)?.trim() || null
}

function actorHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init)
  const actorStaffId = actorStaffIdFromStorage()
  if (actorStaffId) headers.set('x-actor-staff-id', actorStaffId)
  return headers
}

/** 화면에서 단계가 바뀔 때. 처리자 없으면 insert를 거부한다. */
export async function insertStatusLog(
  input: StatusLogInsertInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actorStaffId = actorStaffIdFromStorage()
  const refused = statusLogStaffRefuseReason(actorStaffId)
  if (refused) return { ok: false, error: refused }

  try {
    const res = await fetch('/api/status-logs', {
      method: 'POST',
      credentials: 'include',
      headers: actorHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        project_id: input.projectId,
        from_status: input.fromStatus,
        to_status: input.toStatus,
        note: input.note ?? null,
        actor_staff_id: actorStaffId,
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: body?.error || '단계 변경 이력을 남기지 못했습니다' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: '단계 변경 이력을 남기지 못했습니다' }
  }
}
