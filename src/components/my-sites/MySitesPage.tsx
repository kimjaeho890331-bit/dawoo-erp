'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { supabase } from '@/lib/supabase'
import { mySitesGateReason, WEEKLY_UNASSIGNED_TASKS, type MySitesGate } from '@/lib/mySitesAccess'
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

function TaskLine({
  task,
  onToggle,
}: {
  task: SiteTaskRow
  onToggle: (task: SiteTaskRow) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(task)}
      className={`w-full min-h-[44px] md:min-h-[40px] flex items-center gap-3 px-1 py-1.5 text-left rounded-lg ${
        task.is_done ? 'opacity-40' : ''
      }`}
    >
      <span
        className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center ${
          task.is_done ? 'border-accent bg-accent' : 'border-border-secondary bg-surface'
        }`}
      >
        {task.is_done && (
          <span className="block w-2.5 h-1.5 border-b-2 border-l-2 border-white -mt-0.5 rotate-[-45deg]" />
        )}
      </span>
      <span
        className={`text-[15px] md:text-[14px] leading-snug text-txt-primary ${
          task.is_done ? 'line-through text-txt-tertiary' : ''
        }`}
      >
        {task.task_name}
      </span>
    </button>
  )
}

function AddLine({
  onAdd,
  autoFocus = false,
  inputRef,
}: {
  onAdd: (name: string) => Promise<void>
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
      await onAdd(name)
      setValue('')
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
        if (e.key === 'Enter') {
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
  onToggle,
  onAdd,
  addRef,
  autoFocusAdd = false,
}: {
  tasks: SiteTaskRow[]
  onToggle: (task: SiteTaskRow) => void
  onAdd: (name: string) => Promise<void>
  addRef?: Ref<HTMLInputElement>
  autoFocusAdd?: boolean
}) {
  const ordered = sortBoardTasks(tasks)
  return (
    <div>
      {ordered.map((task) => (
        <TaskLine key={task.id} task={task} onToggle={onToggle} />
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
      <span className="text-accent">
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

      await ensureWeeklyTasks()
      const [siteRes, taskRes, settledRes] = await Promise.all([
        supabase
          .from('sites')
          .select(
            'id, name, status, hidden_from_my_sites, address, client_manager, client_phone, start_date, end_date',
          )
          .neq('status', '정산완료')
          .eq('hidden_from_my_sites', false)
          .order('name'),
        supabase
          .from('site_tasks')
          .select('id, site_id, task_name, is_done, created_at')
          .order('created_at'),
        supabase.from('sites').select('id', { count: 'exact', head: true }).eq('status', '정산완료'),
      ])
      if (cancelled) return
      if (!siteRes.error) setSites((siteRes.data as BoardSite[]) || [])
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

  const toggleTask = async (task: SiteTaskRow) => {
    const next = !task.is_done
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_done: next } : t)))
    const { error } = await supabase.from('site_tasks').update({ is_done: next }).eq('id', task.id)
    if (error) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_done: task.is_done } : t)))
    }
  }

  const addTask = async (taskName: string, siteId: string | null) => {
    const { data, error } = await supabase
      .from('site_tasks')
      .insert({ task_name: taskName, site_id: siteId, is_done: false })
      .select('id, site_id, task_name, is_done, created_at')
      .single()
    if (!error && data) setTasks((prev) => [...prev, data as SiteTaskRow])
  }

  const hideSite = async (site: BoardSite) => {
    if (!confirm(`「${shortSiteName(site.name)}」을 이 보드에서 넘길까요?`)) return
    setSites((prev) => prev.filter((s) => s.id !== site.id))
    const { error } = await supabase
      .from('sites')
      .update({ hidden_from_my_sites: true })
      .eq('id', site.id)
    if (error) {
      setSites((prev) => [...prev, site])
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
    return <div className="text-[13px] text-txt-tertiary">staff 못 읽음</div>
  }
  if (gate === 'no-access') {
    return <div className="text-[13px] text-txt-tertiary">권한 없음</div>
  }

  const settledLabel =
    settledCount == null ? null : settledCount > 0 ? `정산완료 ${settledCount}곳` : '정산완료 0곳'

  return (
    <div className="mx-auto pb-16 max-w-[640px] md:max-w-[1100px]">
      <header>
        <p className="text-[13px] text-txt-tertiary">{dateHeading}</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <h1 className="text-[22px] font-semibold text-txt-primary md:hidden">안 한 일</h1>
          <h1 className="hidden text-[22px] font-semibold text-txt-primary md:block">내 현장</h1>
          <p className="text-[40px] font-semibold leading-none tabular-nums text-accent md:hidden">
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
              onToggle={toggleTask}
              onAdd={(name) => addTask(name, null)}
            />
            {withOpen.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                tasks={tasks.filter((t) => t.site_id === site.id)}
                todayYmd={todayYmd}
                addRef={(el) => {
                  addRefs.current[site.id] = el
                }}
                autoFocusAdd={draftSiteId === site.id}
                onToggle={toggleTask}
                onAdd={(name) => addTask(name, site.id)}
                onHide={() => hideSite(site)}
              />
            ))}
          </>
        )}
      </div>

      {!loading && withoutOpen.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[16px] font-semibold text-txt-primary">
            할 일 없는 현장{' '}
            <span className="tabular-nums">{withoutOpen.length}</span>개
          </h2>
          <ul className="mt-2 divide-y divide-border-tertiary">
            {withoutOpen.map((site) => {
              const drafting = draftSiteId === site.id
              return (
                <li key={site.id} className="py-2">
                  <div className="flex items-center gap-3 min-h-[44px]">
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
                      className="shrink-0 min-h-[44px] px-2 text-[13px] text-accent"
                    >
                      적기
                    </button>
                  </div>
                  {drafting && (
                    <AddLine
                      autoFocus
                      inputRef={(el) => {
                        addRefs.current[site.id] = el
                      }}
                      onAdd={async (name) => {
                        await addTask(name, site.id)
                        setDraftSiteId(null)
                      }}
                    />
                  )}
                </li>
              )
            })}
          </ul>
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
  onToggle,
  onAdd,
}: {
  tasks: SiteTaskRow[]
  onToggle: (task: SiteTaskRow) => void
  onAdd: (name: string) => Promise<void>
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
          <span className="shrink-0 text-[16px] font-semibold tabular-nums text-accent">
            {open}
          </span>
        )}
      </div>
      <div className="mt-3 md:mt-0">
        <TaskList tasks={tasks} onToggle={onToggle} onAdd={onAdd} />
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
  onToggle,
  onAdd,
  onHide,
}: {
  site: BoardSite
  tasks: SiteTaskRow[]
  todayYmd: string
  addRef?: Ref<HTMLInputElement>
  autoFocusAdd?: boolean
  onToggle: (task: SiteTaskRow) => void
  onAdd: (name: string) => Promise<void>
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
            <span className="shrink-0 text-[16px] font-semibold tabular-nums text-accent">
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
          onToggle={onToggle}
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

async function ensureWeeklyTasks() {
  const { data } = await supabase.from('site_tasks').select('task_name').is('site_id', null)

  const have = new Set((data ?? []).map((r) => r.task_name))
  const missing = WEEKLY_UNASSIGNED_TASKS.filter((name) => !have.has(name))
  if (missing.length === 0) return

  await supabase.from('site_tasks').insert(
    missing.map((task_name) => ({
      task_name,
      site_id: null,
      is_done: false,
    })),
  )
}
