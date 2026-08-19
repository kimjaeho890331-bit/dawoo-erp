'use client'

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatPhone } from '@/lib/utils/format'
import { shortDateTime } from '@/lib/approval/statusStyle'
import {
  canCancelRequest,
  displayAddress,
  isUuid,
  sanitizeSearchQuery,
  snapshotAddress,
} from '@/lib/buildingLedger/status'

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

interface RequestRow {
  id: string
  project_id: string
  status: 'requested' | 'issued' | 'confirmed'
  address_used: string | null
  drive_file_url: string | null
  requested_at: string | null
  issued_at: string | null
  confirmed_at: string | null
  projects: ProjectHit | ProjectHit[] | null
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'requested', label: '신청' },
  { key: 'done', label: '완료' },
]

const PROJECT_SELECT =
  'id, building_name, owner_name, owner_phone, tenant_phone, road_address, jibun_address'

const REQUEST_SELECT = `
  id, project_id, status, address_used, drive_file_url,
  requested_at, issued_at, confirmed_at,
  projects:project_id ( ${PROJECT_SELECT} )
`

function projectOf(row: RequestRow): ProjectHit | null {
  if (!row.projects) return null
  return Array.isArray(row.projects) ? row.projects[0] ?? null : row.projects
}

function currentStaffId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('dawoo_current_staff_id')
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

export default function BuildingLedgerPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [hits, setHits] = useState<ProjectHit[]>([])
  const [searching, setSearching] = useState(false)
  const [tab, setTab] = useState<TabKey>('requested')
  const [requested, setRequested] = useState<RequestRow[]>([])
  const [done, setDone] = useState<RequestRow[]>([])
  const [loadingTab, setLoadingTab] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadLists = useCallback(async () => {
    setLoadingTab(true)
    const [reqRes, doneRes] = await Promise.all([
      supabase
        .from('building_ledger_requests')
        .select(REQUEST_SELECT)
        .eq('status', 'requested')
        .order('requested_at', { ascending: true }),
      supabase
        .from('building_ledger_requests')
        .select(REQUEST_SELECT)
        .in('status', ['issued', 'confirmed'])
        .order('issued_at', { ascending: false, nullsFirst: false }),
    ])
    if (reqRes.error || doneRes.error) {
      setError(reqRes.error?.message || doneRes.error?.message || '목록을 불러오지 못했습니다')
    } else {
      setRequested((reqRes.data ?? []) as unknown as RequestRow[])
      setDone((doneRes.data ?? []) as unknown as RequestRow[])
    }
    setLoadingTab(false)
  }, [])

  useEffect(() => { loadLists() }, [loadLists])

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
      const [projectsRes, openRes] = await Promise.all([
        supabase
          .from('projects')
          .select(PROJECT_SELECT)
          .or(`building_name.ilike.${pattern},owner_name.ilike.${pattern},owner_phone.ilike.${pattern},tenant_phone.ilike.${pattern}`)
          .order('building_name')
          .limit(40),
        supabase
          .from('building_ledger_requests')
          .select('project_id')
          .in('status', ['requested', 'issued']),
      ])
      if (cancelled) return
      if (projectsRes.error) {
        setError(projectsRes.error.message)
        setHits([])
        setSearching(false)
        return
      }
      const openIds = new Set((openRes.data ?? []).map(r => r.project_id as string))
      setHits(((projectsRes.data ?? []) as ProjectHit[]).filter(p => !openIds.has(p.id)))
      setSearching(false)
    }, 280)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQuery])

  const queueProject = async (project: ProjectHit) => {
    setBusyId(project.id)
    setError(null)
    const staffId = currentStaffId()
    const { error: insertError } = await supabase.from('building_ledger_requests').insert({
      project_id: project.id,
      address_used: snapshotAddress(project),
      requested_by: staffId && isUuid(staffId) ? staffId : null,
    })
    setBusyId(null)
    if (insertError) {
      if (insertError.code === '23505') {
        setError('이미 신청된 빌라입니다')
      } else {
        setError(insertError.message)
      }
      await loadLists()
      return
    }
    setHits(prev => prev.filter(p => p.id !== project.id))
    await loadLists()
    setTab('requested')
  }

  const cancelRequest = async (row: RequestRow) => {
    if (!canCancelRequest(row.status)) return
    setBusyId(row.id)
    setError(null)
    const { error: delError } = await supabase
      .from('building_ledger_requests')
      .delete()
      .eq('id', row.id)
      .eq('status', 'requested')
    setBusyId(null)
    if (delError) {
      setError(delError.message)
      return
    }
    await loadLists()
  }

  const confirmIssued = async (row: RequestRow) => {
    setBusyId(row.id)
    setError(null)
    const staffId = currentStaffId()
    const res = await fetch('/api/building-ledger/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: row.id,
        staff_id: staffId && isUuid(staffId) ? staffId : undefined,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setBusyId(null)
    if (!res.ok) {
      setError(typeof json.error === 'string' ? json.error : '확인에 실패했습니다')
      return
    }
    await loadLists()
  }

  const tabRows = tab === 'requested' ? requested : done
  const emptySearch = !sanitizeSearchQuery(searchQuery)

  return (
    <div className="max-w-full bg-page min-h-screen">
      <div className="flex flex-col gap-3 mb-5 md:flex-row md:items-center md:justify-between">
        <h1 className="text-[18px] md:text-[22px] font-semibold tracking-[-0.4px] text-txt-primary whitespace-nowrap">
          건축물대장 발급
        </h1>
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="빌라명, 고객명, 연락처 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-4 input-field"
            aria-label="빌라 검색"
          />
        </div>
      </div>

      {emptySearch && (
        <p className="mb-5 text-[13px] text-txt-tertiary">
          빌라명, 고객명, 연락처로 검색한 뒤 신청하세요. 주소가 없는 접수도 넣을 수 있습니다.
        </p>
      )}

      {!emptySearch && (
        <section className="mb-6">
          <h2 className="mb-3 text-[16px] font-semibold text-txt-primary">검색 결과</h2>
          <div className="flex flex-col gap-3 md:hidden">
            {searching && <div className="py-8 text-center text-[13px] text-txt-tertiary">검색 중...</div>}
            {!searching && hits.length === 0 && (
              <div className="py-8 text-center text-[13px] text-txt-tertiary">검색 결과가 없습니다</div>
            )}
            {hits.map(p => {
              const addr = addressOf(p)
              return (
                <div key={p.id} className="rounded-[10px] border border-border-primary bg-surface px-5 py-4">
                  <div className="mb-1 text-[14px] font-semibold text-txt-primary">{p.building_name || '-'}</div>
                  <div className="text-[13px] text-txt-secondary">{p.owner_name || '-'}</div>
                  <div className="text-[13px] text-txt-secondary">{phoneOf(p)}</div>
                  <div className={`mt-1 text-[13px] ${addr.missing ? 'font-medium text-danger' : 'text-txt-secondary'}`}>
                    {addr.text}
                  </div>
                  <button
                    type="button"
                    onClick={() => queueProject(p)}
                    disabled={busyId === p.id}
                    className="btn-primary mt-3 w-full min-h-11 md:min-h-9 disabled:opacity-40"
                  >
                    신청
                  </button>
                </div>
              )
            })}
          </div>

          <div className="hidden overflow-hidden rounded-[10px] border border-border-primary bg-surface md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-surface-secondary">
                  <th className="px-4 text-left font-medium text-txt-tertiary h-[44px]">빌라명</th>
                  <th className="px-4 text-left font-medium text-txt-tertiary h-[44px]">고객명</th>
                  <th className="px-4 text-left font-medium text-txt-tertiary h-[44px]">연락처</th>
                  <th className="px-4 text-left font-medium text-txt-tertiary h-[44px]">주소</th>
                  <th className="w-24 px-4 text-left font-medium text-txt-tertiary h-[44px]" />
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
                    <tr key={p.id} className="border-t border-border-primary h-[44px]">
                      <td className="px-4 text-txt-primary">{p.building_name || '-'}</td>
                      <td className="px-4 text-txt-secondary">{p.owner_name || '-'}</td>
                      <td className="px-4 text-txt-secondary">{phoneOf(p)}</td>
                      <td className={`px-4 ${addr.missing ? 'font-medium text-danger' : 'text-txt-secondary'}`}>
                        {addr.text}
                      </td>
                      <td className="px-4">
                        <button
                          type="button"
                          onClick={() => queueProject(p)}
                          disabled={busyId === p.id}
                          className="btn-primary px-3 min-h-9 disabled:opacity-40"
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
        </section>
      )}

      <div className="tabs-container">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`tab-item ${tab === t.key ? 'tab-active' : ''}`}
          >
            {t.label}
            <span className={`ml-1.5 rounded-full px-[10px] py-[2px] text-[11px] font-medium ${
              tab === t.key ? 'bg-accent-light text-accent-text' : 'bg-surface text-txt-tertiary'
            }`}>
              {t.key === 'requested' ? requested.length : done.length}
            </span>
          </button>
        ))}
      </div>

      {error && <div className="mb-4 text-[13px] text-danger">{error}</div>}

      <div className="flex flex-col gap-3 md:hidden">
        {loadingTab && <div className="py-10 text-center text-[13px] text-txt-tertiary">불러오는 중...</div>}
        {!loadingTab && tabRows.length === 0 && (
          <div className="py-10 text-center text-[13px] text-txt-tertiary">
            {tab === 'requested' ? '신청된 건이 없습니다' : '완료된 건이 없습니다'}
          </div>
        )}
        {tabRows.map(row => {
          const p = projectOf(row)
          const addr = addressOf(p, row.address_used)
          return (
            <div key={row.id} className="rounded-[10px] border border-border-primary bg-surface px-5 py-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <span className="text-[14px] font-semibold text-txt-primary">{p?.building_name || '-'}</span>
                <StatusBadge status={row.status} />
              </div>
              <div className="text-[13px] text-txt-secondary">{p?.owner_name || '-'}</div>
              <div className="text-[13px] text-txt-secondary">{phoneOf(p)}</div>
              <div className={`mt-1 text-[13px] ${addr.missing ? 'font-medium text-danger' : 'text-txt-secondary'}`}>
                {addr.text}
              </div>
              <div className="mt-1 text-[12px] text-txt-tertiary">
                {tab === 'requested' ? shortDateTime(row.requested_at) : shortDateTime(row.issued_at || row.requested_at)}
              </div>
              <RowActions
                row={row}
                busy={busyId === row.id}
                onCancel={() => cancelRequest(row)}
                onConfirm={() => confirmIssued(row)}
                fullWidth
              />
            </div>
          )
        })}
      </div>

      <div className="hidden overflow-hidden rounded-[10px] border border-border-primary bg-surface md:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-surface-secondary">
              <th className="px-4 text-left font-medium text-txt-tertiary h-[44px]">빌라명</th>
              <th className="px-4 text-left font-medium text-txt-tertiary h-[44px]">고객</th>
              <th className="px-4 text-left font-medium text-txt-tertiary h-[44px]">연락처</th>
              <th className="px-4 text-left font-medium text-txt-tertiary h-[44px]">주소</th>
              <th className="w-[140px] px-4 text-left font-medium text-txt-tertiary h-[44px]">
                {tab === 'requested' ? '신청시각' : '상태'}
              </th>
              <th className="w-[160px] px-4 text-left font-medium text-txt-tertiary h-[44px]" />
            </tr>
          </thead>
          <tbody>
            {loadingTab && (
              <tr><td colSpan={6} className="px-4 py-16 text-center text-txt-tertiary">불러오는 중...</td></tr>
            )}
            {!loadingTab && tabRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-txt-tertiary">
                  {tab === 'requested' ? '신청된 건이 없습니다' : '완료된 건이 없습니다'}
                </td>
              </tr>
            )}
            {tabRows.map(row => {
              const p = projectOf(row)
              const addr = addressOf(p, row.address_used)
              return (
                <tr key={row.id} className="border-t border-border-primary h-[44px]">
                  <td className="px-4 text-txt-primary">{p?.building_name || '-'}</td>
                  <td className="px-4 text-txt-secondary">{p?.owner_name || '-'}</td>
                  <td className="px-4 text-txt-secondary">{phoneOf(p)}</td>
                  <td className={`px-4 ${addr.missing ? 'font-medium text-danger' : 'text-txt-secondary'}`}>
                    {addr.text}
                  </td>
                  <td className="px-4">
                    {tab === 'requested' ? (
                      <span className="text-txt-tertiary">{shortDateTime(row.requested_at)}</span>
                    ) : (
                      <StatusBadge status={row.status} />
                    )}
                  </td>
                  <td className="px-4">
                    <RowActions
                      row={row}
                      busy={busyId === row.id}
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

function StatusBadge({ status }: { status: RequestRow['status'] }) {
  if (status === 'requested') {
    return (
      <span className="badge bg-status-docs-bg text-status-docs-text rounded-full">신청</span>
    )
  }
  if (status === 'issued') {
    return (
      <span className="badge bg-status-approved-bg text-status-approved-text rounded-full">발급됨</span>
    )
  }
  return (
    <span className="badge bg-status-approved-bg text-status-approved-text rounded-full">확인됨</span>
  )
}

function RowActions({
  row,
  busy,
  onCancel,
  onConfirm,
  fullWidth,
}: {
  row: RequestRow
  busy: boolean
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
        className={`btn-secondary mt-3 md:mt-0 ${fullWidth ? 'w-full min-h-11' : 'min-h-9 px-3'} disabled:opacity-40`}
      >
        빼기
      </button>
    )
  }

  if (row.status === 'issued') {
    return (
      <div className={`mt-3 flex items-center gap-2 md:mt-0 ${fullWidth ? 'w-full' : ''}`}>
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
          disabled={busy}
          className={`btn-primary px-3 disabled:opacity-40 ${fullWidth ? 'min-h-11 flex-1' : 'min-h-9'}`}
        >
          확인
        </button>
      </div>
    )
  }

  if (!row.drive_file_url) return null
  return (
    <a
      href={row.drive_file_url}
      target="_blank"
      rel="noreferrer"
      className="mt-3 inline-flex h-9 items-center gap-1 rounded-lg border border-border-primary px-3 text-[13px] text-txt-secondary hover:bg-surface-secondary md:mt-0"
    >
      <ExternalLink size={14} className="text-txt-tertiary" />
      파일
    </a>
  )
}
