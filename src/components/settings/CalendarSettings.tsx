'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { selectableStaff } from '@/lib/staff/selectable'
import { canEditCompanySettings, COMPANY_SETTING_READONLY_NOTE } from '@/lib/staff/companySettings'

/**
 * 업무캘린더 설정 — 지금은 '상단에 띄울 직원' 하나.
 *
 * 업무캘린더 맨 위 직원 칩은 "그 사람 일정만 보기" 필터다. 직원이 늘면서 칩 줄이
 * 길어져, 자주 안 쓰는 이름까지 자리를 차지했다. 여기서 끄면 칩만 사라지고
 * 그 사람 일정은 달력에 그대로 남는다.
 *
 * 회사가 함께 보는 화면이라 값도 회사 전체가 공유한다(staff.show_in_calendar).
 * 그래서 바꾸는 건 대표·관리자·경리만 — 다른 직책은 보기만 한다.
 *
 * 퇴사자는 여기 목록에 아예 없다. 끄고 켜는 설정이 아니라 캘린더에서 늘 빠진다.
 */

interface StaffRow {
  id: string
  name: string
  role: string | null
  resign_date?: string | null
  show_in_calendar?: boolean | null
}

export default function CalendarSettings() {
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [columnMissing, setColumnMissing] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const myId = typeof window !== 'undefined' ? localStorage.getItem('dawoo_current_staff_id') : null
      const [listRes, meRes] = await Promise.all([
        supabase.from('staff').select('id, name, role, resign_date, show_in_calendar').order('name'),
        myId
          ? supabase.from('staff').select('role').eq('id', myId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      if (cancelled) return
      // 칸이 아직 없는 DB에서도 설정 화면이 깨지지 않게 안내만 띄운다
      if (listRes.error) {
        setColumnMissing(true)
        setLoading(false)
        return
      }
      setStaff(selectableStaff((listRes.data ?? []) as StaffRow[]))
      setCanEdit(canEditCompanySettings((meRes.data as { role?: string } | null)?.role ?? null))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const toggle = async (row: StaffRow, next: boolean) => {
    setSavingId(row.id)
    // 먼저 화면을 바꾸고, 실패하면 되돌린다 — 체크가 한 박자 늦게 켜지면 두 번 누르게 된다
    setStaff(prev => prev.map(s => (s.id === row.id ? { ...s, show_in_calendar: next } : s)))
    const { error } = await supabase.from('staff').update({ show_in_calendar: next }).eq('id', row.id)
    setSavingId(null)
    if (error) {
      setStaff(prev => prev.map(s => (s.id === row.id ? { ...s, show_in_calendar: !next } : s)))
      toast.error(`저장하지 못했습니다: ${error.message}`)
      return
    }
    toast.success(`${row.name} 님을 캘린더 상단에서 ${next ? '보이게' : '숨기게'} 했습니다`)
  }

  if (loading) return <p className="text-sm text-txt-tertiary">불러오는 중...</p>

  if (columnMissing) {
    return (
      <div className="bg-surface rounded-[10px] border border-border-primary p-4">
        <p className="text-sm text-txt-secondary">아직 설정을 저장할 칸이 없습니다.</p>
        <p className="text-[12px] text-txt-tertiary mt-1">
          데이터베이스에 <code className="px-1 bg-surface-tertiary rounded">033_staff_show_in_calendar.sql</code> 을 적용해야 합니다.
        </p>
      </div>
    )
  }

  const shownCount = staff.filter(s => s.show_in_calendar !== false).length

  return (
    <div className="bg-surface rounded-[10px] border border-border-primary p-4">
      <label className="label-field">상단에 띄울 직원</label>
      <p className="text-[12px] text-txt-tertiary mb-3">
        업무캘린더 맨 위 직원 칩에 누구를 띄울지 고릅니다. 회사 전체가 같은 목록을 봅니다.
        <b> 끈 직원의 일정은 달력에 그대로 남습니다</b> — 칩만 사라집니다.
        {!canEdit && <span className="block mt-1">{COMPANY_SETTING_READONLY_NOTE}</span>}
      </p>

      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {staff.map(s => {
          const on = s.show_in_calendar !== false
          return (
            <label
              key={s.id}
              className={`flex items-center gap-2.5 py-1.5 text-[13px] ${
                canEdit ? 'cursor-pointer' : 'cursor-default'
              } ${savingId === s.id ? 'opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={!canEdit || savingId === s.id}
                onChange={e => toggle(s, e.target.checked)}
                className="h-4 w-4 accent-[#c96442] disabled:opacity-50"
              />
              <span className={on ? 'text-txt-primary' : 'text-txt-quaternary'}>{s.name}</span>
              <span className="text-[11px] text-txt-tertiary">{s.role || ''}</span>
            </label>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] text-txt-tertiary">
        재직 {staff.length}명 중 {shownCount}명 표시 · 퇴사자는 목록에서 늘 빠집니다
      </p>
    </div>
  )
}
