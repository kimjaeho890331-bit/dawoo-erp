'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Clock, ExternalLink, Plus, X } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { CredentialKind } from '@/types'
import type { CredentialListItem } from '@/lib/credentials/fields'
import {
  resolveCredentialPageGate,
  resolvePageStaff,
  shouldRevokePageOnListStatus,
  type CredentialPageGate,
} from '@/lib/credentials/pageGate'

const REVEAL_MS = 8000
const STAFF_KEY = 'dawoo_current_staff_id'

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

export default function CredentialsPage({
  kind,
  title,
}: {
  kind: CredentialKind
  title: string
}) {
  const { staff: authStaff, loading: authLoading } = useAuth()
  const [pickedStaff, setPickedStaff] = useState<{ id: string; role: string } | null>(null)
  const [pickLoading, setPickLoading] = useState(true)
  const staff = resolvePageStaff(pickedStaff, authStaff)
  const [gate, setGate] = useState<CredentialPageGate>('checking')
  const [items, setItems] = useState<CredentialListItem[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [revealed, setRevealed] = useState<{ id: string; password: string } | null>(null)
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const loadItems = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const res = await credFetch(apiBase(kind))
      const data = await res.json().catch(() => ({ items: [] }))
      if (!res.ok) {
        setItems([])
        setListError(
          typeof data?.error === 'string' && data.error
            ? data.error
            : '목록을 불러오지 못했습니다',
        )
        // 역할 게이트를 이미 통과했으면 목록 401/403으로 등록 버튼을 내리지 않는다.
        setGate((current) =>
          shouldRevokePageOnListStatus(current, res.status) ? 'denied' : current,
        )
        return
      }
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch {
      setItems([])
      setListError('목록을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [kind])

  useEffect(() => {
    let cancelled = false
    const id = typeof window !== 'undefined' ? localStorage.getItem(STAFF_KEY) : null
    if (!id) {
      setPickedStaff(null)
      setPickLoading(false)
      return
    }
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
  }, [])

  useEffect(() => {
    // 한 번 허용되면 staff가 잠깐 비어도(리마운트·토큰 이벤트) 등록을 유지한다.
    if (gate === 'ok') return
    if (pickLoading) return
    if (authLoading && !staff) return
    setGate(resolveCredentialPageGate(kind, staff))
  }, [staff, kind, authLoading, pickLoading, gate])

  useEffect(() => {
    if (gate === 'ok') loadItems()
  }, [gate, loadItems])

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
    loadItems()
  }

  const handleDelete = async (row: CredentialListItem) => {
    if (!confirm(`"${row.name}"을(를) 삭제하시겠습니까?`)) return
    const res = await credFetch(`${apiBase(kind)}/${row.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      alert(data?.error || '삭제에 실패했습니다')
      return
    }
    if (revealed?.id === row.id) clearReveal()
    loadItems()
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
    return <div className="p-6 text-[16px] text-txt-tertiary">확인 중...</div>
  }

  if (gate === 'denied') {
    return (
      <div className="p-6 max-w-[900px] mx-auto space-y-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">{title}</h1>
        <div className="bg-surface rounded-[10px] border border-border-primary py-16 text-center text-[16px] text-txt-quaternary">
          권한없음
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[960px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">{title}</h1>
        <button
          type="button"
          onClick={openNew}
          className="h-[36px] px-5 bg-accent hover:bg-accent-hover text-white rounded-lg text-[13px] font-medium transition flex items-center gap-1.5"
        >
          <Plus size={14} /> 등록
        </button>
      </div>

      <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[16px] text-txt-quaternary">불러오는 중...</div>
        ) : listError ? (
          <div className="py-16 text-center text-[16px] text-txt-quaternary space-y-3">
            <p>{listError}</p>
            <button
              type="button"
              onClick={loadItems}
              className="h-[36px] px-4 border border-border-primary rounded-lg text-[13px] text-txt-secondary hover:bg-surface-tertiary transition"
            >
              다시 시도
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-[16px] text-txt-quaternary">등록된 항목이 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[16px]">
              <thead>
                <tr className="border-b border-border-primary text-left text-[13px] text-txt-tertiary">
                  <th className="px-5 py-3 font-medium">이름</th>
                  <th className="px-5 py-3 font-medium">주소</th>
                  <th className="px-5 py-3 font-medium">아이디</th>
                  <th className="px-5 py-3 font-medium">비밀번호</th>
                  <th className="px-5 py-3 font-medium">메모</th>
                  <th className="px-5 py-3 font-medium w-[140px]" />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const isOpen = revealed?.id === row.id
                  return (
                    <tr key={row.id} className="border-b border-border-tertiary last:border-0">
                      <td className="px-5 py-3.5 font-medium text-txt-primary">{row.name}</td>
                      <td className="px-5 py-3.5 text-txt-secondary">
                        {row.url ? (
                          <a
                            href={/^https?:\/\//i.test(row.url) ? row.url : `https://${row.url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-accent hover:underline"
                          >
                            <span className="max-w-[180px] truncate">{row.url.replace(/^https?:\/\//, '')}</span>
                            <ExternalLink size={14} className="shrink-0" />
                          </a>
                        ) : (
                          <span className="text-txt-quaternary">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-txt-secondary font-mono text-[15px]">
                        {row.login_id || <span className="text-txt-quaternary font-sans">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[15px] text-txt-secondary tracking-wider">
                            {isOpen ? revealed.password || '—' : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => revealPassword(row)}
                            className="h-7 w-7 flex items-center justify-center rounded-md text-txt-tertiary hover:bg-surface-tertiary hover:text-txt-primary"
                            title={isOpen ? '숨기기' : '8초간 보기'}
                            aria-label={isOpen ? '비밀번호 숨기기' : '비밀번호 잠시 보기'}
                          >
                            <Clock size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-txt-secondary max-w-[200px] truncate">
                        {row.memo || <span className="text-txt-quaternary">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="h-[32px] px-3 text-[12px] text-txt-secondary border border-border-primary rounded-lg hover:bg-surface-tertiary transition"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            className="h-[32px] px-3 text-[12px] text-[#dc2626] border border-[#fecaca] rounded-lg hover:bg-[#fee2e2] transition"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
