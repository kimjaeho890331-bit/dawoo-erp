'use client'

import { useState, useEffect, useCallback } from 'react'
import { Link2, UserCheck, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'

interface StaffOption {
  id: string
  name: string
}

/**
 * 로그인 계정(카카오/네이버 등)과 직원 정보를 본인이 직접 연결하는 위젯.
 *
 * 왜 필요한가: 지출결의서 결재 기록에는 행위 시점의 로그인 이메일이
 * (drafted_by_email / acted_by_email로) 남는다. staff_emails 매핑이 없으면
 * "누가 승인했는지"는 이메일 문자열로만 남고 실제 이름을 알 수 없다.
 * 관리자가 일일이 물어보는 대신 각자 로그인한 상태에서 자기 이름을 한 번
 * 고르면 연결되게 한다.
 *
 * 조회(staff_emails, staff 목록)는 이 프로젝트 방침대로 anon 클라이언트로 직접 하고,
 * 연결(쓰기)만 서버 라우트(/api/staff/link-account)를 거친다 — 그래야 세션 이메일을
 * 서버가 확정해서 남의 계정에 잘못 붙는 걸 막을 수 있다.
 */
export default function AccountLink() {
  const { user } = useAuth()
  const sessionEmail = user?.email ?? null

  const [linkedStaffName, setLinkedStaffName] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgType, setMsgType] = useState<'info' | 'error'>('info')

  const loadLinkStatus = useCallback(async () => {
    if (!sessionEmail) {
      setChecked(true)
      return
    }
    try {
      const { data } = await supabase
        .from('staff_emails')
        .select('staff_id, staff:staff_id(name)')
        .eq('email', sessionEmail)
        .maybeSingle()

      const staffInfo = data?.staff as unknown as { name: string } | null
      setLinkedStaffName(staffInfo?.name ?? null)
    } catch {
      // 조회 실패해도 화면은 "연결 안 됨" 상태로 보여주고 다시 시도할 수 있게 둔다
      setLinkedStaffName(null)
    } finally {
      setChecked(true)
    }
  }, [sessionEmail])

  const loadStaffList = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('staff').select('id, name').order('name')
      if (error) {
        setMsgType('error')
        setMsg('직원 목록을 불러오지 못했습니다')
        return
      }
      setStaffList((data ?? []) as StaffOption[])
    } catch {
      setMsgType('error')
      setMsg('직원 목록을 불러오는 중 오류가 발생했습니다')
    }
  }, [])

  useEffect(() => {
    loadLinkStatus()
  }, [loadLinkStatus])

  useEffect(() => {
    if (editing && staffList.length === 0) loadStaffList()
  }, [editing, staffList.length, loadStaffList])

  const selectedStaffName = staffList.find(s => s.id === selectedId)?.name ?? ''

  // 실행 전 확인 단계로 넘어간다 — 실제 연결(fetch)은 handleLink에서 한다.
  // 드롭다운이 전 직원을 필터 없이 보여주므로, 여기서 "이 계정을 OOO 님으로
  // 연결합니다"를 한 번 더 보여줘 실수로 다른 사람 이름을 고르는 걸 줄인다.
  const handleRequestConfirm = () => {
    if (!selectedId) {
      setMsgType('error')
      setMsg('연결할 직원을 선택해 주세요')
      return
    }
    setMsg(null)
    setConfirming(true)
  }

  const handleCancelConfirm = () => {
    setConfirming(false)
  }

  const handleLink = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/staff/link-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: selectedId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsgType('error')
        setMsg(json.error || '계정 연결에 실패했습니다')
        setConfirming(false)
        return
      }
      setLinkedStaffName(json.staff_name)
      setEditing(false)
      setConfirming(false)
      setSelectedId('')
      setMsgType('info')
      setMsg(
        json.previous_staff_name
          ? `연결되었습니다. 이 계정은 원래 "${json.previous_staff_name}"님에게 연결돼 있었는데, "${json.staff_name}"님으로 변경했습니다.`
          : `"${json.staff_name}"님으로 연결되었습니다.`,
      )
    } catch {
      setMsgType('error')
      setMsg('계정 연결 중 오류가 발생했습니다')
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-border-primary rounded-lg px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {linkedStaffName ? (
            <UserCheck size={16} className="text-txt-tertiary" />
          ) : (
            <Link2 size={16} className="text-txt-tertiary" />
          )}
          <span className="text-sm text-txt-primary">내 계정 연결</span>
        </div>
        {!editing && checked && (
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 text-xs border border-border-primary rounded-lg text-txt-primary"
          >
            {linkedStaffName ? '다른 직원으로 변경' : '연결하기'}
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-txt-tertiary">
        결재 기록에 이름이 남으려면 로그인 계정과 직원 정보를 연결해야 합니다.
        계정을 여러 개 쓰시면 각 계정으로 로그인해서 한 번씩 연결해 주세요.
      </p>

      {!sessionEmail && checked && (
        <p className="mt-2 text-xs text-txt-tertiary">로그인 후 이용할 수 있습니다.</p>
      )}

      {sessionEmail && (
        <p className="mt-2 text-xs text-txt-secondary">
          현재 로그인 계정: <span className="font-medium text-txt-primary">{sessionEmail}</span>
          {checked && (
            <>
              {' — '}
              {linkedStaffName ? (
                <span>
                  <span className="font-medium text-accent-text">{linkedStaffName}</span>님으로 연결됨
                </span>
              ) : (
                <span className="text-danger">연결 안 됨</span>
              )}
            </>
          )}
        </p>
      )}

      {editing && sessionEmail && !confirming && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="flex-1 h-[34px] border border-border-primary rounded-lg px-2 text-[13px] text-txt-primary bg-surface focus:border-accent outline-none"
          >
            <option value="">직원을 선택해 주세요</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleRequestConfirm}
            disabled={busy || !selectedId}
            className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover disabled:opacity-40 text-white rounded-lg flex items-center gap-1"
          >
            연결하기
          </button>
          <button
            onClick={() => { setEditing(false); setSelectedId(''); setMsg(null) }}
            disabled={busy}
            className="px-3 py-1.5 text-xs text-txt-secondary border border-border-primary rounded-lg disabled:opacity-40"
          >
            취소
          </button>
        </div>
      )}

      {editing && sessionEmail && confirming && (
        <div className="mt-3 rounded-lg border border-accent bg-accent-light px-3 py-3">
          <p className="text-[13px] text-txt-primary">
            이 계정({sessionEmail})을{' '}
            <span className="font-semibold text-accent-text">&quot;{selectedStaffName}&quot;</span>{' '}
            님으로 연결합니다. 맞습니까?
          </p>
          {linkedStaffName && linkedStaffName !== selectedStaffName && (
            <p className="mt-1.5 text-xs text-txt-secondary">
              현재 이 계정은 <span className="font-medium text-txt-primary">&quot;{linkedStaffName}&quot;</span>님으로
              연결되어 있습니다. 확인하면 <span className="font-medium text-txt-primary">&quot;{selectedStaffName}&quot;</span>님으로
              변경됩니다.
            </p>
          )}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={handleLink}
              disabled={busy}
              className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover disabled:opacity-40 text-white rounded-lg flex items-center gap-1"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : null}
              확인, 연결합니다
            </button>
            <button
              onClick={handleCancelConfirm}
              disabled={busy}
              className="px-3 py-1.5 text-xs text-txt-secondary border border-border-primary rounded-lg disabled:opacity-40"
            >
              다시 선택
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`mt-1.5 text-xs ${msgType === 'error' ? 'text-danger' : 'text-accent-text'}`}>{msg}</p>
      )}
    </div>
  )
}
