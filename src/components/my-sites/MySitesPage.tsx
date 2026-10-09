'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { mySitesGateReason, type MySitesGate } from '@/lib/mySitesAccess'
import {
  boardOpenTaskCount,
  formatNextLine,
  formatSeoulDateHeading,
  hasDisplayText,
  openTaskCount,
  partitionSitesByOpenTasks,
  seoulTodayYmd,
  siteNextMilestone,
  siteStallDays,
  sortBoardTasks,
  telHref,
  type SiteTaskRow,
} from '@/lib/mySitesTasks'
import { shortSiteName } from '@/lib/shortSiteName'

const STAFF_KEY = 'dawoo_current_staff_id'
type BoardSite = {
  id: string
  name: string
  status: string
  hidden_from_my_sites: boolean
  address: string | null
  client_manager: string | null
  client_phone: string | null
  start_date: string | null
  end_date: string | null
}

/** 처음 불러올 때처럼 이름순 — 넘기기·다시 보이기 뒤에도 자리가 튀지 않게 */
function sortByName(list: BoardSite[]): BoardSite[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/** 할 일 한 줄에서 쓰는 동작. 고치기·지우기는 성공 여부를 돌려준다 (실패하면 쓰던 글자를 남긴다). */
type TaskActions = {
  onToggle: (task: SiteTaskRow) => void
  onRename: (task: SiteTaskRow, name: string) => Promise<boolean>
  onDelete: (task: SiteTaskRow) => void
}

// 예전에는 줄 전체가 체크 버튼이라 추가·체크만 되고 고치거나 지울 수 없었다.
// 동그라미 = 체크, 글자 = 눌러서 고치기(Enter 저장, Esc 취소), 휴지통 = 지우기.
function TaskLine({ task, actions }: { task: SiteTaskRow; actions: TaskActions }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const busyRef = useRef(false)
  const cancelRef = useRef(false)

  const startEdit = () => {
    cancelRef.current = false
    setDraft(task.task_name)
    setEditing(true)
  }

  const finishEdit = async () => {
    if (cancelRef.current || busyRef.current) return
    const name = draft.trim()
    // 비우거나 그대로면 고치지 않는다 — 지우기는 휴지통으로만 (실수로 비워서 사라지지 않게)
    if (!name || name === task.task_name) {
      setEditing(false)
      return
    }
    busyRef.current = true
    const ok = await actions.onRename(task, name)
    busyRef.current = false
    if (ok) setEditing(false)
  }

  return (
    <div
      className={`group flex items-center gap-1 min-h-[44px] md:min-h-[40px] rounded-lg ${
        task.is_done && !editing ? 'opacity-40' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => actions.onToggle(task)}
        aria-label={task.is_done ? '안 한 일로 되돌리기' : '한 일로 체크'}
        className="shrink-0 -ml-2 w-11 h-11 md:w-10 md:h-10 flex items-center justify-center rounded-lg"
      >
        <span
          className={`w-6 h-6 rounded-full border flex items-center justify-center ${
            task.is_done ? 'border-accent bg-accent' : 'border-border-secondary bg-surface'
          }`}
        >
          {task.is_done && (
            <span className="block w-2.5 h-1.5 border-b-2 border-l-2 border-white -mt-0.5 rotate-[-45deg]" />
          )}
        </span>
      </button>
      {editing ? (
        <input
          type="text"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // 한글 조합 중 Enter는 글자 확정용 — 여기서 저장하면 마지막 글자가 빠진다
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') {
              e.preventDefault()
              void finishEdit()
            } else if (e.key === 'Escape') {
              cancelRef.current = true
              setEditing(false)
            }
          }}
          onBlur={() => void finishEdit()}
          className="flex-1 min-w-0 h-9 px-1 bg-transparent text-[15px] md:text-[14px] text-txt-primary border-0 border-b border-accent rounded-none outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          title="눌러서 고치기"
          className={`flex-1 min-w-0 px-1 py-1.5 text-left text-[15px] md:text-[14px] leading-snug text-txt-primary ${
            task.is_done ? 'line-through text-txt-tertiary' : ''
          }`}
        >
          {task.task_name}
        </button>
      )}
      {/* 마우스로 쓸 때는 줄에 올렸을 때만, 손가락으로 쓸 때는 늘 보인다 */}
      <button
        type="button"
        onClick={() => actions.onDelete(task)}
        aria-label="할 일 지우기"
        title="지우기"
        className="shrink-0 w-11 h-11 md:w-9 md:h-9 flex items-center justify-center rounded-lg text-txt-quaternary hover:text-danger transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}

function AddLine({
  onAdd,
  autoFocus = false,
  inputRef,
}: {
  onAdd: (name: string) => Promise<boolean>
  autoFocus?: boolean
  inputRef?: Ref<HTMLInputElement>
}) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const name = value.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      // 실패하면 적은 글자를 지우지 않는다 — 예전에는 실패해도 칸이 비워져 적은 게 사라졌다
      if (await onAdd(name)) setValue('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        // 한글 조합 중 Enter에 반응하면 같은 할 일이 두 번 들어가거나 마지막 글자만 따로 들어간다
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          void submit()
        }
      }}
      placeholder="할 일 적기"
      disabled={saving}
      className="w-full h-[44px] md:h-[40px] px-1 bg-transparent text-[15px] md:text-[14px] text-txt-primary placeholder:text-txt-quaternary border-0 border-b border-border-tertiary rounded-none outline-none focus:border-accent"
    />
  )
}

function TaskList({
  tasks,
  actions,
  onAdd,
  addRef,
  autoFocusAdd = false,
}: {
  tasks: SiteTaskRow[]
  actions: TaskActions
  onAdd: (name: string) => Promise<boolean>
  addRef?: Ref<HTMLInputElement>
  autoFocusAdd?: boolean
}) {
  const ordered = sortBoardTasks(tasks)
  return (
    <div>
      {ordered.map((task) => (
        <TaskLine key={task.id} task={task} actions={actions} />
      ))}
      <AddLine onAdd={onAdd} autoFocus={autoFocusAdd} inputRef={addRef} />
    </div>
  )
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-[13px] leading-snug">
      <dt className="text-[11px] text-txt-tertiary">{label}</dt>
      <dd className="mt-0.5 text-txt-primary break-keep">{children}</dd>
    </div>
  )
}

function SiteMeta({ site, todayYmd }: { site: BoardSite; todayYmd: string }) {
  const next = siteNextMilestone(site, todayYmd)
  const phone = hasDisplayText(site.client_phone) ? site.client_phone!.trim() : ''
  const phoneLink = telHref(phone)
  return (
    <dl className="space-y-2">
      {hasDisplayText(site.status) && <MetaRow label="지금">{site.status}</MetaRow>}
      {next && <MetaRow label="다음">{formatNextLine(next)}</MetaRow>}
      {hasDisplayText(site.client_manager) && (
        <MetaRow label="발주처 담당자">{site.client_manager!.trim()}</MetaRow>
      )}
      {phone && (
        <MetaRow label="전화">
          {phoneLink ? (
            <a href={phoneLink} className="text-link">
              {phone}
            </a>
          ) : (
            phone
          )}
        </MetaRow>
      )}
      {hasDisplayText(site.address) && <MetaRow label="주소">{site.address!.trim()}</MetaRow>}
    </dl>
  )
}

function SummaryBadges({
  siteCount,
  openCount,
  stalledCount,
}: {
  siteCount: number
  openCount: number
  stalledCount: number
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
      <span className="text-txt-secondary">
        현장 <span className="font-semibold tabular-nums text-txt-primary">{siteCount}</span>
      </span>
      <span className="text-accent-text">
        안 한 일 <span className="font-semibold tabular-nums">{openCount}</span>
      </span>
      <span className="text-danger">
        멈춘 곳 <span className="font-semibold tabular-nums">{stalledCount}</span>
      </span>
    </div>
  )
}

export default function MySitesPage() {
  const [gate, setGate] = useState<MySitesGate | 'loading'>('loading')
  const [sites, setSites] = useState<BoardSite[]>([])
  const [hiddenSites, setHiddenSites] = useState<BoardSite[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [tasks, setTasks] = useState<SiteTaskRow[]>([])
  const [settledCount, setSettledCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [draftSiteId, setDraftSiteId] = useState<string | null>(null)
  const addRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const todayYmd = useMemo(() => seoulTodayYmd(), [])
  const dateHeading = useMemo(() => formatSeoulDateHeading(), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const id = localStorage.getItem(STAFF_KEY)
      const nextGate = mySitesGateReason({ staffId: id })
      if (cancelled) return
      setGate(nextGate)
      if (nextGate !== 'ok') {
        setLoading(false)
        return
      }

      // 예전에는 열 때마다 기본 3줄(WEEKLY_UNASSIGNED_TASKS)을 이름으로 찾아 없으면 다시 넣었다 —
      // 지우거나 이름을 고친 할 일이 다음에 열면 되살아났다. 3줄은 마이그레이션 021에서 이미 한 번 넣었다.
      // 넘긴 현장도 같이 받아 둔다 — 「숨긴 현장 보기」에서 다시 보이게 하려고.
      const [siteRes, taskRes, settledRes] = await Promise.all([
        supabase
          .from('sites')
          .select(
            'id, name, status, hidden_from_my_sites, address, client_manager, client_phone, start_date, end_date',
          )
          .neq('status', '정산완료')
          .order('name'),
        supabase
          .from('site_tasks')
          .select('id, site_id, task_name, is_done, created_at')
          .order('created_at'),
        supabase.from('sites').select('id', { count: 'exact', head: true }).eq('status', '정산완료'),
      ])
      if (cancelled) return
      if (!siteRes.error) {
        const all = (siteRes.data as BoardSite[]) || []
        setSites(all.filter((s) => !s.hidden_from_my_sites))
        setHiddenSites(all.filter((s) => s.hidden_from_my_sites))
      }
      if (!taskRes.error) setTasks((taskRes.data as SiteTaskRow[]) || [])
      if (!settledRes.error && typeof settledRes.count === 'number') {
        setSettledCount(settledRes.count)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const weekly = useMemo(() => tasks.filter((t) => t.site_id === null), [tasks])
  const visibleIds = useMemo(() => new Set(sites.map((s) => s.id)), [sites])
  const openAll = useMemo(() => boardOpenTaskCount(tasks, visibleIds), [tasks, visibleIds])
  const stalledCount = useMemo(
    () => sites.filter((s) => siteStallDays(s, todayYmd) != null).length,
    [sites, todayYmd],
  )
  const { withOpen, withoutOpen } = useMemo(
    () => partitionSitesByOpenTasks(sites, tasks),
    [sites, tasks],
  )
  const cardSites = useMemo(() => {
    if (!draftSiteId) return withOpen
    if (withOpen.some((s) => s.id === draftSiteId)) return withOpen
    const draft = withoutOpen.find((s) => s.id === draftSiteId)
    return draft ? [...withOpen, draft] : withOpen
  }, [withOpen, withoutOpen, draftSiteId])
  const listSites = useMemo(
    () => withoutOpen.filter((s) => s.id !== draftSiteId),
    [withoutOpen, draftSiteId],
  )

  // 실패하면 되돌리고 알린다 — 예전에는 조용히 되돌아가 눌렀는데 안 눌린 것처럼 보였다
  const toggleTask = async (task: SiteTaskRow) => {
    const next = !task.is_done
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_done: next } : t)))
    const { error } = await supabase.from('site_tasks').update({ is_done: next }).eq('id', task.id)
    if (error) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_done: task.is_done } : t)))
      toast.error(`체크를 저장하지 못했습니다: ${error.message}`)
    }
  }

  const addTask = async (taskName: string, siteId: string | null): Promise<boolean> => {
    const { data, error } = await supabase
      .from('site_tasks')
      .insert({ task_name: taskName, site_id: siteId, is_done: false })
      .select('id, site_id, task_name, is_done, created_at')
      .single()
    if (error || !data) {
      toast.error(`할 일을 넣지 못했습니다${error ? `: ${error.message}` : ''}`)
      return false
    }
    setTasks((prev) => [...prev, data as SiteTaskRow])
    return true
  }

  const renameTask = async (task: SiteTaskRow, name: string): Promise<boolean> => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, task_name: name } : t)))
    const { error } = await supabase.from('site_tasks').update({ task_name: name }).eq('id', task.id)
    if (error) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, task_name: task.task_name } : t)))
      toast.error(`할 일을 고치지 못했습니다: ${error.message}`)
      return false
    }
    return true
  }

  const deleteTask = async (task: SiteTaskRow) => {
    if (!confirm(`「${task.task_name}」 할 일을 지울까요?`)) return
    const { error } = await supabase.from('site_tasks').delete().eq('id', task.id)
    if (error) {
      toast.error(`할 일을 지우지 못했습니다: ${error.message}`)
      return
    }
    setTasks((prev) => prev.filter((t) => t.id !== task.id))
  }

  const taskActions: TaskActions = { onToggle: toggleTask, onRename: renameTask, onDelete: deleteTask }

  const hideSite = async (site: BoardSite) => {
    if (!confirm(`「${shortSiteName(site.name)}」을 이 보드에서 넘길까요?\n맨 아래 「숨긴 현장 보기」에서 다시 보이게 할 수 있습니다.`)) return
    if (draftSiteId === site.id) setDraftSiteId(null)
    setSites((prev) => prev.filter((s) => s.id !== site.id))
    setHiddenSites((prev) => sortByName([...prev, { ...site, hidden_from_my_sites: true }]))
    const { error } = await supabase
      .from('sites')
      .update({ hidden_from_my_sites: true })
      .eq('id', site.id)
    if (error) {
      setSites((prev) => sortByName([...prev, site]))
      setHiddenSites((prev) => prev.filter((s) => s.id !== site.id))
      toast.error(`넘기지 못했습니다: ${error.message}`)
    }
  }

  // 예전에는 한 번 넘긴 현장을 다시 볼 방법이 없었다
  const unhideSite = async (site: BoardSite) => {
    setHiddenSites((prev) => prev.filter((s) => s.id !== site.id))
    setSites((prev) => sortByName([...prev, { ...site, hidden_from_my_sites: false }]))
    const { error } = await supabase
      .from('sites')
      .update({ hidden_from_my_sites: false })
      .eq('id', site.id)
    if (error) {
      setSites((prev) => prev.filter((s) => s.id !== site.id))
      setHiddenSites((prev) => sortByName([...prev, site]))
      toast.error(`다시 보이게 하지 못했습니다: ${error.message}`)
    }
  }

  const focusAdd = (siteId: string) => {
    setDraftSiteId(siteId)
    requestAnimationFrame(() => addRefs.current[siteId]?.focus())
  }

  if (gate === 'loading') {
    return <div className="text-[13px] text-txt-tertiary">확인 중...</div>
  }
  if (gate === 'staff-unread') {
    return <div className="text-[13px] text-txt-tertiary">직원 정보를 불러오지 못했습니다. 새로고침해 주세요.</div>
  }
  if (gate === 'no-access') {
    return <div className="text-[13px] text-txt-tertiary">대표 전용 화면입니다.</div>
  }

  const settledLabel =
    settledCount == null ? null : settledCount > 0 ? `정산완료 ${settledCount}곳` : '정산완료 0곳'

  return (
    <div className="mx-auto pb-16 max-w-[640px] md:max-w-[1100px]">
      <header>
        <p className="text-[13px] text-txt-tertiary">{dateHeading}</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <h1 className="text-[22px] font-semibold text-txt-primary">
            <span className="md:hidden">안 한 일</span>
            <span className="hidden md:inline">내 현장</span>
          </h1>
          <p className="text-[40px] font-semibold leading-none tabular-nums text-accent-text md:hidden">
            {loading ? '–' : openAll}
          </p>
        </div>
        <SummaryBadges
          siteCount={sites.length}
          openCount={loading ? 0 : openAll}
          stalledCount={stalledCount}
        />
      </header>

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="text-[13px] text-txt-quaternary py-6">불러오는 중...</p>
        ) : (
          <>
            <WeeklyCard
              tasks={weekly}
              actions={taskActions}
              onAdd={(name) => addTask(name, null)}
            />
            {cardSites.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                tasks={tasks.filter((t) => t.site_id === site.id)}
                todayYmd={todayYmd}
                addRef={(el) => {
                  addRefs.current[site.id] = el
                }}
                autoFocusAdd={draftSiteId === site.id}
                actions={taskActions}
                onAdd={async (name) => {
                  const ok = await addTask(name, site.id)
                  if (ok) setDraftSiteId(null)
                  return ok
                }}
                onHide={() => hideSite(site)}
              />
            ))}
          </>
        )}
      </div>

      {!loading && listSites.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[16px] font-semibold text-txt-primary">
            할 일 없는 현장{' '}
            <span className="tabular-nums">{listSites.length}</span>개
          </h2>
          <ul className="mt-2 divide-y divide-border-tertiary">
            {listSites.map((site) => (
              <li key={site.id} className="flex items-center gap-3 min-h-[44px] py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-txt-primary truncate">
                    {shortSiteName(site.name) || site.name}
                  </p>
                  {hasDisplayText(site.status) && (
                    <p className="text-[12px] text-txt-tertiary">{site.status}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => hideSite(site)}
                  className="shrink-0 min-h-[44px] px-2 text-[13px] text-txt-tertiary"
                >
                  넘기기
                </button>
                <button
                  type="button"
                  onClick={() => focusAdd(site.id)}
                  className="shrink-0 min-h-[44px] px-2 text-[13px] text-accent-text"
                >
                  적기
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && hiddenSites.length > 0 && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            className="min-h-[44px] md:min-h-0 text-[13px] text-txt-tertiary hover:text-txt-secondary"
          >
            {showHidden ? '숨긴 현장 접기' : `숨긴 현장 보기 (${hiddenSites.length})`}
          </button>
          {showHidden && (
            <ul className="mt-1 divide-y divide-border-tertiary">
              {hiddenSites.map((site) => (
                <li key={site.id} className="flex items-center gap-3 min-h-[44px] py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-txt-secondary truncate">
                      {shortSiteName(site.name) || site.name}
                    </p>
                    {hasDisplayText(site.status) && (
                      <p className="text-[12px] text-txt-tertiary">{site.status}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => unhideSite(site)}
                    className="shrink-0 min-h-[44px] px-2 text-[13px] text-accent-text"
                  >
                    다시 보이기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {settledLabel && (
        <p className="mt-8 text-[12px] text-txt-quaternary">{settledLabel}</p>
      )}
    </div>
  )
}

function WeeklyCard({
  tasks,
  actions,
  onAdd,
}: {
  tasks: SiteTaskRow[]
  actions: TaskActions
  onAdd: (name: string) => Promise<boolean>
}) {
  const open = openTaskCount(tasks)
  return (
    <article className="bg-surface border border-border-primary rounded-[10px] px-5 py-4 md:grid md:grid-cols-[minmax(160px,220px)_minmax(0,1fr)_minmax(180px,240px)] md:gap-6 md:items-start">
      <div className="flex items-start justify-between gap-3 min-h-[32px]">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[18px] font-semibold text-txt-primary leading-snug">
            <span className="shrink-0 w-2 h-2 rounded-full bg-accent" />
            내일/내 일
          </h3>
        </div>
        {open > 0 && (
          <span className="shrink-0 text-[16px] font-semibold tabular-nums text-accent-text">
            {open}
          </span>
        )}
      </div>
      <div className="mt-3 md:mt-0">
        <TaskList tasks={tasks} actions={actions} onAdd={onAdd} />
      </div>
      <div className="hidden md:block" />
    </article>
  )
}

function SiteCard({
  site,
  tasks,
  todayYmd,
  addRef,
  autoFocusAdd,
  actions,
  onAdd,
  onHide,
}: {
  site: BoardSite
  tasks: SiteTaskRow[]
  todayYmd: string
  addRef?: Ref<HTMLInputElement>
  autoFocusAdd?: boolean
  actions: TaskActions
  onAdd: (name: string) => Promise<boolean>
  onHide: () => void
}) {
  const open = openTaskCount(tasks)
  const stall = siteStallDays(site, todayYmd)
  const title = shortSiteName(site.name) || site.name
  const place = hasDisplayText(site.address) ? site.address!.trim() : ''

  return (
    <article className="bg-surface border border-border-primary rounded-[10px] px-5 py-4 md:grid md:grid-cols-[minmax(160px,220px)_minmax(0,1fr)_minmax(180px,240px)] md:gap-6 md:items-start">
      <div>
        <div className="flex items-start justify-between gap-3 min-h-[32px]">
          <h3 className="flex items-center gap-2 text-[18px] font-semibold text-txt-primary leading-snug">
            <span className="shrink-0 w-2 h-2 rounded-full bg-accent" />
            <span className="min-w-0">{title}</span>
          </h3>
          {open > 0 && (
            <span className="shrink-0 text-[16px] font-semibold tabular-nums text-accent-text">
              {open}
            </span>
          )}
        </div>
        <p className="mt-1 pl-4 text-[12px] text-txt-tertiary">
          {hasDisplayText(site.status) ? site.status : ''}
          {stall != null && (
            <span className="text-danger">{hasDisplayText(site.status) ? ' · ' : ''}{stall}일 멈춤</span>
          )}
        </p>
        {place && (
          <p className="mt-1 pl-4 hidden md:block text-[12px] text-txt-tertiary truncate" title={place}>
            {place}
          </p>
        )}
        <div className="mt-2 pl-4">
          <button
            type="button"
            onClick={onHide}
            className="min-h-[44px] md:min-h-0 px-0 text-[13px] text-txt-tertiary"
          >
            넘기기
          </button>
        </div>
      </div>
      <div className="mt-3 md:mt-0">
        <TaskList
          tasks={tasks}
          actions={actions}
          onAdd={onAdd}
          addRef={addRef}
          autoFocusAdd={autoFocusAdd}
        />
      </div>
      <div className="hidden md:block">
        <SiteMeta site={site} todayYmd={todayYmd} />
      </div>
    </article>
  )
}
