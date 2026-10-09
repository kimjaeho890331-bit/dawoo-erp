'use client'

import { useEffect, useState } from 'react'
import { Building2, Loader2, UserCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { STAFF_STORAGE_KEY } from '@/lib/activityLog'
import { isAutoCreatedStaff } from '@/lib/staff/ghost'

interface StaffOption { id: string; name: string; role: string | null; resign_date: string | null }

/**
 * 처음 로그인한 계정을 직원 정보와 연결하는 화면.
 *
 * 예전에는 연결이 안 된 카카오 계정으로 들어오면 닉네임으로 직원 행을 새로 만들어
 * 직원 목록에 같은 사람이 둘이 됐다. 이제는 로그인 콜백이 이 화면으로 보내고,
 * 본인이 직원 목록에서 이름을 한 번 고른다(서버가 세션 이메일로 연결 — /api/staff/link-account).
 */
export default function LinkAccountPage() {
  const { user, loading, signOut } = useAuth()
  const email = user?.email ?? null
  const [staff, setStaff] = useState<StaffOption[] | null>(null)
  const [linkedName, setLinkedName] = useState<string | null>(null)
  const [picked, setPicked] = useState<StaffOption | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!email) return
    let cancelled = false
    ;(async () => {
      const [listRes, mapRes] = await Promise.all([
        supabase.from('staff').select('id, name, role, resign_date').order('name'),
        supabase.from('staff_emails').select('staff:staff_id(name)').eq('email', email).maybeSingle(),
      ])
      if (cancelled) return
      if (listRes.error) { setError('직원 목록을 불러오지 못했습니다. 새로고침해 주세요.'); setStaff([]); return }
      // 퇴사자와 예전에 자동으로 생긴 행은 고르지 못하게 뺀다
      setStaff(((listRes.data ?? []) as StaffOption[]).filter(s => !s.resign_date && !isAutoCreatedStaff(s)))
      const name = (mapRes.data?.staff as unknown as { name?: string } | null)?.name
      if (name) setLinkedName(name)
    })()
    return () => { cancelled = true }
  }, [email])

  const link = async () => {
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/staff/link-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: picked.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error || '연결하지 못했습니다. 다시 시도해 주세요.'); setBusy(false); return }
      try { localStorage.setItem(STAFF_STORAGE_KEY, picked.id) } catch { /* 저장 못 해도 다음 로그인 때 맞춰진다 */ }
      // 새로 불러와야 로그인 정보(직원)가 연결된 이름으로 다시 잡힌다
      window.location.replace('/dashboard')
    } catch {
      setError('인터넷 연결을 확인하고 다시 시도해 주세요.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="bg-surface border border-border-primary rounded-2xl shadow-sm p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-sidebar flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[18px] font-semibold text-txt-primary">본인 이름을 골라 주세요</h1>
              <p className="text-[12px] text-txt-tertiary truncate">{email ?? (loading ? '로그인 확인 중…' : '로그인 정보가 없습니다')}</p>
            </div>
          </div>

          {!loading && !email ? (
            <div className="space-y-3 text-[13px] text-txt-secondary">
              <p>로그인이 필요합니다.</p>
              <a href="/login" className="btn-primary inline-flex">로그인 화면으로</a>
            </div>
          ) : linkedName ? (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-[14px] text-txt-primary">
                <UserCheck size={16} className="text-txt-tertiary" />
                이미 <b className="text-accent-text">{linkedName}</b>님으로 연결되어 있습니다.
              </p>
              <a href="/dashboard" className="btn-primary inline-flex">대시보드로</a>
            </div>
          ) : picked ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-accent bg-accent-light px-4 py-3 text-[14px] text-txt-primary">
                이 계정을 <b className="text-accent-text">{picked.name}</b>님으로 연결합니다. 맞습니까?
                <p className="mt-1 text-[12px] text-txt-secondary">한 번 연결하면 다음부터 로그인할 때 묻지 않습니다.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={link} disabled={busy} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  네, 연결합니다
                </button>
                <button onClick={() => setPicked(null)} disabled={busy} className="btn-secondary">다시 고르기</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[13px] text-txt-secondary">
                이 로그인 계정이 아직 직원 정보와 연결되지 않았습니다. 아래에서 본인 이름을 한 번만 골라 주세요.
              </p>
              {staff === null ? (
                <p className="py-6 text-center text-[13px] text-txt-tertiary">직원 목록을 불러오는 중…</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {staff.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setPicked(s)}
                      className="min-h-11 rounded-lg border border-border-primary bg-surface px-3 text-[14px] text-txt-primary hover:border-accent hover:bg-accent-light transition-colors text-left"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="rounded-lg bg-surface-secondary px-4 py-3 text-[12px] text-txt-secondary">
                <b className="text-txt-primary">목록에 내 이름이 없으면</b> 대표나 관리자에게 직원관리에서 등록해 달라고 한 뒤 다시 로그인해 주세요.
                <button onClick={signOut} className="mt-2 block text-accent-text underline underline-offset-2">로그아웃</button>
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-[12px] text-danger">{error}</p>}
        </div>
      </div>
    </div>
  )
}
