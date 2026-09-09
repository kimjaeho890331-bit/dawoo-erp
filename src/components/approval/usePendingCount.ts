'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { currentTurnLine } from '@/lib/approval/status'
import type { ActorStaff } from './ActorPicker'

interface LineForTurn {
  seq: number
  staff_id: string
  role: 'approval' | 'cooperation'
  state: 'waiting' | 'approved' | 'rejected'
}

/**
 * 사이드바 "결재전" 배지 건수.
 *
 * 목록 화면의 toApprove 판정과 **반드시 같은 기준**을 써야 한다 — 배지가 3인데
 * 눌러보니 2건이면 직원이 문서를 놓친 줄 알고 헤맨다.
 * (문서가 pending이고, 내 앞 순번이 전부 처리돼 지금이 내 차례인 것만 센다.)
 *
 * 목록 화면과 기안작성 화면이 같은 사이드바를 쓰게 되면서 훅으로 뺐다.
 */
export function usePendingCount(actor: ActorStaff | null): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!actor) { if (!cancelled) setCount(0); return }

      const { data: myLines } = await supabase
        .from('expense_report_lines')
        .select('report_id')
        .eq('staff_id', actor.id)

      const ids = Array.from(new Set((myLines ?? []).map(l => l.report_id as string)))
      if (ids.length === 0) { if (!cancelled) setCount(0); return }

      const { data } = await supabase
        .from('expense_reports')
        .select('id, lines:expense_report_lines(seq, staff_id, role, state)')
        .in('id', ids)
        .eq('status', 'pending')

      if (cancelled) return
      const withLines = (data ?? []) as unknown as { id: string; lines: LineForTurn[] }[]
      setCount(withLines.filter(r => {
        const turn = currentTurnLine(r.lines)
        return turn !== null && turn.staff_id === actor.id
      }).length)
    })()
    return () => { cancelled = true }
  }, [actor])

  return count
}
