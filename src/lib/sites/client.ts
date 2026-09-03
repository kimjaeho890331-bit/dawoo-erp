import { STAFF_STORAGE_KEY } from '@/lib/activityLog'
import type { NewSiteInsertInput } from '@/lib/sites/types'

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

/** 현장 등록 모달(생성)만. 유입경로·공종을 지우고 재insert 하지 않는다. */
export async function createSite(
  payload: NewSiteInsertInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const actorStaffId = actorStaffIdFromStorage()
  try {
    const res = await fetch('/api/sites', {
      method: 'POST',
      credentials: 'include',
      headers: actorHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ...payload,
        actor_staff_id: actorStaffId,
      }),
    })
    const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null
    if (!res.ok || !body?.id) {
      return { ok: false, error: body?.error || '현장을 등록하지 못했습니다' }
    }
    return { ok: true, id: body.id }
  } catch {
    return { ok: false, error: '현장을 등록하지 못했습니다' }
  }
}
