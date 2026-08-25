'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase/client'
import { canSeeMySites, WEEKLY_UNASSIGNED_TASKS } from '@/lib/mySitesAccess'
import {
  isInConstruction,
  isNearCompletion,
  openTaskCount,
  sortBoardTasks,
  type SiteTaskRow,
} from '@/lib/mySitesTasks'
import { shortSiteName } from '@/lib/shortSiteName'

const STAFF_KEY = 'dawoo_current_staff_id'

type BoardSite = {
  id: string
  name: string
  status: string
  hidden_from_my_sites: boolean
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
      className={`w-full min-h-[52px] flex items-center gap-3 px-1 py-2 text-left rounded-lg ${
        task.is_done ? 'opacity-40' : ''
      }`}
    >
      <span
        className={`shrink-0 w-7 h-7 rounded-full border flex items-center justify-center ${
          task.is_done
            ? 'border-accent bg-accent'
            : 'border-border-secondary bg-surface'
        }`}
      >
        {task.is_done && (
          <span className="block w-2.5 h-1.5 border-b-2 border-l-2 border-white -mt-0.5 rotate-[-45deg]" />
        )}
      </span>
      <span
        className={`text-[16px] leading-snug text-txt-primary ${
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
}: {
  onAdd: (name: string) => Promise<void>
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
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void submit()
        }
      }}
      placeholder="할 일 적기"
      disabled={saving}
      className="w-full h-[52px] px-1 bg-transparent text-[16px] text-txt-primary placeholder:text-txt-quaternary border-0 border-b border-border-tertiary rounded-none outline-none focus:border-accent"
    />
  )
}

function TaskList({
  tasks,
  onToggle,
  onAdd,
}: {
  tasks: SiteTaskRow[]
  onToggle: (task: SiteTaskRow) => void
  onAdd: (name: string) => Promise<void>
}) {
  const ordered = sortBoardTasks(tasks)
  return (
    <div>
      {ordered.map((task) => (
        <TaskLine key={task.id} task={task} onToggle={onToggle} />
      ))}
      <AddLine onAdd={onAdd} />
    </div>
  )
}

export default function MySitesPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [sites, setSites] = useState<BoardSite[]>([])
  const [tasks, setTasks] = useState<SiteTaskRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const supabase = createSupabaseBrowser()
    ;(async () => {
      const id = localStorage.getItem(STAFF_KEY)
      const [{ data: me }, twins] = id
        ? await Promise.all([
            supabase.from('staff').select('id, name, role, email').eq('id', id).maybeSingle(),
            supabase.from('staff').select('id, name, role').eq('name', '김재호'),
          ])
        : await Promise.resolve([{ data: null }, { data: [] as { id: string; name: string; role: string }[] }])
      const ok = canSeeMySites(me, twins.data)
      if (cancelled) return
      setAllowed(ok)
      if (!ok) {
        router.replace('/dashboard')
        return
      }

      await ensureWeeklyTasks(supabase)
      const [siteRes, taskRes] = await Promise.all([
        supabase
          .from('sites')
          .select('id, name, status, hidden_from_my_sites')
          .neq('status', '정산완료')
          .eq('hidden_from_my_sites', false)
          .order('name'),
        supabase
          .from('site_tasks')
          .select('id, site_id, task_name, is_done, created_at')
          .order('created_at'),
      ])
      if (cancelled) return
      if (!siteRes.error) setSites((siteRes.data as BoardSite[]) || [])
      if (!taskRes.error) setTasks((taskRes.data as SiteTaskRow[]) || [])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  const weekly = useMemo(
    () => tasks.filter((t) => t.site_id === null),
    [tasks],
  )

  const nearDone = useMemo(
    () => sites.filter((s) => isNearCompletion(s.status)),
    [sites],
  )
  const building = useMemo(
    () => sites.filter((s) => isInConstruction(s.status)),
    [sites],
  )

  const tasksBySite = useCallback(
    (siteId: string) => tasks.filter((t) => t.site_id === siteId),
    [tasks],
  )

  const toggleTask = async (task: SiteTaskRow) => {
    const next = !task.is_done
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_done: next } : t)))
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('site_tasks').update({ is_done: next }).eq('id', task.id)
    if (error) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_done: task.is_done } : t)))
    }
  }

  const addTask = async (taskName: string, siteId: string | null) => {
    const supabase = createSupabaseBrowser()
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
    const supabase = createSupabaseBrowser()
    const { error } = await supabase
      .from('sites')
      .update({ hidden_from_my_sites: true })
      .eq('id', site.id)
    if (error) {
      setSites((prev) => [...prev, site])
    }
  }

  if (allowed !== true) {
    return <div className="text-[13px] text-txt-tertiary">확인 중...</div>
  }

  return (
    <div className="max-w-[640px] mx-auto pb-16">
      <h1 className="text-[22px] font-semibold text-txt-primary">내 현장</h1>

      <section className="mt-8">
        <h2 className="text-[22px] font-semibold text-txt-primary">이번 주</h2>
        <div className="mt-3 bg-surface border border-border-primary rounded-[10px] px-5 py-4">
          {loading ? (
            <p className="text-[13px] text-txt-quaternary py-6">불러오는 중...</p>
          ) : (
            <TaskList
              tasks={weekly}
              onToggle={toggleTask}
              onAdd={(name) => addTask(name, null)}
            />
          )}
        </div>
      </section>

      <SiteGroup
        title="준공 앞"
        sites={nearDone}
        tasksBySite={tasksBySite}
        onToggle={toggleTask}
        onAdd={addTask}
        onHide={hideSite}
      />
      <SiteGroup
        title="공사 중"
        sites={building}
        tasksBySite={tasksBySite}
        onToggle={toggleTask}
        onAdd={addTask}
        onHide={hideSite}
      />
    </div>
  )
}

function SiteGroup({
  title,
  sites,
  tasksBySite,
  onToggle,
  onAdd,
  onHide,
}: {
  title: string
  sites: BoardSite[]
  tasksBySite: (siteId: string) => SiteTaskRow[]
  onToggle: (task: SiteTaskRow) => void
  onAdd: (name: string, siteId: string | null) => Promise<void>
  onHide: (site: BoardSite) => void
}) {
  return (
    <section className="mt-10">
      <h2 className="text-[16px] font-semibold text-txt-primary">{title}</h2>
      {sites.length === 0 ? (
        <p className="mt-3 text-[13px] text-txt-quaternary">해당 현장 없음</p>
      ) : (
        <div className="mt-3 space-y-3">
          {sites.map((site) => {
            const siteTasks = tasksBySite(site.id)
            const open = openTaskCount(siteTasks)
            return (
              <article
                key={site.id}
                className="bg-surface border border-border-primary rounded-[10px] px-5 py-4"
              >
                <div className="flex items-start justify-between gap-3 min-h-[44px]">
                  <h3 className="text-[18px] font-semibold text-txt-primary leading-snug">
                    {shortSiteName(site.name) || site.name}
                  </h3>
                  {open > 0 && (
                    <span className="shrink-0 text-[16px] font-semibold tabular-nums text-accent">
                      {open}
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <TaskList
                    tasks={siteTasks}
                    onToggle={onToggle}
                    onAdd={(name) => onAdd(name, site.id)}
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onHide(site)}
                    className="min-h-[44px] px-2 text-[13px] text-txt-tertiary"
                  >
                    넘기기
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

async function ensureWeeklyTasks(
  supabase: ReturnType<typeof createSupabaseBrowser>,
) {
  const { data } = await supabase
    .from('site_tasks')
    .select('task_name')
    .is('site_id', null)

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
