import { STAFF_STORAGE_KEY, activityLogStaffRefuseReason } from '@/lib/activityLog'
import type { ActivityLogWithStaff } from '@/lib/activityLog'

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

export async function logActivity(input: {
  action: string
  target_type?: string | null
  target_id?: string | null
  detail?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actorStaffId = actorStaffIdFromStorage()
  const refused = activityLogStaffRefuseReason(actorStaffId)
  if (refused) return { ok: false, error: refused }

  try {
    const res = await fetch('/api/activity-log', {
      method: 'POST',
      credentials: 'include',
      headers: actorHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        action: input.action,
        target_type: input.target_type ?? null,
        target_id: input.target_id ?? null,
        detail: input.detail ?? null,
        actor_staff_id: actorStaffId,
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: body?.error || '작업 이력을 남기지 못했습니다' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: '작업 이력을 남기지 못했습니다' }
  }
}

export async function fetchSiteActivityLogs(
  siteId: string,
): Promise<ActivityLogWithStaff[]> {
  const params = new URLSearchParams({ target_id: siteId, target_type: 'site' })
  const res = await fetch(`/api/activity-log?${params}`, {
    credentials: 'include',
    headers: actorHeaders(),
  })
  if (!res.ok) return []
  const body = (await res.json().catch(() => null)) as { rows?: ActivityLogWithStaff[] } | null
  return body?.rows ?? []
}
