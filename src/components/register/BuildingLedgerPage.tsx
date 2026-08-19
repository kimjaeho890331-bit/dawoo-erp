'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatPhone } from '@/lib/utils/format'
import { shortDateTime } from '@/lib/approval/statusStyle'
import ActorPicker, { useActor } from '@/components/approval/ActorPicker'
import { displayAddress, sanitizeSearchQuery, snapshotAddress } from '@/lib/buildingLedger/status'

type TabKey = 'requested' | 'done'

interface ProjectHit {
  id: string
  building_name: string | null
  owner_name: string | null
  owner_phone: string | null
  tenant_phone: string | null
  road_address: string | null
  jibun_address: string | null
}

interface StaffRef {
  id: string
  name: string
}

interface RequestRow {
  id: string
  project_id: string
  status: 'requested' | 'issued' | 'confirmed'
  address_used: string | null
  drive_file_url: string | null
  requested_at: string | null
  issued_at: string | null
  confirmed_at: string | null
  requested_by: string | null
  confirmed_by: string | null
  projects: ProjectHit | ProjectHit[] | null
}

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: 'requested', label: '신청', hint: '세움터가 가져갈 대기열' },
  { key: 'done', label: '완료', hint: '발급된 건을 확인하면 이 목록에서 사라집니다' },
]

const PROJECT_SELECT =
  'id, building_name, owner_name, owner_phone, tenant_phone, road_address, jibun_address'

const REQUEST_SELECT = `
  id, project_id, status, address_used, drive_file_url,
  requested_at, issued_at, confirmed_at, requested_by, confirmed_by,
  projects:project_id ( ${PROJECT_SELECT} )
`

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function phoneOf(p: Pick<ProjectHit, 'owner_phone' | 'tenant_phone'> | null): string {
  const raw = p?.owner_phone || p?.tenant_phone || ''
  return raw ? formatPhone(raw) : '-'
}

function addressOf(p: Pick<ProjectHit, 'road_address' | 'jibun_address'> | null, fallback?: string | null) {
  if (p) return displayAddress(p.road_address, p.jibun_address)
  if (fallback?.trim()) return { text: fallback.trim(), missing: false }
  return { text: '주소 없음', missing: true }
}

function staffName(id: string | null | undefined, staffList: StaffRef[]): string {
  if (!id) return '-'
  return staffList.find(s => s.id === id)?.name || '-'
}

export default function BuildingLedgerPage() {
  const { actor, actorId, setActorId, staffList, loading: actorLoading } = useActor()
  const [searchQuery, setSearchQuery] = useState('')
  const [hits, setHits] = useState<ProjectHit[]>([])
  const [searching, setSearching] = useState(false)
  const [tab, setTab] = useState<TabKey>('requested')
  const [requested, setRequested] = useState<RequestRow[]>([])
  const [issued, setIssued] = useState<RequestRow[]>([])
  const [loadingTab, setLoadingTab] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openProjectIds = useMemo(() => {
    const ids = new Set<string>()
    for (const row of requested) ids.add(row.project_id)
    for (const row of issued) ids.add(row.project_id)
    return ids
  }, [requested, issued])

  const loadLists = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoadingTab(true)
    const { data, error: loadError } = await supabase
      .from('building_ledger_requests')
      .select(REQUEST_SELECT)
      .in('status', ['requested', 'issued'])
      .order('requested_at', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      setLoadingTab(false)
      return
    }

    const nextRequested: RequestRow[] = []
    const nextIssued: RequestRow[] = []
    for (const row of (data ?? []) as unknown as RequestRow[]) {
      if (row.status === 'requested') nextRequested.push(row)
      else if (row.status === 'issued') nextIssued.push(row)
    }
    nextIssued.sort((a, b) => (b.issued_at || '').localeCompare(a.issued_at || ''))
    setRequested(nextRequested)
    setIssued(nextIssued)
    setLoadingTab(false)
  }, [])

  useEffect(() => { loadLists(true) }, [loadLists])

  useEffect(() => {
    const q = sanitizeSearchQuery(searchQuery)
    if (!q) {
      setHits([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(async () => {
      const pattern = `%${q}%`
      const { data, error: searchError } = await supabase
        .from('projects')
        .select(PROJECT_SELECT)
        .or(`building_name.ilike.${pattern},owner_name.ilike.${pattern},owner_phone.ilike.${pattern},tenant_phone.ilike.${pattern}`)
        .order('building_name')
        .limit(40)
      if (cancelled) return
      if (searchError) {
        setError(searchError.message)
        setHits([])
        setSearching(false)
        return
      }
      setHits(((data ?? []) as ProjectHit[]).filter(p => !openProjectIds.has(p.id)))
      setSearching(false)
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQuery, openProjectIds])

  const postJson = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(typeof json.error === 'string' ? json.error : '처리에 실패했습니다')
    }
    return json as Record<string, unknown>
  }

  const queueProject = async (project: ProjectHit) => {
    if (!actorId) {
      setError('직원을 선택해야 누가 신청했는지 남길 수 있습니다')
      return
    }
    const tempId = `temp-${project.id}`
    const optimistic: RequestRow = {
      id: tempId,
      project_id: project.id,
      status: 'requested',
      address_used: snapshotAddress(project),
      drive_file_url: null,
      requested_at: new Date().toISOString(),
      issued_at: null,
      confirmed_at: null,
      requested_by: actorId,
      confirmed_by: null,
      projects: project,
    }
    setError(null)
    setHits(prev => prev.filter(p => p.id !== project.id))
    setRequested(prev => [optimistic, ...prev.filter(r => r.project_id !== project.id)])
    setTab('requested')
    setBusyId(project.id)

    try {
      const json = await postJson('/api/building-ledger/request', {
        project_id: project.id,
        staff_id: actorId,
      })
      const item = json.item as RequestRow | undefined
      if (item) {
        setRequested(prev => prev.map(r => (r.id === tempId ? { ...item, projects: project } : r)))
      }
    } catch (e) {
      setRequested(prev => prev.filter(r => r.id !== tempId))
      setHits(prev => [project, ...prev.filter(p => p.id !== project.id)])
      setError(e instanceof Error ? e.message : '신청에 실패했습니다')
    } finally {
      setBusyId(null)
    }
  }

  const cancelRequest = async (row: RequestRow) => {
    const snapshot = row
    setError(null)
    setRequested(prev => prev.filter(r => r.id !== row.id))
    setBusyId(row.id)
    try {
      await postJson('/api/building-ledger/cancel', { id: row.id })
    } catch (e) {
      setRequested(prev => [snapshot, ...prev])
      setError(e instanceof Error ? e.message : '빼기에 실패했습니다')
    } finally {
      setBusyId(null)
    }
  }

  const confirmIssued = async (row: RequestRow) => {
    if (!actorId) {
      setError('직원을 선택해야 누가 확인했는지 남길 수 있습니다')
      return
    }
    const snapshot = row
    setError(null)
    setIssued(prev => prev.filter(r => r.id !== row.id))
    setBusyId(row.id)
    try {
      await postJson('/api/building-ledger/confirm', { id: row.id, staff_id: actorId })
    } catch (e) {
      setIssued(prev => [snapshot, ...prev])
      setError(e instanceof Error ? e.message : '확인에 실패했습니다')
    } finally {
      setBusyId(null)
    }
  }

  const tabRows = tab === 'requested' ? requested : issued
  const currentTab = TABS.find(t => t.key === tab)
  const q = sanitizeSearchQuery(searchQuery)
  const counts = { requested: requested.length, done: issued.length }

  return (
    <div className="max-w-full bg-page min-h-screen">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-[18px] md:text-[22px] font-semibold tracking-[-0.4px] text-txt-primary whitespace-nowrap">
          건축물대장 발급
        </h1>
        <ActorPicker
          actorId={actorId}
          staffList={staffList}
          onChange={setActorId}
          loading={actorLoading}
          fullWidth
        />
      </div>

      <section className="mb-6 overflow-hidden rounded-[10px] border border-border-primary bg-surface">
        <div className="border-b border-border-primary px-5 py-4">
          <h2 className="text-[14px] font-semibold text-txt-primary">접수대장에서 찾아 신청</h2>
          <p className="mt-1 text-[13px] text-txt-tertiary">
            빌라명, 고객명, 연락처로 찾습니다. 이미 신청·완료 대기 중인 빌라는 나오지 않습니다.
          </p>
          <div className="relative mt-3">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary" />
            <input
              type="text"
              placeholder="예: 행복빌라, 홍길동, 010-1234-5678"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input-field w-full"
              style={{ paddingLeft: 40 }}
              aria-label="접수대장 검색"
            />
          </div>
        </div>

        {!q ? (
          <div className="px-5 py-8 text-center text-[13px] text-txt-tertiary">
            검색하면 아래에 신청할 빌라가 나옵니다
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 px-4 py-4 md:hidden">
              {searching && <div className="py-6 text-center text-[13px] text-txt-tertiary">검색 중...</div>}
              {!searching && hits.length === 0 && (
                <div className="py-6 text-center text-[13px] text-txt-tertiary">검색 결과가 없습니다</div>
              )}
              {hits.map(p => (
                <SearchCard
                  key={p.id}
                  project={p}
                  busy={busyId === p.id}
                  canApply={Boolean(actor)}
                  onApply={() => queueProject(p)}
                />
              ))}
            </div>
            <div className="hidden md:block">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-surface-secondary">
                    <th className="h-[44px] px-4 text-left font-medium text-txt-tertiary">빌라명</th>
                    <th className="h-[44px] px-4 text-left font-medium text-txt-tertiary">고객명</th>
                    <th className="h-[44px] px-4 text-left font-medium text-txt-tertiary">연락처</th>
                    <th className="h-[44px] px-4 text-left font-medium text-txt-tertiary">주소</th>
                    <th className="h-[44px] w-24 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {searching && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-txt-tertiary">검색 중...</td></tr>
                  )}
                  {!searching && hits.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-txt-tertiary">검색 결과가 없습니다</td></tr>
                  )}
                  {hits.map(p => {
                    const addr = addressOf(p)
                    return (
                      <tr key={p.id} className="h-[44px] border-t border-border-primary">
                        <td className="px-4 text-txt-primary">{p.building_name || '-'}</td>
                        <td className="px-4 text-txt-secondary">{p.owner_name || '-'}</td>
                        <td className="px-4 text-txt-secondary">{phoneOf(p)}</td>
                        <td className={`px-4 ${addr.missing ? 'font-medium text-danger' : 'text-txt-secondary'}`}>{addr.text}</td>
                        <td className="px-4">
                          <button
                            type="button"
                            onClick={() => queueProject(p)}
                            disabled={busyId === p.id || !actor}
                            className="btn-primary min-h-9 px-3 disabled:opacity-40"
                          >
                            신청
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="tabs-container">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); loadLists(false) }}
            className={`tab-item ${tab === t.key ? 'tab-active' : ''}`}
          >
            {t.label}
            <span className={`ml-1.5 rounded-full px-[10px] py-[2px] text-[11px] font-medium ${
              tab === t.key ? 'bg-accent-light text-accent-text' : 'bg-surface text-txt-tertiary'
            }`}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>
      {currentTab && (
        <p className="mb-4 text-[13px] text-txt-secondary">{currentTab.hint}</p>
      )}

      {error && <div className="mb-4 text-[13px] text-danger">{error}</div>}

      <div className="flex flex-col gap-3 md:hidden">
        {loadingTab && <div className="py-10 text-center text-[13px] text-txt-tertiary">불러오는 중...</div>}
        {!loadingTab && tabRows.length === 0 && <EmptyTab tab={tab} />}
        {tabRows.map(row => (
          <QueueCard
            key={row.id}
            row={row}
            staffList={staffList}
            busy={busyId === row.id || row.id.startsWith('temp-')}
            canAct={Boolean(actor)}
            onCancel={() => cancelRequest(row)}
            onConfirm={() => confirmIssued(row)}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-[10px] border border-border-primary bg-surface md:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-surface-secondary">
              <th className="h-[44px] px-4 text-left font-medium text-txt-tertiary">빌라명</th>
              <th className="h-[44px] px-4 text-left font-medium text-txt-tertiary">고객</th>
              <th className="h-[44px] px-4 text-left font-medium text-txt-tertiary">연락처</th>
              <th className="h-[44px] px-4 text-left font-medium text-txt-tertiary">주소</th>
              <th className="h-[44px] w-[100px] px-4 text-left font-medium text-txt-tertiary">신청자</th>
              <th className="h-[44px] w-[120px] px-4 text-left font-medium text-txt-tertiary">시각</th>
              <th className="h-[44px] w-[160px] px-4" />
            </tr>
          </thead>
          <tbody>
            {loadingTab && (
              <tr><td colSpan={7} className="px-4 py-16 text-center text-txt-tertiary">불러오는 중...</td></tr>
            )}
            {!loadingTab && tabRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-txt-tertiary">
                  <EmptyTab tab={tab} />
                </td>
              </tr>
            )}
            {tabRows.map(row => {
              const p = one(row.projects)
              const addr = addressOf(p, row.address_used)
              return (
                <tr key={row.id} className="h-[44px] border-t border-border-primary">
                  <td className="px-4 text-txt-primary">{p?.building_name || '-'}</td>
                  <td className="px-4 text-txt-secondary">{p?.owner_name || '-'}</td>
                  <td className="px-4 text-txt-secondary">{phoneOf(p)}</td>
                  <td className={`px-4 ${addr.missing ? 'font-medium text-danger' : 'text-txt-secondary'}`}>{addr.text}</td>
                  <td className="px-4 text-txt-secondary">{staffName(row.requested_by, staffList)}</td>
                  <td className="px-4 text-txt-tertiary">
                    {tab === 'requested' ? shortDateTime(row.requested_at) : shortDateTime(row.issued_at)}
                  </td>
                  <td className="px-4">
                    <RowActions
                      row={row}
                      busy={busyId === row.id || row.id.startsWith('temp-')}
                      canAct={Boolean(actor)}
                      onCancel={() => cancelRequest(row)}
                      onConfirm={() => confirmIssued(row)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EmptyTab({ tab }: { tab: TabKey }) {
  if (tab === 'requested') return <span>신청된 건이 없습니다. 위에서 찾아 신청하세요.</span>
  return <span>확인할 완료 건이 없습니다.</span>
}

function SearchCard({
  project, busy, canApply, onApply,
}: {
  project: ProjectHit
  busy: boolean
  canApply: boolean
  onApply: () => void
}) {
  const addr = addressOf(project)
  return (
    <div className="rounded-[10px] border border-border-primary bg-surface px-5 py-4">
      <div className="text-[14px] font-semibold text-txt-primary">{project.building_name || '-'}</div>
      <div className="mt-1 text-[13px] text-txt-secondary">{project.owner_name || '-'}</div>
      <div className="text-[13px] text-txt-secondary">{phoneOf(project)}</div>
      <div className={`mt-1 text-[13px] ${addr.missing ? 'font-medium text-danger' : 'text-txt-secondary'}`}>{addr.text}</div>
      <button
        type="button"
        onClick={onApply}
        disabled={busy || !canApply}
        className="btn-primary mt-3 min-h-11 w-full disabled:opacity-40"
      >
        신청
      </button>
    </div>
  )
}

function QueueCard({
  row, staffList, busy, canAct, onCancel, onConfirm,
}: {
  row: RequestRow
  staffList: StaffRef[]
  busy: boolean
  canAct: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const p = one(row.projects)
  const addr = addressOf(p, row.address_used)
  return (
    <div className="rounded-[10px] border border-border-primary bg-surface px-5 py-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <span className="text-[14px] font-semibold text-txt-primary">{p?.building_name || '-'}</span>
        <StatusBadge status={row.status} />
      </div>
      <div className="text-[13px] text-txt-secondary">{p?.owner_name || '-'}</div>
      <div className="text-[13px] text-txt-secondary">{phoneOf(p)}</div>
      <div className={`mt-1 text-[13px] ${addr.missing ? 'font-medium text-danger' : 'text-txt-secondary'}`}>{addr.text}</div>
      <div className="mt-2 text-[12px] text-txt-tertiary">
        신청 {staffName(row.requested_by, staffList)} · {shortDateTime(row.requested_at)}
      </div>
      <RowActions row={row} busy={busy} canAct={canAct} onCancel={onCancel} onConfirm={onConfirm} fullWidth />
    </div>
  )
}

function StatusBadge({ status }: { status: RequestRow['status'] }) {
  if (status === 'issued') {
    return <span className="badge rounded-full bg-status-approved-bg text-status-approved-text">완료 대기</span>
  }
  return <span className="badge rounded-full bg-status-docs-bg text-status-docs-text">신청</span>
}

function RowActions({
  row, busy, canAct, onCancel, onConfirm, fullWidth,
}: {
  row: RequestRow
  busy: boolean
  canAct: boolean
  onCancel: () => void
  onConfirm: () => void
  fullWidth?: boolean
}) {
  if (row.status === 'requested') {
    return (
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className={`btn-secondary ${fullWidth ? 'mt-3 min-h-11 w-full' : 'min-h-9 px-3'} disabled:opacity-40`}
      >
        빼기
      </button>
    )
  }

  return (
    <div className={`flex items-center gap-2 ${fullWidth ? 'mt-3 w-full' : ''}`}>
      {row.drive_file_url && (
        <a
          href={row.drive_file_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 min-h-9 items-center gap-1 rounded-lg border border-border-primary px-3 text-[13px] text-txt-secondary hover:bg-surface-secondary"
        >
          <ExternalLink size={14} className="text-txt-tertiary" />
          파일
        </a>
      )}
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || !canAct}
        className={`btn-primary px-3 disabled:opacity-40 ${fullWidth ? 'min-h-11 flex-1' : 'min-h-9'}`}
      >
        확인
      </button>
    </div>
  )
}
