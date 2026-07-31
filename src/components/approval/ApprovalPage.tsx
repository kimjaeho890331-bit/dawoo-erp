'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PenLine } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ActorPicker, { useActor } from './ActorPicker'
import { formatMoney } from '@/lib/utils/format'
import {
  APPROVAL_STATUS_LABEL,
  type ApprovalStatus,
  type LineRole,
  type LineState,
} from '@/types/approval'
import { currentTurnLine } from '@/lib/approval/status'
import { APPROVAL_STATUS_BADGE, shortDateTime } from '@/lib/approval/statusStyle'

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
  const { actor, actorId, setActorId, staffList, loading: actorLoading } = useActor()
  const [box, setBox] = useState<BoxKey>('toApprove')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  // 사이드 배지 "결재전" 건수 — load()의 toApprove 판정과 반드시 같은 기준을 써야 한다.
  // (문서가 pending이고, 내 앞 순번이 전부 처리돼 지금이 내 차례인 것만 센다.)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!actor) { if (!cancelled) setPendingCount(0); return }

      const { data: myLines } = await supabase
        .from('expense_report_lines')
        .select('report_id')
        .eq('staff_id', actor.id)

      const ids = Array.from(new Set((myLines ?? []).map(l => l.report_id as string)))
      if (ids.length === 0) { if (!cancelled) setPendingCount(0); return }

      const { data } = await supabase
        .from('expense_reports')
        .select('id, lines:expense_report_lines(seq, staff_id, role, state)')
        .in('id', ids)
        .eq('status', 'pending')

      if (cancelled) return
      const withLines = (data ?? []) as unknown as { id: string; lines: LineForTurn[] }[]
      const count = withLines.filter(r => {
        const turn = currentTurnLine(r.lines)
        return turn !== null && turn.staff_id === actor.id
      }).length
      setPendingCount(count)
    })()
    return () => { cancelled = true }
  }, [actor])

  const load = useCallback(async () => {
    if (!actor) { setRows([]); setLoading(false); return }
    setLoading(true)

    // 기안함 — 내가 기안자인 문서. 칸별 status로 구분.
    if (box in MY_DRAFT_STATUS) {
      const status = MY_DRAFT_STATUS[box as keyof typeof MY_DRAFT_STATUS]
      const { data } = await supabase
        .from('expense_reports')
        .select(SELECT)
        .eq('drafter_staff_id', actor.id)
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
      .eq('staff_id', actor.id)

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
      const myTurn = turn !== null && turn.staff_id === actor.id
      return box === 'toApprove' ? myTurn : !myTurn
    })
    setRows(filtered)
    setLoading(false)
  }, [actor, box])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:block w-48 border-r border-border-primary py-6 shrink-0">
        <div className="mx-4 mb-4">
          <ActorPicker actorId={actorId} staffList={staffList} onChange={setActorId} loading={actorLoading} />
        </div>
        <Link href="/approval/new"
          className="flex items-center gap-2 mx-4 mb-6 px-3 py-2 text-sm border border-border-primary rounded-lg text-txt-primary">
          <PenLine size={14} className="text-txt-tertiary" /> 기안작성
        </Link>
        {BOXES.map(g => (
          <div key={g.group} className="mb-5">
            <div className="px-4 mb-1.5 text-xs text-txt-tertiary">{g.group}</div>
            {g.items.map(it => (
              <button key={it.key} onClick={() => setBox(it.key)}
                className={`w-full flex items-center px-4 py-1.5 text-sm ${box === it.key ? 'bg-surface-secondary font-medium text-txt-primary' : 'text-txt-secondary'}`}>
                {it.label}
                {it.key === 'toApprove' && pendingCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[11px] leading-none rounded-full bg-accent text-txt-inverse">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <main className="flex-1 min-w-0 px-4 py-4 md:px-8 md:py-6">
        {/*
          모바일 머리말. 데스크톱은 왼쪽 사이드바가 같은 역할을 하므로 숨긴다.
          직원 선택이 이 안에 있어야 한다 — 사이드바를 숨긴 폰에서 직원을 아직 안 골랐을 때,
          아래 "직원을 선택해 주세요" 분기에 갇혀 고를 방법이 없어지면 안 된다.
        */}
        <div className="md:hidden mb-4 flex flex-col gap-2">
          <ActorPicker
            actorId={actorId}
            staffList={staffList}
            onChange={setActorId}
            loading={actorLoading}
            fullWidth
          />
          <div className="flex items-center gap-2">
            <select
              value={box}
              onChange={e => setBox(e.target.value as BoxKey)}
              aria-label="문서함 선택"
              className="flex-1 min-w-0 h-11 px-3 text-base border border-border-primary rounded-lg bg-surface text-txt-primary"
            >
              {/* 칸 이름 앞에 그룹을 붙인다. 기안함에도 결재함에도 "반려된/완료된"이 있어
                  이름만 보여주면 어느 쪽인지 알 수 없다. */}
              {BOXES.map(g =>
                g.items.map(it => (
                  <option key={it.key} value={it.key}>{`${g.group} · ${it.label}`}</option>
                )),
              )}
            </select>
            {pendingCount > 0 && (
              <span className="shrink-0 px-2.5 py-1 text-xs leading-none rounded-full bg-accent text-txt-inverse">
                {pendingCount}
              </span>
            )}
          </div>
          <Link
            href="/approval/new"
            className="flex items-center justify-center gap-2 h-11 text-sm border border-border-primary rounded-lg text-txt-primary"
          >
            <PenLine size={15} className="text-txt-tertiary" /> 기안작성
          </Link>
        </div>

        {!actor ? (
          <div className="py-10 text-center text-sm text-txt-tertiary">직원을 선택해 주세요</div>
        ) : (
          <>
            <div className="text-sm text-txt-secondary mb-4">총 {rows.length}건</div>

            {/* 모바일 목록 — 6칸 표를 폰에서 그리면 한 칸이 30px이 되어 글자가 세로로 접힌다.
                카드 한 장이 문서 한 건이고, 카드 전체가 탭 영역이다. */}
            <div className="md:hidden">
              {rows.map(r => (
                <Link
                  key={r.id}
                  href={`/approval/${r.id}`}
                  className="block py-3.5 border-b border-border-primary"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-[15px] leading-snug text-txt-primary line-clamp-2">{r.title}</span>
                    <span
                      className={`shrink-0 px-2 py-0.5 text-[11px] leading-tight rounded ${APPROVAL_STATUS_BADGE[r.status]}`}
                    >
                      {APPROVAL_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <div className="text-lg text-txt-primary mb-1">{formatMoney(r.total_amount)}원</div>
                  <div className="text-xs text-txt-secondary">
                    {r.staff?.name ?? '-'} · {shortDateTime(r.submitted_at)}
                  </div>
                </Link>
              ))}
              {!loading && rows.length === 0 && (
                <div className="py-10 text-center text-sm text-txt-tertiary">문서가 없습니다</div>
              )}
            </div>

            <table className="hidden md:table w-full table-fixed text-xs">
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
          </>
        )}
      </main>
    </div>
  )
}
