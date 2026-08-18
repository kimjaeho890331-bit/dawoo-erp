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
import { projectLabel, workTargetLabel } from '@/lib/workTarget'

type BoxKey =
  | 'draft' | 'submitted' | 'completed'
  | 'toApprove' | 'inProgress' | 'myRejected' | 'myCompleted'
  | 'ledger'

const BOXES: { group: string; items: { key: BoxKey; label: string }[] }[] = [
  { group: '기안함', items: [
    { key: 'draft', label: '작성중' },
    { key: 'submitted', label: '상신' },
    { key: 'completed', label: '완료' },
  ]},
  { group: '결재함', items: [
    { key: 'toApprove', label: '결재전' },
    { key: 'inProgress', label: '진행중' },
    { key: 'myRejected', label: '반려된' },
    { key: 'myCompleted', label: '완료된' },
  ]},
  { group: '문서대장', items: [{ key: 'ledger', label: '전체' }] },
]

const BOX_META = BOXES.flatMap(g => g.items.map(it => ({ ...it, group: g.group })))

const SELECT = 'id, doc_no, title, status, total_amount, submitted_at, site_id, project_id, staff:drafter_staff_id(name)'

interface Row {
  id: string
  doc_no: string | null
  title: string
  status: ApprovalStatus
  total_amount: number
  submitted_at: string | null
  site_id: string | null
  project_id: string | null
  staff: { name: string } | null
}

// currentTurnLine이 요구하는 필드 전부(seq/staff_id/role/state)를 조회해야 한다.
interface LineForTurn {
  seq: number
  staff_id: string
  role: LineRole
  state: LineState
}

const MY_DRAFT_STATUS: Record<'draft' | 'completed', ApprovalStatus> = {
  draft: 'draft',
  completed: 'approved',
}

const SUBMITTED_STATUSES: ApprovalStatus[] = ['pending', 'withdrawn', 'rejected']

export default function ApprovalPage() {
  const { actor, actorId, setActorId, staffList, loading: actorLoading } = useActor()
  const [box, setBox] = useState<BoxKey>('toApprove')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [siteNames, setSiteNames] = useState<Record<string, string>>({})
  const [projectNames, setProjectNames] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.from('sites').select('id, name').then(({ data }) => {
      const m: Record<string, string> = {}
      for (const s of data ?? []) m[s.id] = s.name
      setSiteNames(m)
    })
    supabase.from('projects').select('id, building_name, ho, dong').then(({ data }) => {
      const m: Record<string, string> = {}
      for (const p of data ?? []) m[p.id] = projectLabel(p)
      setProjectNames(m)
    })
  }, [])

  const targetOf = (r: Row) => workTargetLabel({
    siteId: r.site_id, projectId: r.project_id,
    siteName: r.site_id ? siteNames[r.site_id] : null,
    projectName: r.project_id ? projectNames[r.project_id] : null,
  })

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

    // 기안함 — 내가 기안자인 문서. 작성중/완료는 한 상태, 상신은 진행·회수·반려를 한 목록.
    if (box === 'submitted') {
      const { data } = await supabase
        .from('expense_reports')
        .select(SELECT)
        .eq('drafter_staff_id', actor.id)
        .in('status', SUBMITTED_STATUSES)
        .order('submitted_at', { ascending: false, nullsFirst: false })
      setRows((data ?? []) as unknown as Row[])
      setLoading(false)
      return
    }

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

  const currentBox = BOX_META.find(it => it.key === box)

  return (
    <div className="-mx-4 -my-4 flex min-h-[calc(100vh-2rem)] md:-mx-8 md:-my-6 md:min-h-[calc(100vh-3rem)]">
      <aside className="hidden w-52 shrink-0 border-r border-border-primary bg-surface py-8 md:block">
        <div className="mx-5 mb-5">
          <ActorPicker actorId={actorId} staffList={staffList} onChange={setActorId} loading={actorLoading} />
        </div>
        <Link href="/approval/new"
          className="mx-5 mb-8 flex h-9 items-center justify-center gap-2 rounded-lg border border-border-primary text-sm text-txt-primary hover:bg-surface-secondary">
          <PenLine size={14} className="text-txt-tertiary" /> 기안작성
        </Link>
        {BOXES.map(g => (
          <div key={g.group} className="mb-7">
            <div className="mb-2 px-5 text-label">{g.group}</div>
            {g.items.map(it => (
              <button key={it.key} onClick={() => setBox(it.key)}
                className={`flex w-full items-center px-5 py-2.5 text-[13px] ${box === it.key ? 'bg-surface-secondary font-medium text-txt-primary' : 'text-txt-secondary hover:bg-surface-tertiary'}`}>
                {it.label}
                {it.key === 'toApprove' && pendingCount > 0 && (
                  <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] leading-none text-txt-inverse">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        {/*
          모바일 머리말. 데스크톱은 왼쪽 사이드바가 같은 역할을 하므로 숨긴다.
          직원 선택이 이 안에 있어야 한다 — 사이드바를 숨긴 폰에서 직원을 아직 안 골랐을 때,
          아래 "직원을 선택해 주세요" 분기에 갇혀 고를 방법이 없어지면 안 된다.
        */}
        <div className="mb-6 flex flex-col gap-3 md:hidden">
          <ActorPicker
            actorId={actorId}
            staffList={staffList}
            onChange={setActorId}
            loading={actorLoading}
            fullWidth
          />
          <div className="flex items-center gap-3">
            <select
              value={box}
              onChange={e => setBox(e.target.value as BoxKey)}
              aria-label="문서함 선택"
              className="h-11 min-w-0 flex-1 rounded-lg border border-border-primary bg-surface px-3 text-base text-txt-primary"
            >
              {/* 칸 이름 앞에 그룹을 붙인다. 기안함 완료와 결재함 완료된처럼
                  이름만 보여주면 어느 쪽인지 알 수 없다. */}
              {BOXES.map(g =>
                g.items.map(it => (
                  <option key={it.key} value={it.key}>{`${g.group} · ${it.label}`}</option>
                )),
              )}
            </select>
            {pendingCount > 0 && (
              <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs leading-none text-txt-inverse">
                {pendingCount}
              </span>
            )}
          </div>
          <Link
            href="/approval/new"
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border-primary text-sm text-txt-primary"
          >
            <PenLine size={15} className="text-txt-tertiary" /> 기안작성
          </Link>
        </div>

        {!actor ? (
          <div className="py-16 text-center text-[13px] text-txt-tertiary">직원을 선택해 주세요</div>
        ) : (
          <>
            <div className="mb-5 md:mb-6">
              <h1 className="hidden md:block">지출결의</h1>
              <p className="text-[13px] text-txt-secondary md:mt-2">
                {currentBox ? `${currentBox.group} · ${currentBox.label} · ` : ''}
                총 {rows.length}건
              </p>
            </div>

            {/* 모바일 목록 — 6칸 표를 폰에서 그리면 한 칸이 30px이 되어 글자가 세로로 접힌다.
                카드 한 장이 문서 한 건이고, 카드 전체가 탭 영역이다. */}
            <div className="flex flex-col gap-3 md:hidden">
              {rows.map(r => (
                <Link
                  key={r.id}
                  href={`/approval/${r.id}`}
                  className="block rounded-lg border border-border-primary bg-surface px-5 py-4"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <span className="line-clamp-2 text-[15px] font-medium leading-snug text-txt-primary">{r.title}</span>
                    <span className={`shrink-0 ${APPROVAL_STATUS_BADGE[r.status]}`}>
                      {APPROVAL_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <div className="text-money mb-2 text-[15px] text-txt-primary">{formatMoney(r.total_amount)}원</div>
                  <div className={`mb-1.5 text-[12px] ${targetOf(r).missing ? 'font-medium text-danger' : 'text-txt-secondary'}`}>
                    {targetOf(r).text}
                  </div>
                  <div className="text-[12px] text-txt-secondary">
                    {r.staff?.name ?? '-'} · {shortDateTime(r.submitted_at)}
                  </div>
                </Link>
              ))}
              {!loading && rows.length === 0 && (
                <div className="py-16 text-center text-[13px] text-txt-tertiary">문서가 없습니다</div>
              )}
            </div>

            <div className="hidden overflow-hidden rounded-lg border border-border-primary bg-surface md:block">
              <table className="w-full table-fixed">
                <thead>
                  <tr>
                    <th className="w-[16%] px-4 py-3 text-left">문서번호</th>
                    <th className="px-4 py-3 text-left">기안제목</th>
                    <th className="w-[14%] px-4 py-3 text-left">현장</th>
                    <th className="w-[12%] px-4 py-3 text-left">기안자</th>
                    <th className="w-[14%] px-4 py-3 text-right">지급총계</th>
                    <th className="w-[16%] px-4 py-3 text-left">상신일시</th>
                    <th className="w-[10%] px-4 py-3 text-left">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t border-border-primary">
                      <td className="px-4 py-3 text-txt-tertiary">{r.doc_no ?? '-'}</td>
                      <td className="px-4 py-3">
                        <Link href={`/approval/${r.id}`} className="text-txt-primary hover:underline">{r.title}</Link>
                      </td>
                      <td className={`px-4 py-3 ${targetOf(r).missing ? 'font-medium text-danger' : 'text-txt-primary'}`}>
                        {targetOf(r).text}
                      </td>
                      <td className="px-4 py-3 text-txt-primary">{r.staff?.name ?? ''}</td>
                      <td className="text-money px-4 py-3 text-right text-txt-primary">{formatMoney(r.total_amount)}</td>
                      <td className="px-4 py-3 text-txt-secondary">
                        {r.submitted_at ? new Date(r.submitted_at).toLocaleString('ko-KR') : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block ${APPROVAL_STATUS_BADGE[r.status]}`}>
                          {APPROVAL_STATUS_LABEL[r.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-16 text-center text-txt-tertiary">문서가 없습니다</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
