'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { calcTotalLeave } from '@/lib/utils/leave'
import { formatPhone, formatMoney } from '@/lib/utils/format'
import { generateInviteCode } from '@/lib/staff/inviteCode'
import { STAFF_COLOR_PALETTE, isValidHex, normalizeHex } from '@/lib/staff-colors'

interface Staff {
  id: string
  name: string
  phone: string | null           // 호환성 유지 (기존 데이터)
  work_phone: string | null      // 업무용 연락처 (회사폰)
  personal_phone: string | null  // 개인 연락처
  employee_no: string | null     // 사번
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
  // 4대보험
  ins_pension: boolean | null
  ins_health: boolean | null
  ins_employment: boolean | null
  ins_industrial: boolean | null
  // 텔레그램 연결
  telegram_chat_id: string | null
  telegram_linked_at: string | null
  join_date: string | null
  resign_date: string | null
  memo: string | null
  color: string | null
  created_at: string
}

interface StaffAttachment {
  id: string
  staff_id: string
  doc_type: 'salary_contract' | 'bank_account' | 'id_card'
  file_url: string
  file_name: string | null
  uploaded_at: string
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

// calcTotalLeave → src/lib/utils/leave.ts

export default function StaffPage() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
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
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInviteModal(true)}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover">
            + 직원 초대
          </button>
        </div>
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
                    <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">📱</th>
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
                        <td className="px-4 py-3 text-[13px] text-txt-secondary">{s.work_phone || s.phone || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          {s.telegram_chat_id ? (
                            <span className="inline-flex items-center gap-0.5 text-[11px] text-[#059669]" title={`연결됨 ${s.telegram_linked_at ? '· ' + s.telegram_linked_at.slice(0,10) : ''}`}>
                              ✓
                            </span>
                          ) : (
                            <span className="text-[11px] text-txt-quaternary" title="미연결">—</span>
                          )}
                        </td>
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

      {/* 수정 모달 */}
      {showModal && (
        <StaffModal
          item={editItem}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSaved={() => { setShowModal(false); setEditItem(null); loadData() }}
        />
      )}

      {/* 초대 모달 */}
      {showInviteModal && (
        <InviteModal onClose={() => setShowInviteModal(false)} />
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
          <Row label="사번" value={staff.employee_no} />
          <Row label="업무 연락처" value={staff.work_phone || staff.phone} />
          <Row label="개인 연락처" value={staff.personal_phone} />
          <Row label="이메일" value={staff.email} />
          <Row label="생년월일" value={staff.birth_date} />
          <Row label="주소" value={staff.address} />
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
          <div className="flex py-2 border-b border-surface-secondary">
            <span className="w-24 shrink-0 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">4대보험</span>
            <div className="text-[12px] text-txt-secondary flex gap-2 flex-wrap">
              {staff.ins_pension && <span className="px-1.5 py-0.5 bg-[#eff6ff] text-[#1e40af] rounded">국민</span>}
              {staff.ins_health && <span className="px-1.5 py-0.5 bg-[#eff6ff] text-[#1e40af] rounded">건강</span>}
              {staff.ins_employment && <span className="px-1.5 py-0.5 bg-[#eff6ff] text-[#1e40af] rounded">고용</span>}
              {staff.ins_industrial && <span className="px-1.5 py-0.5 bg-[#eff6ff] text-[#1e40af] rounded">산재</span>}
              {!staff.ins_pension && !staff.ins_health && !staff.ins_employment && !staff.ins_industrial && (
                <span className="text-txt-quaternary">미가입</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 첨부 파일 섹션 */}
      <StaffAttachmentsSection staffId={staff.id} />

      {staff.memo && (
        <div className="mt-3 pt-3 border-t border-border-tertiary">
          <p className="text-[11px] text-txt-tertiary mb-1">메모</p>
          <p className="text-[13px] text-txt-secondary whitespace-pre-wrap">{staff.memo}</p>
        </div>
      )}
    </div>
  )
}

// ===== 직원 첨부 파일 섹션 (연봉계약서/통장사본/신분증사본) =====
const DOC_LABELS: Record<StaffAttachment['doc_type'], string> = {
  salary_contract: '연봉 계약서',
  bank_account: '통장 사본',
  id_card: '신분증 사본',
}
const DOC_TYPES: StaffAttachment['doc_type'][] = ['salary_contract', 'bank_account', 'id_card']

function StaffAttachmentsSection({ staffId }: { staffId: string }) {
  const [atts, setAtts] = useState<StaffAttachment[]>([])
  const [tableMissing, setTableMissing] = useState(false)
  const [uploadingType, setUploadingType] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('staff_attachments').select('*').eq('staff_id', staffId)
    if (error) {
      if (/does not exist|relation/.test(error.message)) setTableMissing(true)
      setAtts([])
      return
    }
    setTableMissing(false)
    setAtts((data as StaffAttachment[]) || [])
  }, [staffId])

  useEffect(() => { load() }, [load])

  const handleUpload = async (docType: StaffAttachment['doc_type'], file: File) => {
    if (tableMissing) return
    setUploadingType(docType)
    try {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `staff/${staffId}/${docType}_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
      if (upErr) { alert('업로드 실패: ' + upErr.message); return }
      const { data: pub } = supabase.storage.from('attachments').getPublicUrl(path)
      // 기존 같은 타입 있으면 삭제 후 교체
      const existing = atts.find(a => a.doc_type === docType)
      if (existing) {
        await supabase.from('staff_attachments').delete().eq('id', existing.id)
      }
      await supabase.from('staff_attachments').insert({
        staff_id: staffId, doc_type: docType,
        file_url: pub.publicUrl, file_name: file.name,
      })
      load()
    } finally {
      setUploadingType(null)
    }
  }

  const handleDelete = async (att: StaffAttachment) => {
    if (!confirm(`${DOC_LABELS[att.doc_type]}을 삭제하시겠습니까?`)) return
    await supabase.from('staff_attachments').delete().eq('id', att.id)
    load()
  }

  if (tableMissing) {
    return (
      <div className="mt-4 pt-4 border-t border-border-tertiary">
        <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-2">첨부 파일</p>
        <div className="text-[11px] text-txt-quaternary bg-surface-tertiary/40 rounded-lg p-3">
          DB 준비 필요 — Supabase SQL Editor에서{' '}
          <code className="px-1 py-0.5 bg-surface-secondary rounded">sql/migration_calendar_sites_staff.sql</code> 실행해주세요.
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-border-tertiary">
      <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-2">첨부 파일</p>
      <div className="grid grid-cols-3 gap-3">
        {DOC_TYPES.map(doc => {
          const existing = atts.find(a => a.doc_type === doc)
          const isUploading = uploadingType === doc
          return (
            <div key={doc} className="border border-border-primary rounded-lg p-3 bg-surface">
              <div className="text-[11px] font-medium text-txt-secondary mb-2">{DOC_LABELS[doc]}</div>
              {existing ? (
                <div>
                  <div className="text-[11px] text-txt-primary truncate mb-1.5" title={existing.file_name || ''}>
                    📄 {existing.file_name || '첨부됨'}
                  </div>
                  <div className="flex gap-1">
                    <a href={existing.file_url} target="_blank" rel="noreferrer"
                      className="text-[10px] px-2 py-0.5 bg-[#eff6ff] text-[#1e40af] rounded hover:bg-[#dbeafe]">열기</a>
                    <label className="text-[10px] px-2 py-0.5 bg-surface-tertiary text-txt-secondary rounded hover:bg-surface-secondary cursor-pointer">
                      교체
                      <input type="file" className="hidden" onChange={e => {
                        const f = e.target.files?.[0]; if (f) handleUpload(doc, f)
                      }} />
                    </label>
                    <button onClick={() => handleDelete(existing)}
                      className="text-[10px] px-2 py-0.5 bg-[#fef2f2] text-[#dc2626] rounded hover:bg-[#fee2e2]">삭제</button>
                  </div>
                </div>
              ) : (
                <label className="block cursor-pointer border border-dashed border-border-primary rounded p-3 text-center text-[11px] text-txt-quaternary hover:border-accent hover:text-accent transition-colors">
                  {isUploading ? '업로드 중...' : '+ 파일 선택'}
                  <input type="file" className="hidden" onChange={e => {
                    const f = e.target.files?.[0]; if (f) handleUpload(doc, f)
                  }} />
                </label>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ===== 직원 수정 모달 =====
function StaffModal({ item, onClose, onSaved }: { item: Staff | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item
  const [name, setName] = useState(item?.name || '')
  const [employeeNo, setEmployeeNo] = useState(item?.employee_no || '')
  const [workPhone, setWorkPhone] = useState(item?.work_phone || item?.phone || '')
  const [personalPhone, setPersonalPhone] = useState(item?.personal_phone || '')
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
  // 상태: resign_date 기반으로 자동 판정
  const [status, setStatus] = useState<'재직' | '퇴사'>(item?.resign_date ? '퇴사' : '재직')
  // 4대보험
  const [insPension, setInsPension] = useState(item?.ins_pension ?? false)
  const [insHealth, setInsHealth] = useState(item?.ins_health ?? false)
  const [insEmployment, setInsEmployment] = useState(item?.ins_employment ?? false)
  const [insIndustrial, setInsIndustrial] = useState(item?.ins_industrial ?? false)
  const [memo, setMemo] = useState(item?.memo || '')
  const [color, setColor] = useState(item?.color || '#5e6ad2')
  const [saving, setSaving] = useState(false)

  const PRESET_COLORS = STAFF_COLOR_PALETTE // 공통 팔레트 (src/lib/staff-colors.ts)
  const [hexInput, setHexInput] = useState(item?.color || '#5e6ad2')

  // 색상 변경 시 hex 입력도 동기화
  const handleColorChange = (v: string) => {
    setColor(v)
    setHexInput(v)
  }
  // hex 입력 → 유효하면 color 적용
  const handleHexInputChange = (v: string) => {
    setHexInput(v)
    const trimmed = v.trim()
    if (isValidHex(trimmed)) setColor(normalizeHex(trimmed))
  }

  const formatSalary = (v: string) => formatMoney(v)

  // 상태 재직 → 퇴사 변경 시 resign_date 자동
  const handleStatusChange = (next: '재직' | '퇴사') => {
    setStatus(next)
    if (next === '퇴사' && !resignDate) {
      setResignDate(new Date().toISOString().slice(0, 10))
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const payload: Record<string, unknown> = {
      name: name.trim(),
      phone: workPhone || null,          // 호환성: 기존 phone 컬럼도 업무폰으로 유지
      work_phone: workPhone || null,
      personal_phone: personalPhone || null,
      employee_no: employeeNo || null,
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
      resign_date: status === '퇴사' ? (resignDate || new Date().toISOString().slice(0, 10)) : (resignDate || null),
      ins_pension: insPension,
      ins_health: insHealth,
      ins_employment: insEmployment,
      ins_industrial: insIndustrial,
      memo: memo || null,
      color: color || null,
    }

    const tryUpdate = async (p: Record<string, unknown>) => {
      if (isEdit && item) return supabase.from('staff').update(p).eq('id', item.id)
      return supabase.from('staff').insert(p)
    }

    const { error } = await tryUpdate(payload)
    if (error) {
      // 신규 컬럼 미존재 시 legacy payload로 fallback
      const msg = error.message
      if (/work_phone|personal_phone|employee_no|ins_pension|ins_health|ins_employment|ins_industrial/.test(msg)) {
        const legacy = { ...payload }
        delete legacy.work_phone; delete legacy.personal_phone; delete legacy.employee_no
        delete legacy.ins_pension; delete legacy.ins_health; delete legacy.ins_employment; delete legacy.ins_industrial
        await tryUpdate(legacy)
      }
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
                <label className={labelCls}>사번</label>
                <input value={employeeNo} onChange={e => setEmployeeNo(e.target.value)} placeholder="D2026-001" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>업무 연락처 (회사폰)</label>
                <input value={workPhone} onChange={e => setWorkPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>개인 연락처</label>
                <input value={personalPhone} onChange={e => setPersonalPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" className={inputCls} />
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
              {/* 현재 선택된 색상 프리뷰 */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full border border-border-primary" style={{ backgroundColor: color }} />
                <span className="text-[12px] font-mono text-txt-secondary tabular-nums">{color}</span>
              </div>
              {/* 프리셋 48색 팔레트 */}
              <div className="grid grid-cols-12 gap-1.5 mt-1">
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => handleColorChange(c)}
                    title={c}
                    className={`w-6 h-6 rounded-md transition-all ${color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-offset-1 ring-accent scale-110' : 'hover:scale-110 hover:ring-1 hover:ring-border-secondary'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              {/* 자유 선택: 네이티브 피커 + hex 직접 입력 */}
              <div className="flex items-center gap-2 mt-3">
                <input type="color" value={color} onChange={e => handleColorChange(e.target.value)}
                  className="w-9 h-9 rounded-md cursor-pointer border border-border-primary p-0.5"
                  title="색상 피커" />
                <input
                  type="text"
                  value={hexInput}
                  onChange={e => handleHexInputChange(e.target.value)}
                  placeholder="#RRGGBB"
                  maxLength={7}
                  className="w-28 h-9 px-2 border border-border-primary rounded-md text-[12px] font-mono tabular-nums focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
                <span className="text-[11px] text-txt-quaternary">hex 직접 입력 가능</span>
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
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>상태</label>
                <select value={status} onChange={e => handleStatusChange(e.target.value as '재직' | '퇴사')} className={inputCls}>
                  <option value="재직">재직</option>
                  <option value="퇴사">퇴사</option>
                </select>
              </div>
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
                <label className={labelCls}>퇴사일 {status === '퇴사' && <span className="text-[10px] text-accent">(자동)</span>}</label>
                <input type="date" value={resignDate} onChange={e => setResignDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* 4대보험 */}
          <div>
            <p className="text-[11px] font-semibold text-txt-secondary mb-3 pb-1 border-b border-border-tertiary">4대보험</p>
            <div className="flex flex-wrap gap-2">
              {([
                { label: '국민연금', value: insPension, setter: setInsPension },
                { label: '건강보험', value: insHealth, setter: setInsHealth },
                { label: '고용보험', value: insEmployment, setter: setInsEmployment },
                { label: '산재보험', value: insIndustrial, setter: setInsIndustrial },
              ] as const).map(item => (
                <label key={item.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] cursor-pointer transition-colors ${
                  item.value ? 'border-accent bg-accent/10 text-accent font-medium' : 'border-border-primary text-txt-secondary hover:border-accent'
                }`}>
                  <input type="checkbox" checked={item.value} onChange={e => item.setter(e.target.checked)} className="sr-only" />
                  <span>{item.value ? '☑' : '☐'}</span>
                  {item.label}
                </label>
              ))}
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
            <div>
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

// ===== 직원 초대 모달 =====
function InviteModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('직원')
  const [daysValid, setDaysValid] = useState(7)
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)

  const handleGenerate = async () => {
    setSaving(true)
    const code = generateInviteCode(6)
    const expires_at = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from('staff_invitations').insert({
      code, name: name.trim() || null, role, expires_at,
    })
    if (error) {
      if (/does not exist|relation/.test(error.message)) {
        setTableMissing(true)
      } else {
        alert('초대 코드 생성 실패: ' + error.message)
      }
      setSaving(false)
      return
    }
    setGeneratedCode(code)
    setSaving(false)
  }

  const handleCopy = () => {
    if (!generatedCode) return
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://dawoo-erp-web.vercel.app'
    const msg = `[다우건설 ERP 초대]\n${name ? `${name}님, ` : ''}다우건설 ERP 직원 초대 코드입니다.\n\n초대 코드: ${generatedCode}\n\n아래 링크로 접속 후 코드를 입력해주세요.\n${baseUrl}/invite/${generatedCode}`
    navigator.clipboard.writeText(msg)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-[10px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border-tertiary flex items-center justify-between">
          <h3 className="font-semibold text-txt-primary">직원 초대</h3>
          <button onClick={onClose} className="text-txt-tertiary hover:text-txt-secondary text-lg">&times;</button>
        </div>

        {tableMissing ? (
          <div className="p-5">
            <p className="text-[13px] text-txt-secondary leading-relaxed">
              DB 준비가 필요합니다. Supabase SQL Editor에서{' '}
              <code className="px-1 py-0.5 bg-surface-tertiary rounded text-[11px]">sql/migration_calendar_sites_staff.sql</code>{' '}
              을 실행해주세요.
            </p>
          </div>
        ) : !generatedCode ? (
          <div className="p-5 space-y-4">
            <p className="text-[12px] text-txt-secondary leading-relaxed">
              초대 코드를 생성해서 카톡/문자로 전달하면, 받은 직원이 본인 정보를 직접 등록합니다.
            </p>
            <div>
              <label className="block text-[11px] font-medium text-txt-tertiary mb-1">이름 (선택)</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" className="w-full h-[36px] border border-border-primary rounded-lg px-3 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-txt-tertiary mb-1">직책</label>
                <select value={role} onChange={e => setRole(e.target.value)} className="w-full h-[36px] border border-border-primary rounded-lg px-3 text-[13px]">
                  <option value="관리자">관리자</option>
                  <option value="직원">직원</option>
                  <option value="현장소장">현장소장</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-txt-tertiary mb-1">유효기간</label>
                <select value={daysValid} onChange={e => setDaysValid(parseInt(e.target.value))} className="w-full h-[36px] border border-border-primary rounded-lg px-3 text-[13px]">
                  <option value={1}>1일</option>
                  <option value={3}>3일</option>
                  <option value={7}>7일</option>
                  <option value={30}>30일</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-txt-secondary border border-border-primary rounded-lg hover:bg-surface-tertiary">취소</button>
              <button onClick={handleGenerate} disabled={saving}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 font-medium">
                {saving ? '생성 중...' : '초대 코드 생성'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <p className="text-[12px] text-txt-secondary">
              초대 코드가 생성되었습니다. 아래 코드를 카톡/문자로 전달해주세요.
            </p>
            <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-lg p-4 text-center">
              <div className="text-[11px] text-[#1e40af] mb-1">초대 코드</div>
              <div className="text-[32px] font-bold text-[#1e40af] tabular-nums tracking-wider">{generatedCode}</div>
              <div className="text-[11px] text-[#1e40af]/70 mt-1">{daysValid}일간 유효</div>
            </div>
            <button onClick={handleCopy}
              className="w-full py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover">
              {copied ? '✓ 복사됨' : '📋 전체 메시지 복사 (카톡 발송용)'}
            </button>
            <div className="text-[11px] text-txt-tertiary leading-relaxed bg-surface-tertiary/40 p-3 rounded-lg">
              💡 나중에 카톡 API 연동 예정. 지금은 복사 후 수동 전달.
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-txt-secondary border border-border-primary rounded-lg hover:bg-surface-tertiary">닫기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
