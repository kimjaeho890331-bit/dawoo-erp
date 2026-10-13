'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { isLeaveApprover } from '@/lib/leave/permissions'

/**
 * 연차 설정 — 지금은 '이월 사용 기한(개월)' 하나.
 * 값은 leave_settings 테이블에 저장되고, 연차 화면이 이월 잔여를 계산할 때 읽는다
 * (실제로 동작하는 설정만 둔다는 설정 화면 원칙에 맞음).
 * 바꾸는 건 대표·관리자·경리만 — 다른 직책은 값만 본다.
 */
export default function LeaveSettings() {
  const [months, setMonths] = useState(1)
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const myId = typeof window !== 'undefined' ? localStorage.getItem('dawoo_current_staff_id') : null
      const [setRes, staffRes] = await Promise.all([
        supabase.from('leave_settings').select('carryover_months').limit(1).maybeSingle(),
        myId
          ? supabase.from('staff').select('role').eq('id', myId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      if (cancelled) return
      if (!setRes.error && setRes.data?.carryover_months != null) setMonths(Number(setRes.data.carryover_months))
      setCanEdit(isLeaveApprover((staffRes.data as { role?: string } | null)?.role ?? null))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const save = async (n: number) => {
    const v = Math.max(1, Math.min(12, n || 1))
    setMonths(v)
    const { error } = await supabase.from('leave_settings').upsert({ id: 1, carryover_months: v })
    if (error) toast.error(`저장하지 못했습니다: ${error.message}`)
    else toast.success(`이월 사용 기한을 ${v}개월로 저장했습니다`)
  }

  if (loading) return <p className="text-sm text-txt-tertiary">불러오는 중...</p>

  return (
    <div className="bg-surface rounded-[10px] border border-border-primary p-4">
      <label className="label-field">이월 사용 기한</label>
      <p className="text-[12px] text-txt-tertiary mb-3">
        입사 1년이 지날 때 안 쓰고 남은 연차는 다음 해로 <b>이월</b>됩니다. 이월분은 이 기간 안에만 쓸 수 있고,
        <b> 기간이 지나면 사라집니다</b>.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number" min={1} max={12} value={months} disabled={!canEdit}
          onChange={e => save(Number(e.target.value))}
          className="input-field w-20 text-center tabular-nums disabled:opacity-50"
        />
        <span className="text-sm text-txt-secondary">개월</span>
      </div>
      {!canEdit && (
        <p className="text-[11px] text-txt-quaternary mt-2">대표·관리자·경리만 바꿀 수 있습니다.</p>
      )}
    </div>
  )
}
