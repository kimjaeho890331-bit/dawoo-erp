'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PenLine } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { formatMoney } from '@/lib/utils/format'
import {
  APPROVAL_STATUS_LABEL,
  type ApprovalStatus,
  type LineRole,
  type LineState,
} from '@/types/approval'
import { currentTurnLine } from '@/lib/approval/status'

type BoxKey =
  | 'draft' | 'submitted' | 'withdrawn' | 'rejected' | 'completed'
  | 'toApprove' | 'inProgress' | 'myRejected' | 'myCompleted'
  | 'ledger'

const BOXES: { group: string; items: { key: BoxKey; label: string }[] }[] = [
  { group: '기안함', items: [
    { key: 'draft', label: '저장된' },
    { key: 'submitted', label: '상신한' },
    { key: 'withdrawn', label: '회수된' },
    { key: 'rejected', label: '반려된' },
    { key: 'completed', label: '완료된' },
  ]},
  { group: '결재함', items: [
    { key: 'toApprove', label: '결재전' },
    { key: 'inProgress', label: '진행중' },
    { key: 'myRejected', label: '반려된' },
    { key: 'myCompleted', label: '완료된' },
  ]},
  { group: '문서대장', items: [{ key: 'ledger', label: '전체' }] },
]

const SELECT = 'id, doc_no, title, status, total_amount, submitted_at, staff:drafter_staff_id(name)'

interface Row {
  id: string
  doc_no: string | null
  title: string
  status: ApprovalStatus
  total_amount: number
  submitted_at: string | null
  staff: { name: string } | null
}

// currentTurnLine이 요구하는 필드 전부(seq/staff_id/role/state)를 조회해야 한다.
interface LineForTurn {
  seq: number
  staff_id: string
  role: LineRole
  state: LineState
}

const MY_DRAFT_STATUS: Record<'draft' | 'submitted' | 'withdrawn' | 'rejected' | 'completed', ApprovalStatus> = {
  draft: 'draft',
  submitted: 'pending',
  withdrawn: 'withdrawn',
  rejected: 'rejected',
  completed: 'approved',
}

export default function ApprovalPage() {
  const { staff } = useAuth()
  const [box, setBox] = useState<BoxKey>('toApprove')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!staff) return
    setLoading(true)

    // 기안함 — 내가 기안자인 문서. 칸별 status로 구분.
    if (box in MY_DRAFT_STATUS) {
      const status = MY_DRAFT_STATUS[box as keyof typeof MY_DRAFT_STATUS]
      const { data } = await supabase
        .from('expense_reports')
        .select(SELECT)
        .eq('drafter_staff_id', staff.id)
        .eq('status', status)
        .order('submitted_at', { ascending: false, nullsFirst: false })
      setRows((data ?? []) as unknown as Row[])
      setLoading(false)
      return
    }

    // 문서대장 — 완료 문서 전체
    if (box === 'ledger') {
      const { data } = await supabase
        .from('expense_reports')
        .select(SELECT)
        .eq('status', 'approved')
        .order('submitted_at', { ascending: false, nullsFirst: false })
      setRows((data ?? []) as unknown as Row[])
      setLoading(false)
      return
    }

    // 결재함 — 내가 결재선(결재/협조)에 포함된 문서
    const { data: myLines } = await supabase
      .from('expense_report_lines')
      .select('report_id')
      .eq('staff_id', staff.id)

    const ids = Array.from(new Set((myLines ?? []).map(l => l.report_id as string)))
    if (ids.length === 0) { setRows([]); setLoading(false); return }

    if (box === 'myRejected' || box === 'myCompleted') {
      const status: ApprovalStatus = box === 'myRejected' ? 'rejected' : 'approved'
      const { data } = await supabase
        .from('expense_reports')
        .select(SELECT)
        .in('id', ids)
        .eq('status', status)
        .order('submitted_at', { ascending: false, nullsFirst: false })
      setRows((data ?? []) as unknown as Row[])
      setLoading(false)
      return
    }

    // 결재전 / 진행중 — 둘 다 status='pending'이지만 "지금 내 차례인가"로 갈린다.
    // 문서별 결재선 전체를 함께 조회해 currentTurnLine으로 판정한다(서버와 같은 함수 공유).
    const { data } = await supabase
      .from('expense_reports')
      .select(`${SELECT}, lines:expense_report_lines(seq, staff_id, role, state)`)
      .in('id', ids)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false, nullsFirst: false })

    const withLines = (data ?? []) as unknown as (Row & { lines: LineForTurn[] })[]
    const filtered = withLines.filter(r => {
      const turn = currentTurnLine(r.lines)
      const myTurn = turn !== null && turn.staff_id === staff.id
      return box === 'toApprove' ? myTurn : !myTurn
    })
    setRows(filtered)
    setLoading(false)
  }, [staff, box])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex min-h-screen">
      <aside className="w-48 border-r border-border-primary py-6 shrink-0">
        <Link href="/approval/new"
          className="flex items-center gap-2 mx-4 mb-6 px-3 py-2 text-sm border border-border-primary rounded-lg text-txt-primary">
          <PenLine size={14} className="text-txt-tertiary" /> 기안작성
        </Link>
        {BOXES.map(g => (
          <div key={g.group} className="mb-5">
            <div className="px-4 mb-1.5 text-xs text-txt-tertiary">{g.group}</div>
            {g.items.map(it => (
              <button key={it.key} onClick={() => setBox(it.key)}
                className={`w-full text-left px-4 py-1.5 text-sm ${box === it.key ? 'bg-surface-secondary font-medium text-txt-primary' : 'text-txt-secondary'}`}>
                {it.label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <main className="flex-1 px-8 py-6">
        <div className="text-sm text-txt-secondary mb-4">총 {rows.length}건</div>
        <table className="w-full table-fixed text-xs">
          <thead className="bg-surface-secondary text-txt-secondary">
            <tr>
              <th className="w-[18%] px-3 py-2.5 text-left font-normal">문서번호</th>
              <th className="px-3 py-2.5 text-left font-normal">기안제목</th>
              <th className="w-[12%] px-3 py-2.5 text-left font-normal">기안자</th>
              <th className="w-[14%] px-3 py-2.5 text-right font-normal">지급총계</th>
              <th className="w-[14%] px-3 py-2.5 text-left font-normal">상신일시</th>
              <th className="w-[10%] px-3 py-2.5 text-left font-normal">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border-primary">
                <td className="px-3 py-3 text-txt-tertiary">{r.doc_no ?? '-'}</td>
                <td className="px-3 py-3">
                  <Link href={`/approval/${r.id}`} className="hover:underline text-txt-primary">{r.title}</Link>
                </td>
                <td className="px-3 py-3 text-txt-primary">{r.staff?.name ?? ''}</td>
                <td className="px-3 py-3 text-right text-txt-primary">{formatMoney(r.total_amount)}</td>
                <td className="px-3 py-3 text-txt-secondary">
                  {r.submitted_at ? new Date(r.submitted_at).toLocaleString('ko-KR') : '-'}
                </td>
                <td className="px-3 py-3 text-txt-primary">{APPROVAL_STATUS_LABEL[r.status]}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-txt-tertiary">문서가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </main>
    </div>
  )
}
