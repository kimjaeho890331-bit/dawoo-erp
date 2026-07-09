'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ClipboardList, Calendar, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { calcTotalLeave } from '@/lib/utils/leave'
import { useAuth } from '@/components/AuthProvider'
import { buildStaffColorMap } from '@/lib/staff-colors'

interface LeaveRequest {
  id: string
  staff_id: string
  leave_type: string
  leave_subtype: string | null
  start_date: string
  end_date: string
  days: number
  reason: string
  status: '대기' | '승인' | '반려'
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

interface Staff {
  id: string
  name: string
  role: string
  position?: string | null
  join_date: string | null
  color?: string | null
}

// --- 직책/직급 정렬 순서 ---
// 직책(role): 대표 → 관리자 → 현장소장 → 직원, 그 외는 뒤로
const ROLE_ORDER: Record<string, number> = { '대표': 0, '관리자': 1, '현장소장': 2, '직원': 3 }
// 직급(position, 호칭) 높은 순. 문자열 부분일치로 판정, 목록에 없으면 998, 비어있으면 999(맨 뒤)
const POSITION_ORDER = ['회장', '부회장', '사장', '부사장', '전무', '상무', '이사', '본부장', '실장', '부장', '차장', '팀장', '과장', '대리', '주임', '사원']
const roleRank = (role: string) => ROLE_ORDER[role] ?? 99
const positionRank = (pos?: string | null) => {
  if (!pos) return 999
  const idx = POSITION_ORDER.findIndex(p => pos.includes(p))
  return idx === -1 ? 998 : idx
}
// 직책 → 직급 → 입사일 빠른 순 → 이름
function compareStaffByRank(a: Staff, b: Staff): number {
  return roleRank(a.role) - roleRank(b.role)
    || positionRank(a.position) - positionRank(b.position)
    || (a.join_date || '9999-99-99').localeCompare(b.join_date || '9999-99-99')
    || a.name.localeCompare(b.name, 'ko')
}

// --- 연차 기준 (근로기준법) ---
// calcTotalLeave → src/lib/utils/leave.ts

// --- 경조사 규정 ---
const FAMILY_EVENT_TYPES = [
  { key: '본인결혼', label: '본인 결혼', days: 5 },
  { key: '자녀결혼', label: '자녀 결혼', days: 1 },
  { key: '부모사망', label: '부모 사망', days: 5 },
  { key: '배우자사망', label: '배우자 사망', days: 5 },
  { key: '배우자부모사망', label: '배우자 부모 사망', days: 5 },
  { key: '조부모사망', label: '조부모/외조부모 사망', days: 3 },
  { key: '형제자매사망', label: '형제자매 사망', days: 3 },
] as const

const LEAVE_CATEGORIES = ['연차', '반차(오전)', '반차(오후)', '병가', '경조사', '기타'] as const

const TYPE_COLORS: Record<string, string> = {
  '연차': 'bg-blue-100 text-blue-700',
  '반차(오전)': 'bg-purple-100 text-purple-700',
  '반차(오후)': 'bg-indigo-100 text-indigo-700',
  '병가': 'bg-red-100 text-red-700',
  '경조사': 'bg-pink-100 text-pink-700',
  '기타': 'bg-surface-secondary text-txt-secondary',
}

const STATUS_COLORS: Record<string, string> = {
  '대기': 'bg-yellow-100 text-yellow-700',
  '승인': 'bg-green-100 text-green-700',
  '반려': 'bg-red-100 text-red-700',
}

// 주말 포함 일수 계산
function calcDays(start: string, end: string, type: string): number {
  if (type.includes('반차')) return 0.5
  return Math.max(Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1, 1)
}

function formatDate(d: string) {
  const dt = new Date(d)
  return `${dt.getMonth() + 1}/${dt.getDate()}`
}

// 회사 규정: 최대 5일 (주말 포함)
const MAX_CONSECUTIVE_DAYS = 5

export default function LeavePage() {
  const { staff: currentStaff } = useAuth()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const staffColorMap = useMemo(() => buildStaffColorMap(staffList), [staffList])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState('전체')
  const [filterStaffId, setFilterStaffId] = useState<string | null>(null)  // null = 전체

  // 폼
  const [formStaffId, setFormStaffId] = useState('')
  const [formLeaveType, setFormLeaveType] = useState<string>('연차')
  const [formSubtype, setFormSubtype] = useState<string>('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formReason, setFormReason] = useState('')

  // 공유 도구: 전 직원 연차를 함께 조회하고, 신청 시 직원을 직접 선택한다.
  // "현재 직원"은 앱 전역 localStorage 값(대시보드/캘린더와 동일) 우선, 이메일 로그인은 fallback.
  const [currentStaffId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('dawoo_current_staff_id')
  })
  const myStaffId = currentStaffId || currentStaff?.id || null

  const loadData = useCallback(async () => {
    setLoading(true)
    const [reqRes, staffRes] = await Promise.all([
      supabase.from('leave_requests').select('*').order('start_date', { ascending: false }),
      supabase.from('staff').select('*').order('name'),
    ])
    if (!reqRes.error) setRequests((reqRes.data as LeaveRequest[]) || [])
    if (!staffRes.error) setStaffList((staffRes.data as Staff[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const getName = (id: string) => staffList.find(s => s.id === id)?.name || ''
  const getUsed = (id: string) => requests.filter(r => r.staff_id === id && r.status === '승인').reduce((s, r) => s + r.days, 0)

  // 직책+직급 순 정렬 (현황 카드 + 이름 칩 공용)
  const sortedStaff = useMemo(() => [...staffList].sort(compareStaffByRank), [staffList])

  // 이름(직원) 선택을 먼저 적용한 뒤 상태 필터 — 상태 개수 배지도 선택한 사람 기준으로 표시
  const staffScoped = filterStaffId ? requests.filter(r => r.staff_id === filterStaffId) : requests
  const filtered = staffScoped.filter(r => filterStatus === '전체' || r.status === filterStatus)

  // 폼 유효성 검사
  const formDays = useMemo(() => {
    if (!formStartDate || !formEndDate) return 0
    return calcDays(formStartDate, formEndDate, formLeaveType)
  }, [formStartDate, formEndDate, formLeaveType])

  const formValidation = useMemo(() => {
    if (!formStaffId || !formStartDate || !formEndDate) return { valid: false, error: '' }

    const days = formDays
    const staff = staffList.find(s => s.id === formStaffId)

    // 1) 최대 5일 제한 (주말 포함)
    if (days > MAX_CONSECUTIVE_DAYS && formLeaveType !== '경조사') {
      return { valid: false, error: `최대 ${MAX_CONSECUTIVE_DAYS}일까지 신청 가능합니다 (주말 포함)` }
    }

    // 2) 연차/반차: 잔여일 체크
    if (formLeaveType === '연차' || formLeaveType.includes('반차')) {
      const totalLeave = calcTotalLeave(staff?.join_date || null)
      const used = getUsed(formStaffId)
      const remaining = totalLeave - used
      if (days > remaining) {
        return { valid: false, error: `잔여 연차 부족 (잔여 ${remaining}일, 신청 ${days}일)` }
      }
    }

    // 3) 경조사: 규정 일수 체크
    if (formLeaveType === '경조사') {
      if (!formSubtype) return { valid: false, error: '경조사 유형을 선택해주세요' }
      const rule = FAMILY_EVENT_TYPES.find(f => f.key === formSubtype)
      if (rule && days > rule.days) {
        return { valid: false, error: `${rule.label}은 최대 ${rule.days}일입니다 (신청 ${days}일)` }
      }
    }

    // 4) 시작일 > 종료일
    if (formStartDate > formEndDate) {
      return { valid: false, error: '종료일이 시작일보다 빠릅니다' }
    }

    return { valid: true, error: '' }
  }, [formStaffId, formStartDate, formEndDate, formLeaveType, formSubtype, formDays, staffList])

  // 경조사 선택 시 자동 종료일 설정
  const handleSubtypeChange = (subtype: string) => {
    setFormSubtype(subtype)
    const rule = FAMILY_EVENT_TYPES.find(f => f.key === subtype)
    if (rule && formStartDate) {
      const end = new Date(formStartDate)
      end.setDate(end.getDate() + rule.days - 1)
      setFormEndDate(end.toISOString().slice(0, 10))
    }
  }

  // 캘린더 연동
  const syncToCalendar = async (req: LeaveRequest) => {
    const color = staffColorMap[req.staff_id] || '#EF4444'
    const typeLabel = req.leave_type === '경조사' && req.leave_subtype
      ? FAMILY_EVENT_TYPES.find(f => f.key === req.leave_subtype)?.label || req.leave_subtype
      : req.leave_type
    const title = `${typeLabel}${req.leave_type.includes('반차') ? '' : ' ' + req.days + '일'}`

    await supabase.from('schedules').delete()
      .eq('staff_id', req.staff_id).eq('schedule_type', 'personal')
      .eq('start_date', req.start_date).eq('end_date', req.end_date)

    await supabase.from('schedules').insert({
      title, start_date: req.start_date, end_date: req.end_date,
      staff_id: req.staff_id, schedule_type: 'personal', color, confirmed: true, all_day: true,
      memo: `${getName(req.staff_id)} ${typeLabel}${req.reason ? ' - ' + req.reason : ''}`,
    })
  }

  const removeFromCalendar = async (req: LeaveRequest) => {
    await supabase.from('schedules').delete()
      .eq('staff_id', req.staff_id).eq('schedule_type', 'personal')
      .eq('start_date', req.start_date).eq('end_date', req.end_date)
  }

  const handleApprove = async (id: string) => {
    const req = requests.find(r => r.id === id)
    if (!req) return
    const { error } = await supabase.from('leave_requests').update({
      status: '승인', approved_at: new Date().toISOString(), approved_by: myStaffId,
    }).eq('id', id)
    if (!error) { await syncToCalendar({ ...req, status: '승인' }); loadData() }
  }

  const handleReject = async (id: string) => {
    const req = requests.find(r => r.id === id)
    if (!req) return
    const { error } = await supabase.from('leave_requests').update({
      status: '반려', approved_at: new Date().toISOString(), approved_by: myStaffId,
    }).eq('id', id)
    if (!error) { await removeFromCalendar(req); loadData() }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    const req = requests.find(r => r.id === id)
    if (req) await removeFromCalendar(req)
    await supabase.from('leave_requests').delete().eq('id', id)
    loadData()
  }

  const openCreate = () => {
    // 현재 직원을 기본 선택 (목록에 실제 존재할 때만) — 없으면 첫 직원
    const defaultId = staffList.find(s => s.id === myStaffId)?.id || staffList[0]?.id || ''
    setEditingId(null); setFormStaffId(defaultId); setFormLeaveType('연차'); setFormSubtype('')
    const today = new Date().toISOString().slice(0, 10)
    setFormStartDate(today); setFormEndDate(today); setFormReason('')
    setShowModal(true)
  }

  const openEdit = (r: LeaveRequest) => {
    setEditingId(r.id); setFormStaffId(r.staff_id); setFormLeaveType(r.leave_type)
    setFormSubtype((r as any).leave_subtype || ''); setFormStartDate(r.start_date); setFormEndDate(r.end_date); setFormReason(r.reason)
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!formValidation.valid) return
    const days = formDays
    const payload = {
      staff_id: formStaffId, leave_type: formLeaveType, leave_subtype: formLeaveType === '경조사' ? formSubtype : null,
      start_date: formStartDate, end_date: formEndDate, days, reason: formReason,
    }
    if (editingId) {
      const { error } = await supabase.from('leave_requests').update(payload).eq('id', editingId)
      if (!error) { setShowModal(false); loadData() }
    } else {
      const { error } = await supabase.from('leave_requests').insert({ ...payload, status: '대기' })
      if (!error) { setShowModal(false); loadData() }
    }
  }

  if (loading) return <div className="p-6 max-w-[1200px] mx-auto"><div className="text-center py-20 text-txt-tertiary">불러오는 중...</div></div>

  const pendingCount = requests.filter(r => r.status === '대기').length

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">연차관리</h1>
          {pendingCount > 0 && (
            <span className="text-xs px-[10px] py-[2px] bg-yellow-100 text-yellow-700 rounded-full font-medium">승인 대기 {pendingCount}건</span>
          )}
        </div>
        <button onClick={openCreate} className="btn-primary">+ 연차 신청</button>
      </div>

      {/* 직원별 연차 현황 카드 — 전 직원, 직책+직급 순 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {sortedStaff.map(s => {
          const total = calcTotalLeave(s.join_date)
          const used = getUsed(s.id)
          const remain = total - used
          const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
          const color = staffColorMap[s.id] || '#94a3b8'
          return (
            <div key={s.id} className="bg-surface rounded-[10px] border border-border-primary p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm font-semibold text-txt-primary">{s.name}</span>
              </div>
              <div className="h-1.5 bg-surface-secondary rounded-full overflow-hidden mb-1.5">
                <div className={`h-full rounded-full ${remain <= 3 ? 'bg-red-400' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-txt-tertiary tabular-nums">{used}/{total}일 사용</span>
                <span className={`font-semibold tabular-nums ${remain <= 3 ? 'text-red-500' : 'text-accent-text'}`}>{remain}일</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* 규정 안내 */}
      <div className="bg-surface-secondary rounded-[10px] border border-border-primary px-4 py-3">
        <div className="flex items-center gap-4 text-[11px] text-txt-secondary">
          <span className="font-semibold text-txt-secondary flex items-center gap-1"><ClipboardList size={16} className="text-txt-tertiary" /> 규정</span>
          <span>연차: 1년 미만 월1일(최대11일) · 1년↑ 15일 · 3년↑ 2년마다 +1일(최대25일)</span>
          <span className="w-px h-3 bg-border-secondary" />
          <span>연속 최대 5일(주말 포함)</span>
          <span className="w-px h-3 bg-border-secondary" />
          <span>경조사: 본인결혼5 · 자녀결혼1 · 부모/배우자상5 · 조부모/형제상3</span>
        </div>
      </div>

      {/* 필터 + 리스트 */}
      <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
        <div className="px-4 py-3 border-b border-border-tertiary space-y-2.5">
          {/* 상태 필터 (개수는 선택한 직원 기준) */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {['전체', '대기', '승인', '반려'].map(st => (
                <button key={st} onClick={() => setFilterStatus(st)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    filterStatus === st ? 'bg-accent text-white' : 'text-txt-secondary hover:bg-surface-secondary'
                  }`}>{st} {st !== '전체' && <span className="ml-0.5 opacity-70">({staffScoped.filter(r => r.status === st).length})</span>}</button>
              ))}
            </div>
            <span className="text-xs text-txt-tertiary">{filtered.length}건</span>
          </div>
          {/* 이름별 조회 — 직책+직급 순, 클릭 시 해당 직원만 표시 (다시 클릭 시 전체) */}
          <div className="flex flex-wrap items-center gap-1">
            <button onClick={() => setFilterStaffId(null)}
              className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                filterStaffId === null ? 'bg-accent text-white border-accent' : 'bg-surface text-txt-secondary border-border-primary hover:bg-surface-secondary'
              }`}>전체</button>
            {sortedStaff.map(s => {
              const active = filterStaffId === s.id
              return (
                <button key={s.id} onClick={() => setFilterStaffId(active ? null : s.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                    active ? 'bg-accent text-white border-accent' : 'bg-surface text-txt-secondary border-border-primary hover:bg-surface-secondary'
                  }`}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: staffColorMap[s.id] || '#94a3b8' }} />
                  {s.name}
                </button>
              )
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-txt-quaternary text-sm">신청 내역이 없습니다</div>
        ) : (
          <div className="divide-y divide-surface-secondary">
            {filtered.map(r => {
              const color = staffColorMap[r.staff_id] || '#3B82F6'
              const dateStr = r.start_date === r.end_date ? formatDate(r.start_date) : `${formatDate(r.start_date)} ~ ${formatDate(r.end_date)}`
              const subtypeLabel = r.leave_type === '경조사' && r.leave_subtype
                ? FAMILY_EVENT_TYPES.find(f => f.key === r.leave_subtype)?.label || r.leave_subtype
                : null

              return (
                <div key={r.id} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-tertiary transition-colors">
                  <div className="flex items-center gap-2 w-20 shrink-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-sm font-medium text-txt-primary">{getName(r.staff_id)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 w-28 shrink-0">
                    <span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium ${TYPE_COLORS[r.leave_type] || TYPE_COLORS['기타']}`}>
                      {r.leave_type}
                    </span>
                    {subtypeLabel && <span className="text-[10px] text-txt-tertiary">{subtypeLabel}</span>}
                  </div>
                  <div className="flex items-center gap-2 w-36 shrink-0">
                    <span className="text-sm text-txt-secondary">{dateStr}</span>
                    <span className="text-xs text-txt-tertiary tabular-nums">({r.days}일)</span>
                  </div>
                  <span className="text-sm text-txt-secondary flex-1 truncate">{r.reason || '-'}</span>
                  <span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium shrink-0 ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                  {r.status === '승인' && <span className="shrink-0" title="캘린더 등록"><Calendar size={14} className="text-green-600" /></span>}
                  <div className="flex items-center gap-1 shrink-0">
                    {r.status === '대기' && (
                      <>
                        <button onClick={() => handleApprove(r.id)} className="text-[11px] px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100">승인</button>
                        <button onClick={() => handleReject(r.id)} className="text-[11px] px-2 py-1 bg-red-50 text-red-500 rounded hover:bg-red-100">반려</button>
                      </>
                    )}
                    <button onClick={() => openEdit(r)} className="btn-inline">수정</button>
                    <button onClick={() => handleDelete(r.id)} className="btn-inline-danger">삭제</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 모달 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingId ? '연차 수정' : '연차 신청'}</h3>
              <button onClick={() => setShowModal(false)} className="text-txt-tertiary hover:text-txt-secondary text-lg">&times;</button>
            </div>
            <div className="modal-body space-y-4">
              {/* 직원 — 목록에서 직접 선택 (공유 방식) */}
              <div>
                <label className="label-field">직원</label>
                {staffList.length === 0 ? (
                  <p className="text-[12px] text-txt-tertiary">등록된 직원이 없습니다. 직원관리에서 먼저 등록해주세요.</p>
                ) : (
                  <select value={formStaffId} onChange={e => setFormStaffId(e.target.value)}
                    className="input-field w-full">
                    {staffList.map(s => {
                      const total = calcTotalLeave(s.join_date)
                      const remain = total - getUsed(s.id)
                      return <option key={s.id} value={s.id}>{s.name} (잔여 {remain}일)</option>
                    })}
                  </select>
                )}
              </div>

              {/* 유형 */}
              <div>
                <label className="label-field">유형</label>
                <div className="flex flex-wrap gap-1.5">
                  {LEAVE_CATEGORIES.map(t => (
                    <button key={t} type="button" onClick={() => { setFormLeaveType(t); if (t !== '경조사') setFormSubtype('') }}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        formLeaveType === t ? 'bg-accent text-white border-accent' : 'bg-surface text-txt-secondary border-border-primary hover:bg-surface-tertiary'
                      }`}>{t}</button>
                  ))}
                </div>
              </div>

              {/* 경조사 세부 유형 */}
              {formLeaveType === '경조사' && (
                <div>
                  <label className="label-field">경조사 유형</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FAMILY_EVENT_TYPES.map(f => (
                      <button key={f.key} type="button" onClick={() => handleSubtypeChange(f.key)}
                        className={`px-3 py-2 text-xs rounded-lg border transition-colors text-left ${
                          formSubtype === f.key ? 'bg-pink-50 text-pink-700 border-pink-300' : 'bg-surface text-txt-secondary border-border-primary hover:bg-surface-tertiary'
                        }`}>
                        {f.label} <span className="text-txt-tertiary ml-1">({f.days}일)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 기간 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-field">시작일</label>
                  <input type="date" value={formStartDate}
                    onChange={e => { setFormStartDate(e.target.value); if (e.target.value > formEndDate) setFormEndDate(e.target.value) }}
                    className="input-field w-full" />
                </div>
                <div>
                  <label className="label-field">종료일</label>
                  <input type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)} min={formStartDate}
                    className="input-field w-full" />
                </div>
              </div>

              {/* 유효성 검사 결과 */}
              {formValidation.error ? (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600 font-medium flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-600" /> {formValidation.error}
                </div>
              ) : (
                <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-700 tabular-nums">
                  {formDays}일 사용 · 승인 시 업무 캘린더 자동 등록
                  {formLeaveType === '연차' || formLeaveType.includes('반차') ? (() => {
                    const staff = staffList.find(s => s.id === formStaffId)
                    const total = calcTotalLeave(staff?.join_date || null)
                    const used = getUsed(formStaffId)
                    return ` · 잔여 ${total - used - formDays}일`
                  })() : ''}
                </div>
              )}

              {/* 사유 */}
              <div>
                <label className="label-field">사유</label>
                <textarea value={formReason} onChange={e => setFormReason(e.target.value)}
                  placeholder="사유를 입력하세요" rows={2}
                  className="input-field w-full h-auto py-2 resize-none" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowModal(false)} className="btn-secondary">취소</button>
              <button onClick={handleSubmit} disabled={!formValidation.valid}
                className={formValidation.valid
                  ? 'btn-primary'
                  : 'btn-primary opacity-40 cursor-not-allowed'
                }>{editingId ? '수정' : '신청'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
