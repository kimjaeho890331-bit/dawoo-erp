'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { selectableStaff } from '@/lib/staff/selectable'
import { useAuth } from '@/components/AuthProvider'

// 대시보드 등 기존 화면과 동일한 localStorage 키를 재사용한다.
// 새 신원 개념을 만들지 않고, 이미 골라둔 "현재 직원"을 결재 화면에서도 그대로 이어받는다.
const STAFF_STORAGE_KEY = 'dawoo_current_staff_id'

/** 이번 브라우저 세션에서 '로그인한 사람으로 맞추기'를 이미 했는지 */
const AUTO_APPLIED_KEY = 'dawoo_actor_auto_applied'

export interface ActorStaff {
  id: string
  name: string
  /** 채워져 있으면 퇴사자. 고를 수 있는 목록에서 뺀다. */
  resign_date?: string | null
}

/**
 * 한 화면이 useActor()를 두 번 부를 수 있다 — 기안작성은 사이드바(DraftPage)와
 * 폼(DraftForm)이 따로 부른다. 인스턴스마다 useState를 따로 들면 한쪽에서 직원을
 * 바꿔도 다른 쪽은 옛 이름을 그대로 들고 있어, 사이드바에는 A가 떠 있는데
 * 기안자는 B로 저장되는 일이 생긴다. 바꿀 때 같은 탭의 다른 인스턴스에도 알린다.
 * (다른 탭은 브라우저가 보내는 storage 이벤트가 맡는다.)
 */
const actorListeners = new Set<(id: string) => void>()

interface UseActorResult {
  /** 선택된 직원 전체 정보. staffList 로드 전이거나 선택 안 됐으면 null. */
  actor: ActorStaff | null
  /** 선택된 staff id. staffList 로드와 무관하게 localStorage 값을 즉시 반영한다. */
  actorId: string | null
  setActorId: (id: string) => void
  staffList: ActorStaff[]
  loading: boolean
}

/**
 * "지금 누구로 화면을 쓰고 있는가"를 관리하는 훅.
 *
 * 결재는 로그인 계정과 연결되지 않으므로, 기안자·결재자를 화면에서 직접 고른다.
 * 선택값은 기존 ERP(대시보드)와 같은 localStorage 키에 저장해 다른 화면과 일관되게 유지한다.
 * 서버는 이 값을 신뢰하지 않고(actor_staff_id로만 받아 자격을 다시 검증) DB 상태로 재판정하므로,
 * 여기서는 "화면에 무엇을 보여줄지"만 결정하면 된다.
 */
export function useActor(): UseActorResult {
  const { staff: authStaff } = useAuth()
  const [staffList, setStaffList] = useState<ActorStaff[]>([])
  const [actorId, setActorIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(STAFF_STORAGE_KEY)
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('staff')
      .select('id, name, resign_date')
      .order('name')
      .then(({ data }) => {
        if (cancelled) return
        // 퇴사자는 고를 수 없다. 여기 목록은 "지금 누구로 쓰는가"를 정하는 데만
        // 쓰이고 옛 문서의 이름은 문서마다 따로 읽어오므로, 걸러도 잃는 게 없다.
        setStaffList(selectableStaff((data ?? []) as ActorStaff[]))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onLocalChange = (id: string) => setActorIdState(id)
    actorListeners.add(onLocalChange)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STAFF_STORAGE_KEY && e.newValue) setActorIdState(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => {
      actorListeners.delete(onLocalChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  /**
   * 로그인한 사람으로 자동 지정.
   *
   * 예전에는 로그인 계정과 직원이 연결되지 않아 화면에서 직접 골라야 했다.
   * 지금은 계정 연결(staff_emails)이 있어 "지금 쓰는 사람"을 알 수 있으므로,
   * 화면을 열면 본인으로 맞춰 둔다 — 공용 PC에 남아 있던 남의 이름으로
   * 결재가 올라가는 일을 막는다.
   *
   * 브라우저를 연 뒤 한 번만 맞춘다. 경리가 다른 사람 몫을 대신 작성하는
   * 경우가 있는데, 화면을 옮길 때마다 본인으로 되돌리면 그 작업이 불가능해진다.
   * 그래서 '이번 세션에 이미 맞췄는지'를 sessionStorage에 남긴다 —
   * 탭을 닫았다 열면 다시 본인으로 시작한다.
   */
  const autoApplied = useRef(false)
  useEffect(() => {
    if (autoApplied.current) return
    const myId = authStaff?.id
    if (!myId || typeof window === 'undefined') return
    autoApplied.current = true
    if (sessionStorage.getItem(AUTO_APPLIED_KEY) === '1') return
    sessionStorage.setItem(AUTO_APPLIED_KEY, '1')
    if (myId === actorId) return
    localStorage.setItem(STAFF_STORAGE_KEY, myId)
    actorListeners.forEach(fn => fn(myId))
  }, [authStaff?.id, actorId])

  const setActorId = useCallback((id: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STAFF_STORAGE_KEY, id)
    }
    // 자기 자신도 이 목록에 들어 있으므로 여기서 상태가 갱신된다.
    actorListeners.forEach(fn => fn(id))
  }, [])

  const actor = staffList.find(s => s.id === actorId) ?? null

  return { actor, actorId, setActorId, staffList, loading }
}

interface Props {
  actorId: string | null
  staffList: ActorStaff[]
  onChange: (id: string) => void
  loading?: boolean
  className?: string
  /**
   * 모바일에서만 남는 가로폭을 select가 채우고 높이를 44px로 키운다.
   * md 이상에서는 기본 모양으로 되돌아가므로, 이 값을 켜도 데스크톱은 변하지 않는다.
   */
  fullWidth?: boolean
  /**
   * 좁은 사이드바용. select는 기본적으로 가장 긴 항목("직원을 선택해 주세요")에
   * 맞춰 넓어지는데, 실제로 보이는 값은 이름 세 글자다. 폭을 이름에 맞춰 고정한다.
   * 고를 때 펼쳐지는 목록은 이 폭에 갇히지 않으므로 이름이 잘리지 않는다.
   */
  compact?: boolean
}

/** 현재 직원 선택 드롭다운. useActor()의 결과를 그대로 넘겨 쓴다. */
export default function ActorPicker({ actorId, staffList, onChange, loading, className, fullWidth, compact }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <span className="text-xs text-txt-secondary shrink-0">현재 직원</span>
      <select
        value={actorId ?? ''}
        onChange={e => onChange(e.target.value)}
        aria-label="현재 직원 선택"
        className={`border border-border-primary rounded-lg bg-surface text-txt-primary ${
          fullWidth
            ? 'px-3 flex-1 min-w-0 h-11 text-base md:flex-none md:h-auto md:py-1.5 md:text-sm'
            : compact
              ? 'w-[76px] min-w-0 px-1.5 py-1.5 text-sm'
              : 'px-3 py-1.5 text-sm'
        }`}
      >
        <option value="">{loading ? '불러오는 중' : '직원을 선택해 주세요'}</option>
        {staffList.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  )
}
