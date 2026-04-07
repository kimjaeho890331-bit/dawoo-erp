'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Staff {
  id: string
  name: string
  phone: string | null
  role: string
  position: string | null
  email: string | null
  birth_date: string | null
  address: string | null
  emergency_contact: string | null
  emergency_phone: string | null
  bank_name: string | null
  bank_account: string | null
  salary: number | null
  telegram_id: string | null
  join_date: string | null
  resign_date: string | null
  memo: string | null
  color: string | null
  created_at: string
}

type Tab = 'info' | 'salary'

function calcYearsMonths(joinDate: string | null): string {
  if (!joinDate) return '-'
  const join = new Date(joinDate)
  const now = new Date()
  let years = now.getFullYear() - join.getFullYear()
  let months = now.getMonth() - join.getMonth()
  if (months < 0) { years--; months += 12 }
  if (years === 0 && months === 0) return '신규'
  if (years === 0) return `${months}개월`
  if (months === 0) return `${years}년`
  return `${years}년 ${months}개월`
}

function calcTotalLeave(joinDate: string | null): number {
  if (!joinDate) return 0
  const join = new Date(joinDate)
  const now = new Date()
  const diffMs = now.getTime() - join.getTime()
  const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth())
  if (diffMs < 0) return 0
  if (diffMonths < 12) return Math.min(diffMonths, 11)
  const years = Math.floor(diffMonths / 12)
  return Math.min(15 + Math.floor((years - 1) / 2), 25)
}

export default function StaffPage() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Staff | null>(null)
  const [detailItem, setDetailItem] = useState<Staff | null>(null)
  const [tab, setTab] = useState<Tab>('info')

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('staff').select('*').order('created_at')
    if (!error && data) setStaffList(data)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = async (staff: Staff) => {
    if (!confirm(`"${staff.name}" 직원을 삭제하시겠습니까?\n관련된 지출결의서, 연차 등 데이터에 영향을 줄 수 있습니다.`)) return
    await supabase.from('staff').delete().eq('id', staff.id)
    if (detailItem?.id === staff.id) setDetailItem(null)
    loadData()
  }

  const activeStaff = staffList.filter(s => !s.resign_date)
  const resignedStaff = staffList.filter(s => !!s.resign_date)
  const totalSalary = activeStaff.reduce((s, st) => s + (st.salary || 0), 0)

  if (loading) return <div className="p-6 max-w-[1200px] mx-auto"><div className="text-center py-20 text-txt-tertiary">불러오는 중...</div></div>

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">직원관리</h1>
          <div className="flex bg-surface-secondary rounded-lg p-0.5">
            <button onClick={() => setTab('info')}
              className={`px-4 py-1.5 text-sm rounded-md transition ${tab === 'info' ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-tertiary'}`}>
              직원정보
            </button>
            <button onClick={() => setTab('salary')}
              className={`px-4 py-1.5 text-sm rounded-md transition ${tab === 'salary' ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-tertiary'}`}>
              연봉/고정비
            </button>
          </div>
        </div>
        <button onClick={() => { setEditItem(null); setShowModal(true) }}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover">
          + 직원 등록
        </button>
      </div>

      {/* === 직원정보 탭 === */}
      {tab === 'info' && (
        <>
          {/* 테이블 */}
          <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
            {staffList.length === 0 ? (
              <div className="text-center py-16 text-txt-quaternary text-sm">등록된 직원이 없습니다</div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-surface-secondary border-b border-border-primary">
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">이름</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">직책</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">직급</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">연락처</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">입사일</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">근속</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">연차</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">상태</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-secondary">
                  {staffList.map(s => {
                    const isResigned = !!s.resign_date
                    return (
                      <tr key={s.id} className={`hover:bg-surface-tertiary cursor-pointer ${isResigned ? 'opacity-50' : ''}`}
                        onClick={() => setDetailItem(s)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                              style={{ backgroundColor: s.color || '#94a3b8' }}>
                              {s.name.charAt(0)}
                            </div>
                            <span className="font-medium text-txt-primary">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-txt-secondary">{s.role}</td>
                        <td className="px-4 py-3 text-[13px] text-txt-secondary">{s.position || '-'}</td>
                        <td className="px-4 py-3 text-[13px] text-txt-secondary">{s.phone || '-'}</td>
                        <td className="px-4 py-3 text-[13px] text-txt-secondary">{s.join_date || '-'}</td>
                        <td className="px-4 py-3 text-[13px] text-txt-tertiary">{calcYearsMonths(s.join_date)}</td>
                        <td className="px-4 py-3 text-center text-[13px] text-txt-secondary">{isResigned ? '-' : `${calcTotalLeave(s.join_date)}일`}</td>
                        <td className="px-4 py-3">
                          {isResigned ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-secondary text-txt-tertiary">퇴사</span>
                          ) : (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#d1fae5] text-[#065f46]">재직</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setEditItem(s); setShowModal(true) }}
                            className="text-[11px] px-2 py-1 text-txt-tertiary hover:text-link hover:bg-[#eef2ff] rounded">수정</button>
                          <button onClick={() => handleDelete(s)}
                            className="text-[11px] px-2 py-1 text-txt-quaternary hover:text-red-500 hover:bg-red-50 rounded">삭제</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* 상세 패널 */}
          {detailItem && (
            <DetailPanel staff={detailItem} onClose={() => setDetailItem(null)}
              onEdit={() => { setEditItem(detailItem); setShowModal(true) }} />
          )}
        </>
      )}

      {/* === 연봉/고정비 탭 === */}
      {tab === 'salary' && (
        <>
          {/* 요약 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-surface rounded-[10px] border border-border-primary p-4">
              <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">재직 인원</p>
              <p className="text-xl font-semibold text-txt-primary">{activeStaff.length}명</p>
            </div>
            <div className="bg-surface rounded-[10px] border border-border-primary p-4">
              <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">월 인건비 합계</p>
              <p className="text-xl font-semibold text-txt-primary tabular-nums">{Math.round(totalSalary / 12).toLocaleString()}원</p>
              <p className="text-[11px] text-txt-tertiary">연봉 기준 / 12</p>
            </div>
            <div className="bg-surface rounded-[10px] border border-border-primary p-4">
              <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">연 인건비 합계</p>
              <p className="text-xl font-semibold text-txt-primary tabular-nums">{totalSalary.toLocaleString()}원</p>
            </div>
          </div>

          {/* 연봉 테이블 */}
          <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-surface-secondary border-b border-border-primary">
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">이름</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">직책</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">직급</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">연봉</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">월급 (세전)</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">계좌</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">입사일</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-secondary">
                {activeStaff.map(s => (
                  <tr key={s.id} className="hover:bg-surface-tertiary">
                    <td className="px-4 py-3 font-medium text-txt-primary">{s.name}</td>
                    <td className="px-4 py-3 text-[13px] text-txt-secondary">{s.role}</td>
                    <td className="px-4 py-3 text-[13px] text-txt-secondary">{s.position || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium text-txt-primary tabular-nums">
                      {s.salary ? `${s.salary.toLocaleString()}원` : <span className="text-txt-quaternary">미등록</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] text-txt-tertiary tabular-nums">
                      {s.salary ? `${Math.round(s.salary / 12).toLocaleString()}원` : '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-txt-tertiary">
                      {s.bank_name && s.bank_account ? `${s.bank_name} ${s.bank_account}` : <span className="text-txt-quaternary">미등록</span>}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-txt-tertiary">{s.join_date || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => { setEditItem(s); setShowModal(true) }}
                        className="text-[11px] px-2 py-1 text-txt-tertiary hover:text-link hover:bg-[#eef2ff] rounded">수정</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-secondary border-t border-border-primary">
                  <td colSpan={3} className="px-4 py-2.5 text-sm font-medium text-txt-secondary">합계</td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold text-txt-primary tabular-nums">{totalSalary.toLocaleString()}원</td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold text-txt-secondary tabular-nums">{Math.round(totalSalary / 12).toLocaleString()}원</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 고정비 바로가기 */}
          <Link href="/expenses"
            className="block bg-surface rounded-[10px] border border-border-primary p-4 hover:bg-surface-tertiary transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">고정지출 관리</p>
                <p className="text-[11px] text-txt-tertiary mt-0.5">임대료, 보험료, 통신비 등 매월 고정 지출 관리</p>
              </div>
              <span className="text-txt-tertiary text-sm">&rarr;</span>
            </div>
          </Link>

          {/* 퇴사자 */}
          {resignedStaff.length > 0 && (
            <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
              <div className="px-4 py-3 border-b border-border-tertiary">
                <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-tertiary">퇴사자 ({resignedStaff.length}명)</h3>
              </div>
              <table className="w-full text-[13px]">
                <tbody className="divide-y divide-surface-secondary">
                  {resignedStaff.map(s => (
                    <tr key={s.id} className="text-txt-tertiary">
                      <td className="px-4 py-2.5">{s.name}</td>
                      <td className="px-4 py-2.5">{s.role}</td>
                      <td className="px-4 py-2.5">{s.position || '-'}</td>
                      <td className="px-4 py-2.5">입사: {s.join_date || '-'}</td>
                      <td className="px-4 py-2.5">퇴사: {s.resign_date}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => { setEditItem(s); setShowModal(true) }}
                          className="text-[11px] px-2 py-1 hover:text-link hover:bg-[#eef2ff] rounded">수정</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* 모달 */}
      {showModal && (
        <StaffModal
          item={editItem}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSaved={() => { setShowModal(false); setEditItem(null); loadData() }}
        />
      )}
    </div>
  )
}

// ===== 상세 패널 =====
function DetailPanel({ staff, onClose, onEdit }: { staff: Staff; onClose: () => void; onEdit: () => void }) {
  const totalLeave = calcTotalLeave(staff.join_date)
  const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="flex py-2 border-b border-surface-secondary">
      <span className="w-24 shrink-0 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">{label}</span>
      <span className="text-[13px] text-txt-primary">{value || '-'}</span>
    </div>
  )
  return (
    <div className="bg-surface rounded-[10px] border border-border-primary p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-semibold text-white"
            style={{ backgroundColor: staff.color || '#94a3b8' }}>
            {staff.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-txt-primary">{staff.name}</h3>
              <span className="text-[11px] px-2 py-0.5 rounded bg-surface-secondary text-txt-tertiary">{staff.role}</span>
              {staff.position && <span className="text-[11px] px-2 py-0.5 rounded bg-surface-secondary text-txt-tertiary">{staff.position}</span>}
            </div>
            <p className="text-[11px] text-txt-tertiary mt-0.5">
              {staff.join_date && `${staff.join_date} 입사`} {staff.join_date && `(${calcYearsMonths(staff.join_date)})`}
              {!staff.resign_date && staff.join_date && ` / 연차 ${totalLeave}일`}
              {staff.resign_date && ` / ${staff.resign_date} 퇴사`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="text-xs px-3 py-1.5 text-link hover:bg-[#eef2ff] rounded-lg">수정</button>
          <button onClick={onClose} className="text-txt-tertiary hover:text-txt-secondary">&times;</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-2">기본 정보</p>
          <Row label="연락처" value={staff.phone} />
          <Row label="이메일" value={staff.email} />
          <Row label="생년월일" value={staff.birth_date} />
          <Row label="주소" value={staff.address} />
          <Row label="Telegram" value={staff.telegram_id} />
          <div className="flex py-2 border-b border-surface-secondary">
            <span className="w-24 shrink-0 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">캘린더 색깔</span>
            <div className="w-5 h-5 rounded-full" style={{ backgroundColor: staff.color || '#94a3b8' }} />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-2">근무/급여 정보</p>
          <Row label="입사일" value={staff.join_date} />
          <Row label="퇴사일" value={staff.resign_date} />
          <Row label="연봉" value={staff.salary ? `${staff.salary.toLocaleString()}원` : null} />
          <Row label="급여계좌" value={staff.bank_name && staff.bank_account ? `${staff.bank_name} ${staff.bank_account}` : null} />
          <Row label="비상연락처" value={staff.emergency_contact ? `${staff.emergency_contact} ${staff.emergency_phone || ''}` : null} />
        </div>
      </div>
      {staff.memo && (
        <div className="mt-3 pt-3 border-t border-border-tertiary">
          <p className="text-[11px] text-txt-tertiary mb-1">메모</p>
          <p className="text-[13px] text-txt-secondary whitespace-pre-wrap">{staff.memo}</p>
        </div>
      )}
    </div>
  )
}

// ===== 직원 등록/수정 모달 =====
function StaffModal({ item, onClose, onSaved }: { item: Staff | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item
  const [name, setName] = useState(item?.name || '')
  const [phone, setPhone] = useState(item?.phone || '')
  const [role, setRole] = useState(item?.role || '직원')
  const [position, setPosition] = useState(item?.position || '')
  const [email, setEmail] = useState(item?.email || '')
  const [birthDate, setBirthDate] = useState(item?.birth_date || '')
  const [address, setAddress] = useState(item?.address || '')
  const [emergencyContact, setEmergencyContact] = useState(item?.emergency_contact || '')
  const [emergencyPhone, setEmergencyPhone] = useState(item?.emergency_phone || '')
  const [bankName, setBankName] = useState(item?.bank_name || '')
  const [bankAccount, setBankAccount] = useState(item?.bank_account || '')
  const [salary, setSalary] = useState(item?.salary?.toString() || '')
  const [joinDate, setJoinDate] = useState(item?.join_date || '')
  const [resignDate, setResignDate] = useState(item?.resign_date || '')
  const [telegramId, setTelegramId] = useState(item?.telegram_id || '')
  const [memo, setMemo] = useState(item?.memo || '')
  const [color, setColor] = useState(item?.color || '#5e6ad2')
  const [saving, setSaving] = useState(false)

  const PRESET_COLORS = ['#5e6ad2', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

  const formatPhone = (v: string) => {
    const num = v.replace(/[^0-9]/g, '')
    if (num.length <= 3) return num
    if (num.length <= 7) return `${num.slice(0, 3)}-${num.slice(3)}`
    return `${num.slice(0, 3)}-${num.slice(3, 7)}-${num.slice(7, 11)}`
  }

  const formatSalary = (v: string) => {
    const num = v.replace(/[^0-9]/g, '')
    return num ? parseInt(num).toLocaleString() : ''
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      phone: phone || null,
      role,
      position: position || null,
      email: email || null,
      birth_date: birthDate || null,
      address: address || null,
      emergency_contact: emergencyContact || null,
      emergency_phone: emergencyPhone || null,
      bank_name: bankName || null,
      bank_account: bankAccount || null,
      salary: salary ? parseInt(salary.replace(/,/g, '')) : null,
      join_date: joinDate || null,
      resign_date: resignDate || null,
      telegram_id: telegramId || null,
      memo: memo || null,
      color: color || null,
    }
    if (isEdit && item) {
      await supabase.from('staff').update(payload).eq('id', item.id)
    } else {
      await supabase.from('staff').insert(payload)
    }
    setSaving(false)
    onSaved()
  }

  const inputCls = "w-full text-[13px] h-[36px] border border-border-primary rounded-lg px-3 py-2 focus:ring-1 focus:border-accent focus:ring-accent focus:outline-none"
  const labelCls = "block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1"

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-[10px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border-tertiary flex items-center justify-between sticky top-0 bg-surface z-10">
          <h3 className="font-semibold text-txt-primary">{isEdit ? '직원 수정' : '직원 등록'}</h3>
          <button onClick={onClose} className="text-txt-tertiary hover:text-txt-secondary text-lg">&times;</button>
        </div>
        <div className="p-5 space-y-5">
          {/* 기본정보 */}
          <div>
            <p className="text-[11px] font-semibold text-txt-secondary mb-3 pb-1 border-b border-border-tertiary">기본정보</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>이름 *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>연락처</label>
                <input value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>직책</label>
                <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
                  <option value="관리자">관리자</option>
                  <option value="직원">직원</option>
                  <option value="현장소장">현장소장</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>직급</label>
                <input value={position} onChange={e => setPosition(e.target.value)} placeholder="대리, 과장, 부장 등" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>이메일</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@email.com" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>생년월일</label>
                <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelCls}>주소</label>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="주소" className={inputCls} />
            </div>
            <div className="mt-3">
              <label className={labelCls}>캘린더 색깔</label>
              <div className="flex items-center gap-2 mt-1">
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-accent scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>

          {/* 비상연락처 */}
          <div>
            <p className="text-[11px] font-semibold text-txt-secondary mb-3 pb-1 border-b border-border-tertiary">비상연락처</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>비상연락인 (관계)</label>
                <input value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} placeholder="홍부모 (부)" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>비상연락처</label>
                <input value={emergencyPhone} onChange={e => setEmergencyPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" className={inputCls} />
              </div>
            </div>
          </div>

          {/* 근무정보 */}
          <div>
            <p className="text-[11px] font-semibold text-txt-secondary mb-3 pb-1 border-b border-border-tertiary">근무정보</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>입사일</label>
                <input type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} className={inputCls} />
                {joinDate && (
                  <p className="mt-1 text-[11px] text-txt-tertiary">
                    근속 {calcYearsMonths(joinDate)} / 연차 {calcTotalLeave(joinDate)}일
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls}>퇴사일</label>
                <input type="date" value={resignDate} onChange={e => setResignDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* 급여정보 */}
          <div>
            <p className="text-[11px] font-semibold text-txt-secondary mb-3 pb-1 border-b border-border-tertiary">급여정보</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>연봉 (원)</label>
                <input value={salary ? formatSalary(salary) : ''} onChange={e => setSalary(e.target.value.replace(/,/g, ''))}
                  placeholder="30,000,000" className={inputCls} />
                {salary && (
                  <p className="mt-1 text-[11px] text-txt-tertiary tabular-nums">
                    월 {Math.round(parseInt(salary.replace(/,/g, '')) / 12).toLocaleString()}원 (세전)
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls}>급여은행</label>
                <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="국민은행" className={inputCls} />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelCls}>급여계좌</label>
              <input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="000-000000-00-000" className={inputCls} />
            </div>
          </div>

          {/* 기타 */}
          <div>
            <p className="text-[11px] font-semibold text-txt-secondary mb-3 pb-1 border-b border-border-tertiary">기타</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Telegram ID</label>
                <input value={telegramId} onChange={e => setTelegramId(e.target.value)} placeholder="@username" className={inputCls} />
              </div>
              <div></div>
            </div>
            <div className="mt-3">
              <label className={labelCls}>메모</label>
              <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} placeholder="특이사항, 자격증 등"
                className={`${inputCls} h-auto resize-none`} />
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border-tertiary flex justify-end gap-2 sticky bottom-0 bg-surface">
          <button onClick={onClose} className="px-4 py-2 text-sm text-txt-secondary border border-border-primary rounded-lg hover:bg-surface-tertiary">취소</button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 font-medium">
            {saving ? '저장 중...' : isEdit ? '수정' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
