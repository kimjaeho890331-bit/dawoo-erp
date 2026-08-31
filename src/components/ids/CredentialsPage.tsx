'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Clock, ExternalLink, Plus, Search, X } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { CredentialKind } from '@/types'
import type { CredentialListItem } from '@/lib/credentials/fields'
import {
  collapseDisplayWhitespace,
  displayCredentialUrl,
  filterCredentials,
  hrefForCredentialUrl,
  usesMonoIdFont,
} from '@/lib/credentials/display'
import {
  canPrefetchCredentialList,
  resolvePageStaff,
  resolveVisibleGate,
  shouldRevokePageOnListStatus,
  shouldSkipStaffRoundTrip,
  type CredentialPageGate,
} from '@/lib/credentials/pageGate'

const REVEAL_MS = 8000
const STAFF_KEY = 'dawoo_current_staff_id'
const SKELETON_ROWS = 7

function credFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (typeof window !== 'undefined') {
    const actorStaffId = localStorage.getItem(STAFF_KEY)
    if (actorStaffId) headers.set('x-actor-staff-id', actorStaffId)
  }
  return fetch(input, { credentials: 'include', ...init, headers })
}

type FormState = {
  name: string
  url: string
  login_id: string
  password: string
  memo: string
}

const EMPTY_FORM: FormState = {
  name: '',
  url: '',
  login_id: '',
  password: '',
  memo: '',
}

function apiBase(kind: CredentialKind) {
  return kind === 'private' ? '/api/ids-private' : '/api/ids'
}

function actorStaffIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(STAFF_KEY)
}

export default function CredentialsPage({
  kind,
  title,
}: {
  kind: CredentialKind
  title: string
}) {
  const { staff: authStaff, loading: authLoading } = useAuth()
  const [pickedStaff, setPickedStaff] = useState<{ id: string; role: string } | null>(null)
  const [pickLoading, setPickLoading] = useState(() => !shouldSkipStaffRoundTrip(authStaff))
  const staff = resolvePageStaff(pickedStaff, authStaff)
  const [latchedOk, setLatchedOk] = useState(
    () => resolveVisibleGate(kind, staff, { pickLoading: false, authLoading: false, latchedOk: false }) === 'ok',
  )
  const [forcedDenied, setForcedDenied] = useState(false)
  const gate: CredentialPageGate =
    forcedDenied && !latchedOk
      ? 'denied'
      : resolveVisibleGate(kind, staff, { pickLoading, authLoading, latchedOk })
  const gateRef = useRef<CredentialPageGate>(gate)
  gateRef.current = gate

  const [items, setItems] = useState<CredentialListItem[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [revealed, setRevealed] = useState<{ id: string; password: string } | null>(null)
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (gate === 'ok') setLatchedOk(true)
  }, [gate])

  const clearReveal = useCallback(() => {
    if (revealTimer.current) {
      clearTimeout(revealTimer.current)
      revealTimer.current = null
    }
    setRevealed(null)
  }, [])

  useEffect(() => () => {
    if (revealTimer.current) clearTimeout(revealTimer.current)
  }, [])

  const loadItems = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    setListError(null)
    try {
      const res = await credFetch(apiBase(kind))
      const data = await res.json().catch(() => ({ items: [] }))
      if (gateRef.current === 'denied') {
        setItems([])
        setLoading(false)
        return
      }
      if (!res.ok) {
        setItems([])
        setListError(
          typeof data?.error === 'string' && data.error
            ? data.error
            : '목록을 불러오지 못했습니다',
        )
        // 역할 게이트를 이미 통과했으면 목록 401/403으로 등록 버튼을 내리지 않는다.
        if (shouldRevokePageOnListStatus(gateRef.current, res.status)) {
          setForcedDenied(true)
        }
        return
      }
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch {
      if (gateRef.current === 'denied') {
        setItems([])
        return
      }
      setItems([])
      setListError('목록을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [kind])

  useEffect(() => {
    if (shouldSkipStaffRoundTrip(authStaff)) {
      setPickLoading(false)
      return
    }
    const id = actorStaffIdFromStorage()
    if (!id) {
      setPickedStaff(null)
      setPickLoading(false)
      return
    }
    let cancelled = false
    void Promise.resolve(
      supabase.from('staff').select('id, role').eq('id', id).maybeSingle(),
    )
      .then(({ data }) => {
        if (cancelled) return
        setPickedStaff(data as { id: string; role: string } | null)
        setPickLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setPickedStaff(null)
        setPickLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authStaff])

  useEffect(() => {
    if (gate === 'denied') {
      setItems([])
      setLoading(false)
    }
  }, [gate])

  useEffect(() => {
    const actorStaffId = actorStaffIdFromStorage()
    if (!canPrefetchCredentialList({ authStaffId: authStaff?.id, actorStaffId })) {
      return
    }
    if (gateRef.current === 'denied') {
      setLoading(false)
      return
    }
    void loadItems()
  }, [authStaff?.id, kind, loadItems])

  useEffect(() => {
    if (canPrefetchCredentialList({
      authStaffId: authStaff?.id,
      actorStaffId: actorStaffIdFromStorage(),
    })) {
      return
    }
    if (!pickLoading && !authLoading) setLoading(false)
  }, [authStaff?.id, pickLoading, authLoading])

  const filtered = useMemo(() => filterCredentials(items, search), [items, search])

  const openNew = () => {
    clearReveal()
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (row: CredentialListItem) => {
    clearReveal()
    setEditId(row.id)
    setForm({
      name: row.name,
      url: row.url ?? '',
      login_id: row.login_id ?? '',
      password: '',
      memo: row.memo ?? '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    const payload: Record<string, string> = {
      name: form.name.trim(),
      url: form.url,
      login_id: form.login_id,
      memo: form.memo,
    }
    if (form.password.trim()) payload.password = form.password
    const res = editId
      ? await credFetch(`${apiBase(kind)}/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await credFetch(apiBase(kind), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      alert(data?.error || '저장에 실패했습니다')
      return
    }
    setShowForm(false)
    loadItems({ silent: true })
  }

  const handleDelete = async (row: CredentialListItem) => {
    if (!confirm(`"${collapseDisplayWhitespace(row.name)}"을(를) 삭제하시겠습니까?`)) return
    const res = await credFetch(`${apiBase(kind)}/${row.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      alert(data?.error || '삭제에 실패했습니다')
      return
    }
    if (revealed?.id === row.id) clearReveal()
    loadItems({ silent: true })
  }

  const revealPassword = async (row: CredentialListItem) => {
    if (revealed?.id === row.id) {
      clearReveal()
      return
    }
    const res = await credFetch(`${apiBase(kind)}/${row.id}/reveal`, { method: 'POST' })
    if (!res.ok) return
    const data = await res.json().catch(() => null)
    const password = data?.password
    if (typeof password !== 'string' || password === '') {
      setRevealed({ id: row.id, password: '' })
      return
    }
    if (revealTimer.current) clearTimeout(revealTimer.current)
    setRevealed({ id: row.id, password })
    revealTimer.current = setTimeout(() => {
      setRevealed((curr) => (curr?.id === row.id ? null : curr))
      revealTimer.current = null
    }, REVEAL_MS)
  }

  if (gate === 'checking') {
    return <div className="text-[13px] text-txt-tertiary">확인 중...</div>
  }

  if (gate === 'denied') {
    return (
      <div className="max-w-[960px] mx-auto space-y-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">{title}</h1>
        <p className="text-[13px] text-txt-quaternary">권한없음</p>
      </div>
    )
  }

  const emptyMessage = listError
    ? null
    : items.length === 0
      ? '등록된 항목이 없습니다'
      : filtered.length === 0
        ? '검색 결과가 없습니다'
        : null

  return (
    <div className="max-w-[960px] mx-auto space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">{title}</h1>
        <button
          type="button"
          onClick={openNew}
          className="self-start inline-flex items-center gap-1 h-8 px-2 text-[13px] text-txt-secondary rounded-md hover:bg-surface-tertiary hover:text-txt-primary transition"
        >
          <Plus size={14} className="text-txt-tertiary" /> 등록
        </button>
      </div>

      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름, 아이디 검색"
          className="input-field w-full"
          style={{ paddingLeft: 32 }}
        />
      </div>

      <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
        {loading ? (
          <ListSkeleton />
        ) : listError ? (
          <div className="px-3 py-2 text-[13px] text-txt-quaternary flex items-center gap-3">
            <span>{listError}</span>
            <button
              type="button"
              onClick={() => loadItems()}
              className="btn-inline"
            >
              다시 시도
            </button>
          </div>
        ) : emptyMessage ? (
          <div className="px-3 py-2 text-[13px] text-txt-quaternary">{emptyMessage}</div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-border-tertiary">
              {filtered.map((row) => (
                <MobileCard
                  key={row.id}
                  row={row}
                  revealed={revealed}
                  onReveal={() => revealPassword(row)}
                  onEdit={() => openEdit(row)}
                  onDelete={() => handleDelete(row)}
                />
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border-primary text-left">
                    <th className="px-3 py-2 font-medium">이름</th>
                    <th className="px-3 py-2 font-medium">주소</th>
                    <th className="px-3 py-2 font-medium">아이디</th>
                    <th className="px-3 py-2 font-medium">비밀번호</th>
                    <th className="px-3 py-2 font-medium">메모</th>
                    <th className="px-3 py-2 font-medium w-[1%] whitespace-nowrap" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const isOpen = revealed?.id === row.id
                    const name = collapseDisplayWhitespace(row.name)
                    return (
                      <tr key={row.id} className="border-b border-border-tertiary last:border-0">
                        <td className="px-3 py-2 font-medium text-txt-primary max-w-[180px]">
                          <span className="block truncate" title={name}>{name}</span>
                        </td>
                        <td className="px-3 py-2 text-txt-secondary max-w-[200px]">
                          {row.url ? (
                            <a
                              href={hrefForCredentialUrl(row.url)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-accent hover:underline max-w-full"
                              title={row.url}
                            >
                              <span className="truncate">{displayCredentialUrl(row.url)}</span>
                              <ExternalLink size={12} className="shrink-0 text-txt-tertiary" />
                            </a>
                          ) : (
                            <span className="text-txt-quaternary">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-txt-secondary max-w-[160px]">
                          {row.login_id ? (
                            <span className={`block truncate ${idFontClass(row.login_id)}`} title={row.login_id}>
                              {row.login_id}
                            </span>
                          ) : (
                            <span className="text-txt-quaternary">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 min-w-0">
                            {isOpen ? (
                              revealed.password ? (
                                <span
                                  className={`truncate ${idFontClass(revealed.password)} text-txt-secondary`}
                                  title={revealed.password}
                                >
                                  {revealed.password}
                                </span>
                              ) : (
                                <span className="text-txt-quaternary">—</span>
                              )
                            ) : (
                              <span className="text-txt-secondary tracking-wider">••••••••</span>
                            )}
                            <RevealButton open={isOpen} onClick={() => revealPassword(row)} />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-txt-secondary max-w-[200px]">
                          {row.memo ? (
                            <span className="block truncate" title={row.memo}>
                              {collapseDisplayWhitespace(row.memo)}
                            </span>
                          ) : (
                            <span className="text-txt-quaternary">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <RowActions onEdit={() => openEdit(row)} onDelete={() => handleDelete(row)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowForm(false)} />
          <div className="relative bg-surface rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-tertiary">
              <h3 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">
                {editId ? '수정' : '등록'}
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-tertiary"
              >
                <X size={16} className="text-txt-tertiary" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="사이트/서비스 이름" required>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                  placeholder="예: 세움터"
                />
              </Field>
              <Field label="주소">
                <input
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  className={inputCls}
                  placeholder="https://"
                />
              </Field>
              <Field label="아이디">
                <input
                  value={form.login_id}
                  onChange={(e) => setForm((f) => ({ ...f, login_id: e.target.value }))}
                  className={inputCls}
                  autoComplete="off"
                />
              </Field>
              <Field label="비밀번호">
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className={inputCls}
                  autoComplete="new-password"
                  placeholder={editId ? '비우면 유지' : ''}
                />
              </Field>
              <Field label="메모">
                <textarea
                  value={form.memo}
                  onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                  rows={3}
                  className="w-full border border-border-primary rounded-lg px-3 py-2.5 text-[16px] text-txt-primary bg-surface focus:border-accent focus:ring-2 focus:ring-accent-light outline-none resize-none leading-relaxed"
                />
              </Field>
            </div>
            <div className="px-6 py-4 border-t border-border-tertiary flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="h-[36px] px-4 border border-border-primary rounded-lg text-[13px] text-txt-secondary hover:bg-surface-tertiary transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="h-[36px] px-5 bg-accent hover:bg-accent-hover text-white rounded-lg text-[13px] font-medium transition disabled:opacity-50"
              >
                {saving ? '저장 중...' : editId ? '수정' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function idFontClass(value: string) {
  return usesMonoIdFont(value) ? 'font-mono tabular-nums' : ''
}

function RevealButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-txt-tertiary hover:bg-surface-tertiary hover:text-txt-primary"
      title={open ? '숨기기' : '8초간 보기'}
      aria-label={open ? '비밀번호 숨기기' : '비밀번호 잠시 보기'}
    >
      <Clock size={14} className="text-txt-tertiary" />
    </button>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end">
      <button type="button" onClick={onEdit} className="btn-inline">수정</button>
      <button type="button" onClick={onDelete} className="btn-inline-danger">삭제</button>
    </div>
  )
}

function MobileCard({
  row,
  revealed,
  onReveal,
  onEdit,
  onDelete,
}: {
  row: CredentialListItem
  revealed: { id: string; password: string } | null
  onReveal: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isOpen = revealed?.id === row.id
  const name = collapseDisplayWhitespace(row.name)
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-txt-primary truncate" title={name}>{name}</p>
          {row.login_id ? (
            <p className={`mt-0.5 text-[13px] text-txt-secondary truncate ${idFontClass(row.login_id)}`} title={row.login_id}>
              {row.login_id}
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] text-txt-quaternary">—</p>
          )}
        </div>
        <div className="flex items-center shrink-0">
          <RevealButton open={isOpen} onClick={onReveal} />
          <RowActions onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
      {isOpen && (
        <p className={`mt-1 text-[13px] text-txt-secondary truncate ${revealed.password ? idFontClass(revealed.password) : ''}`}>
          {revealed.password || '—'}
        </p>
      )}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div>
      <p className="px-3 py-2 text-[13px] text-txt-quaternary">불러오는 중...</p>
      <div className="divide-y divide-border-tertiary">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <div key={i} className="px-3 py-2.5 flex items-center gap-3">
            <div className="h-3 w-24 rounded bg-surface-tertiary animate-pulse" />
            <div className="h-3 w-32 rounded bg-surface-tertiary animate-pulse hidden sm:block" />
            <div className="h-3 w-20 rounded bg-surface-tertiary animate-pulse" />
            <div className="h-3 w-16 rounded bg-surface-tertiary animate-pulse ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div>
      <label className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1 block">
        {label}{required ? ' *' : ''}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full h-[40px] border border-border-primary rounded-lg px-3 text-[16px] text-txt-primary bg-surface focus:border-accent focus:ring-2 focus:ring-accent-light outline-none'
