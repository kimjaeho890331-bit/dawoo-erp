'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Trash2, Upload, FileText, Image, X, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { updateProjectStatus } from '@/lib/api/projects'
import { formatPhone, formatMoney, parseMoney } from '@/lib/utils/format'

interface Payment {
  id: string
  project_id: string
  payment_date: string | null
  amount: number
  payment_type: string
  payer_name: string | null
  memo: string | null
  created_at: string
}

interface Attachment {
  id: string
  project_id: string
  name: string
  file_path: string
  file_type: string | null
  created_at: string
}
import type { DBProject, ProjectStep } from '@/components/register/RegisterPage'

const PROGRESS_STEPS: ProjectStep[] = [
  '문의', '실사', '견적전달', '동의서', '신청서제출',
  '승인', '착공계', '공사', '완료서류제출', '입금',
]

const STEP_LABELS_SHORT = [
  '문의', '실사', '견적', '동의', '신청',
  '승인', '착공', '공사', '완료', '입금',
]

const TABS = ['기본정보', '1단계', '2단계', '3단계', '이력'] as const
type TabKey = (typeof TABS)[number]

function getStepIndex(step: string): number {
  return PROGRESS_STEPS.indexOf(step as ProjectStep)
}

interface Props {
  project: DBProject | null
  category: '소규모' | '수도'
  onClose: () => void
  onEdit?: (project: DBProject) => void
  onDelete?: (project: DBProject) => void
  onRefresh?: () => void
}

export default function ProjectDetailPanel({ project, category, onClose, onDelete, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('기본정보')
  const [editData, setEditData] = useState<Record<string, string | number | null>>({})
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [apiFieldsLocked, setApiFieldsLocked] = useState(true)
  const [statusChanging, setStatusChanging] = useState(false)
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    supabase.from('staff').select('id, name').order('name').then(({ data }) => setStaffList(data || []))
  }, [])

  useEffect(() => {
    if (project) {
      setEditData({})
      setHasChanges(false)
      setApiFieldsLocked(true)
      // 현재 단계에 맞는 탭 자동 선택
      const stepIdx = getStepIndex(project.status)
      if (stepIdx <= 0) setActiveTab('기본정보')
      else if (stepIdx <= 4) setActiveTab('1단계')
      else if (stepIdx <= 7) setActiveTab('2단계')
      else if (stepIdx <= 9) setActiveTab('3단계')
      else setActiveTab('기본정보')
    }
  }, [project])

  const updateField = useCallback((field: string, value: string | number | null) => {
    setEditData(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }, [])

  const handleSave = async () => {
    if (!project || !hasChanges) return

    // 데이터 기반 자동 단계 판정
    // approval_date = 건축물대장 사용승인일 (자동입력) → 단계 판단에 사용하지 않음
    // 동의서/승인은 수동 단계전환 버튼으로만 변경
    const calcAutoStep = (data: Record<string, unknown>): ProjectStep | null => {
      const v = (f: string) => data[f] ?? project[f as keyof DBProject]
      if (v('completion_doc_date')) return '완료서류제출'
      if (v('construction_date')) return '공사'
      if (v('contractor')) return '착공계'
      if (v('application_date')) return '신청서제출'
      if ((v('total_cost') as number) > 0) return '견적전달'
      if (v('survey_date')) return '실사'
      return null
    }
    setSaving(true)
    try {
      // 자동 단계 판정
      const merged = { ...editData }
      const autoStep = calcAutoStep(merged)
      const currentIdx = getStepIndex(project.status)
      if (autoStep) {
        const autoIdx = getStepIndex(autoStep)
        // 앞으로만 자동 전환 (뒤로는 안 감)
        if (autoIdx > currentIdx) {
          merged.status = autoStep
          // status_logs 기록
          await supabase.from('status_logs').insert({
            project_id: project.id, from_status: project.status,
            to_status: autoStep, note: '데이터 입력에 의한 자동 전환',
          })
        }
      }

      const { error } = await supabase
        .from('projects')
        .update(merged)
        .eq('id', project.id)
      if (error) throw error
      setHasChanges(false)
      setEditData({})
      onRefresh?.()
    } catch (err) {
      console.error('저장 실패:', err)
      alert('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!project) return
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id)
      if (error) throw error
      setShowDeleteConfirm(false)
      onClose()
      onDelete?.(project)
    } catch (err) {
      console.error('삭제 실패:', err)
      alert('삭제에 실패했습니다.')
    }
  }

  const handleNextStep = async () => {
    if (!project) return
    const idx = getStepIndex(project.status)
    if (idx >= PROGRESS_STEPS.length - 1) return
    const nextStatus = PROGRESS_STEPS[idx + 1]
    setStatusChanging(true)
    try {
      await updateProjectStatus(project.id, nextStatus)
      onRefresh?.()
    } catch (err) {
      console.error('단계 전환 실패:', err)
      alert('단계 전환에 실패했습니다.')
    } finally {
      setStatusChanging(false)
    }
  }

  const handlePrevStep = async () => {
    if (!project) return
    const idx = getStepIndex(project.status)
    if (idx <= 0) return
    const prevStatus = PROGRESS_STEPS[idx - 1]
    if (!confirm(`${project.status} → ${prevStatus}(으)로 되돌리시겠습니까?`)) return
    setStatusChanging(true)
    try {
      await updateProjectStatus(project.id, prevStatus)
      onRefresh?.()
    } catch (err) {
      console.error('단계 복원 실패:', err)
      alert('단계 복원에 실패했습니다.')
    } finally {
      setStatusChanging(false)
    }
  }

  if (!project) return null

  const currentStepIdx = getStepIndex(project.status)

  const getVal = (field: keyof DBProject) => {
    if (field in editData) return editData[field]
    return project[field]
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-30" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-[600px] bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.12)] z-40 flex flex-col animate-slide-in overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary">
          <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">{project.building_name || '(이름없음)'}</h2>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-[11px] font-medium text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            )}
            <button
              onClick={() => setApiFieldsLocked(prev => !prev)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
                apiFieldsLocked
                  ? 'text-txt-tertiary border border-border-primary hover:bg-surface-tertiary'
                  : 'text-accent border border-accent/30 bg-accent/5'
              }`}
            >
              {apiFieldsLocked ? '수정' : '수정중'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-1.5 text-[11px] font-medium text-[#dc2626] border border-[#fecaca] rounded-lg hover:bg-red-50 transition-colors"
            >
              삭제
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-tertiary text-txt-tertiary hover:text-txt-secondary transition-colors"
            >
              &#x2715;
            </button>
          </div>
        </div>

        {/* 프로그레스 바 + 단계 전환 */}
        <div className="px-6 py-3 border-b border-border-tertiary">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevStep}
                disabled={statusChanging || currentStepIdx <= 0}
                className="px-2 py-1 text-[10px] font-medium text-txt-tertiary border border-border-primary rounded hover:bg-surface-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← 이전
              </button>
              <span className="text-[11px] font-medium text-txt-secondary">
                {project.status} ({currentStepIdx + 1}/{PROGRESS_STEPS.length})
              </span>
            </div>
            {currentStepIdx < PROGRESS_STEPS.length - 1 && (
              <button
                onClick={handleNextStep}
                disabled={statusChanging}
                className="flex items-center gap-1 px-3 py-1 text-[11px] font-medium text-white bg-accent rounded hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {statusChanging ? '변경 중...' : (
                  <>
                    {PROGRESS_STEPS[currentStepIdx + 1]} 단계로
                    <ChevronRight size={12} />
                  </>
                )}
              </button>
            )}
          </div>
          <div className="relative">
            {/* 배경 라인 */}
            <div className="absolute top-[11px] left-3 right-3 h-[2px] bg-[#f3f4f6]" />
            {/* 진행 라인 */}
            <div
              className="absolute top-[11px] left-3 h-[2px] bg-accent transition-all"
              style={{ width: `${(currentStepIdx / (PROGRESS_STEPS.length - 1)) * 100}%` }}
            />
            {/* 단계 점 */}
            <div className="relative flex justify-between">
              {PROGRESS_STEPS.map((step, idx) => (
                <div key={step} className="flex flex-col items-center" style={{ width: '10%' }}>
                  <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-semibold transition-all ${
                    idx < currentStepIdx
                      ? 'bg-accent text-white'
                      : idx === currentStepIdx
                      ? 'bg-accent text-white shadow-md shadow-accent/20'
                      : 'bg-surface text-txt-quaternary border-2 border-[#f3f4f6]'
                  }`}>
                    {idx < currentStepIdx ? <Check size={12} className="text-white" /> : idx + 1}
                  </div>
                  <span className={`mt-1 text-[9px] leading-tight text-center whitespace-nowrap ${
                    idx === currentStepIdx
                      ? 'text-accent font-medium'
                      : idx < currentStepIdx
                      ? 'text-txt-secondary'
                      : 'text-txt-quaternary'
                  }`}>
                    {STEP_LABELS_SHORT[idx]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 상시 표시 영역 */}
        <div className="px-6 py-3 border-b border-border-tertiary bg-surface-secondary">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
            <InfoField label="빌라명" value={[(getVal('building_name') as string), (getVal('dong') as string)].filter(Boolean).join(' ') || '-'} />
            <InfoField label="담당자" value={project.staff?.name || '-'} />
            <InfoField label="주소" value={(getVal('road_address') as string) || (getVal('jibun_address') as string) || '-'} full />
            <InfoField label="호수" value={(getVal('ho') as string) || '-'} />
            <InfoField label="소유주" value={(getVal('owner_name') as string) || '-'} />
            <InfoField label="연락처" value={(getVal('owner_phone') as string) ? formatPhone(getVal('owner_phone') as string) : '-'} />
          </div>
          <div className="grid grid-cols-4 gap-3 mt-2 pt-2 border-t border-surface-tertiary">
            <MiniStat label="총공사비" value={(getVal('total_cost') as number) || 0} />
            <MiniStat label="시지원금" value={(getVal('city_support') as number) || 0} />
            <MiniStat label="자부담금" value={(getVal('self_pay') as number) || 0} />
            <MiniStat label="미수금" value={(getVal('outstanding') as number) || 0} highlight />
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-border-primary px-6">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2.5 text-[11px] font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-[1.5px] border-accent text-accent-text'
                  : 'border-b-[1.5px] border-transparent text-txt-tertiary hover:text-txt-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === '기본정보' && <TabBasicInfo project={project} getVal={getVal} onChange={updateField} apiFieldsLocked={apiFieldsLocked} />}
          {activeTab === '1단계' && <TabStep1 project={project} category={category} getVal={getVal} onChange={updateField} onRefresh={onRefresh} staffList={staffList} />}
          {activeTab === '2단계' && <TabStep2 project={project} category={category} getVal={getVal} onChange={updateField} onRefresh={onRefresh} staffList={staffList} />}
          {activeTab === '3단계' && <TabStep3 project={project} getVal={getVal} onChange={updateField} onRefresh={onRefresh} staffList={staffList} />}
          {activeTab === '이력' && <TabHistory projectId={project.id} />}
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmModal
          buildingName={project.building_name || '(이름없음)'}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.25s ease-out;
        }
      `}</style>
    </>
  )
}

// --- 상시 표시 필드 (읽기 전용) ---
function InfoField({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <span className="text-[11px] text-txt-tertiary">{label}</span>
      <p className="text-[13px] text-txt-primary">{value}</p>
    </div>
  )
}

function MiniStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-txt-tertiary">{label}</p>
      <p className={`text-[11px] font-semibold tabular-nums ${highlight && value > 0 ? 'text-[#dc2626] font-medium' : 'text-txt-secondary'}`}>
        {value > 0 ? `${value.toLocaleString()}` : '-'}
      </p>
    </div>
  )
}

// --- 편집 가능 폼 필드 (항상 편집 가능) ---
function FormInput({ label, type = 'text', placeholder, value, onChange }: {
  label: string; type?: string; placeholder?: string
  value: string | number | null | undefined
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || label}
        className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light hover:border-border-secondary transition-colors"
      />
    </div>
  )
}

// --- 금액 입력 (콤마 자동 포맷) ---
function MoneyInput({ label, value, onChange }: {
  label: string
  value: string | number | null | undefined
  onChange: (v: number) => void
}) {
  const numVal = typeof value === 'number' ? value : (Number(value) || 0)
  return (
    <div>
      <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={numVal > 0 ? formatMoney(numVal) : ''}
        onChange={e => onChange(parseMoney(e.target.value))}
        placeholder="0"
        className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] text-right tabular-nums focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light hover:border-border-secondary transition-colors"
      />
    </div>
  )
}

// --- API 필드 잠금 입력 ---
function LockedFormInput({ label, type = 'text', placeholder, value, onChange, locked }: {
  label: string; type?: string; placeholder?: string
  value: string | number | null | undefined
  onChange: (v: string) => void
  locked?: boolean
}) {
  if (locked) {
    return (
      <div>
        <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
        <p className="h-[36px] px-3 flex items-center border border-border-tertiary rounded-lg text-[13px] text-txt-secondary bg-surface-secondary">
          {value ?? '-'}
        </p>
      </div>
    )
  }
  return <FormInput label={label} type={type} placeholder={placeholder} value={value} onChange={onChange} />
}

// --- 파일 첨부 섹션 (드래그앤드롭, 미리보기, 삭제) ---
function FileAttachSection({ projectId, fileType, label }: { projectId: string; fileType: string; label: string }) {
  const [files, setFiles] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => { loadFiles() }, [projectId, fileType])

  const loadFiles = async () => {
    const { data } = await supabase.from('attachments').select('*')
      .eq('project_id', projectId).eq('file_type', fileType)
      .order('created_at', { ascending: false })
    setFiles(data || [])
  }

  const handleUpload = async (fileList: FileList | File[]) => {
    setUploading(true)
    try {
      for (const file of Array.from(fileList)) {
        const ts = Date.now()
        const filePath = `attachments/${projectId}/${fileType}/${ts}_${file.name}`
        const { error } = await supabase.storage.from('attachments').upload(filePath, file)
        if (error) { console.error('업로드 실패:', error); continue }
        await supabase.from('attachments').insert({ project_id: projectId, name: file.name, file_path: filePath, file_type: fileType })
      }
      await loadFiles()
    } catch { /* */ } finally { setUploading(false) }
  }

  const handleDelete = async (att: Attachment) => {
    if (!confirm(`${att.name} 삭제?`)) return
    await supabase.storage.from('attachments').remove([att.file_path])
    await supabase.from('attachments').delete().eq('id', att.id)
    setFiles(prev => prev.filter(f => f.id !== att.id))
    if (preview === att.id) setPreview(null)
  }

  const getUrl = (fp: string) => supabase.storage.from('attachments').getPublicUrl(fp).data.publicUrl
  const isImg = (n: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(n)

  return (
    <div className="mt-2">
      {files.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {files.map(f => (
            <div key={f.id}>
              <div className="flex items-center gap-2 p-1.5 border border-border-primary rounded-lg hover:bg-surface-secondary group">
                {isImg(f.name) ? <Image size={14} className="text-txt-tertiary" /> : <FileText size={14} className="text-txt-tertiary" />}
                <button onClick={() => setPreview(preview === f.id ? null : f.id)} className="text-[12px] text-link hover:underline truncate flex-1 text-left">{f.name}</button>
                <button onClick={() => handleDelete(f)} className="p-0.5 text-txt-quaternary hover:text-money-negative opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
              </div>
              {preview === f.id && (
                <div className="mt-1 border border-border-primary rounded-lg overflow-hidden bg-surface-secondary">
                  {isImg(f.name)
                    ? <img src={getUrl(f.file_path)} alt={f.name} className="max-h-[200px] w-full object-contain" />
                    : <iframe src={getUrl(f.file_path)} className="w-full h-[300px]" />
                  }
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <label className={`flex items-center justify-center gap-1.5 border border-dashed rounded-lg p-2 cursor-pointer transition-colors text-[11px] ${
        dragOver ? 'border-accent bg-accent/5 text-accent' : 'border-border-secondary text-txt-tertiary hover:border-accent hover:text-accent'
      }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files) }}
      >
        <Upload size={12} />
        {uploading ? '업로드 중...' : `${label} 파일 첨부`}
        <input type="file" multiple className="hidden" onChange={e => { if (e.target.files?.length) handleUpload(e.target.files) }} />
      </label>
    </div>
  )
}

// --- 제출자 드롭다운 (로그인유저 우선) ---
function StaffSelect({ label, value, onChange, staffList, currentStaffName }: {
  label: string; value: string | number | null | undefined; onChange: (v: string) => void
  staffList: { id: string; name: string }[]; currentStaffName?: string
}) {
  // 로그인 유저를 맨 위로
  const sorted = currentStaffName
    ? [
        ...staffList.filter(s => s.name === currentStaffName),
        ...staffList.filter(s => s.name !== currentStaffName),
      ]
    : staffList

  return (
    <div>
      <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
      <select
        value={(value as string) ?? ''}
        onChange={e => onChange(e.target.value)}
        className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
      >
        <option value="">선택</option>
        {sorted.map(s => (
          <option key={s.id} value={s.name}>{s.name}</option>
        ))}
      </select>
    </div>
  )
}

// --- 날짜+시간 입력 (날짜: MM/DD 표시, 시간: 24h) ---
function DateTimeInput({ label, value, onChange }: {
  label: string; value: string | number | null | undefined; onChange: (v: string) => void
}) {
  const strVal = (value as string) ?? ''
  const datePart = strVal.includes('T') ? strVal.split('T')[0] : strVal.split(' ')[0] || ''
  const timePart = strVal.includes('T') ? strVal.split('T')[1]?.substring(0, 5) || '' : strVal.split(' ')[1]?.substring(0, 5) || ''
  const [timeVal, setTimeVal] = useState(timePart)

  useEffect(() => { setTimeVal(timePart) }, [timePart])

  const updateDateTime = (date: string, time: string) => {
    if (date && time) onChange(`${date}T${time}`)
    else if (date) onChange(date)
    else onChange('')
  }

  const dateDisplay = datePart
    ? `${Number(datePart.split('-')[1])}월 ${Number(datePart.split('-')[2])}일`
    : ''

  return (
    <div>
      <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">{label}</label>
      <div className="flex items-center gap-2 h-[36px] px-3 bg-surface border border-border-primary rounded-lg hover:border-border-secondary transition-colors">
        {/* 날짜 영역 — label로 감싸서 전체 클릭 가능 */}
        <label className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer">
          <svg className="w-3.5 h-3.5 text-txt-tertiary shrink-0 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-[13px] text-txt-primary pointer-events-none">{dateDisplay || <span className="text-txt-quaternary">날짜 선택</span>}</span>
          <input type="date" value={datePart} onChange={e => updateDateTime(e.target.value, timeVal)}
            className="w-0 h-0 opacity-0 absolute" />
        </label>
        {/* 구분선 */}
        <div className="w-px h-4 bg-border-primary" />
        {/* 시간 영역 */}
        <input type="text" value={timeVal} placeholder="--:--"
          onChange={e => {
            let v = e.target.value.replace(/[^0-9:]/g, '')
            if (v.length === 2 && !v.includes(':') && timeVal.length < v.length) v += ':'
            if (v.length > 5) v = v.substring(0, 5)
            setTimeVal(v)
            if (/^\d{2}:\d{2}$/.test(v)) updateDateTime(datePart, v)
          }}
          onBlur={() => {
            const nums = timeVal.replace(/[^0-9]/g, '')
            if (nums.length >= 3) {
              const fmt = `${nums.substring(0, 2)}:${(nums.substring(2, 4) || '00').padStart(2, '0')}`
              setTimeVal(fmt)
              updateDateTime(datePart, fmt)
            }
          }}
          className="w-[48px] text-[13px] text-center tabular-nums text-[#3B82F6] font-medium bg-transparent outline-none placeholder:text-txt-quaternary placeholder:font-normal" />
      </div>
    </div>
  )
}

// --- 일정 캘린더 자동 등록 ---
interface ScheduleSyncInfo {
  projectId: string
  buildingName: string
  dateValue: string
  staffName: string
  staffId?: string
  docType: string
  address?: string
  phone?: string
}

async function syncSchedule(info: ScheduleSyncInfo) {
  const { projectId, buildingName, dateValue, staffName, staffId, docType, address, phone } = info
  if (!dateValue) return
  const dt = new Date(dateValue)
  const dateOnly = dateValue.includes('T') ? dateValue.split('T')[0] : dateValue
  const timeStr = dateValue.includes('T') ? dt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
  const title = timeStr ? `${timeStr} ${buildingName} ${docType}` : `${buildingName} ${docType}`

  // 담당자 ID 조회 (이름으로)
  let resolvedStaffId = staffId || null
  if (!resolvedStaffId && staffName) {
    const { data } = await supabase.from('staff').select('id').eq('name', staffName).single()
    if (data) resolvedStaffId = data.id
  }

  const memoLines = [staffName, address, phone].filter(Boolean).join('\n')

  await supabase.from('schedules').delete()
    .eq('project_id', projectId)
    .ilike('title', `%${buildingName}%${docType}%`)

  await supabase.from('schedules').insert({
    project_id: projectId,
    staff_id: resolvedStaffId,
    schedule_type: 'project',
    title,
    start_date: dateOnly,
    end_date: dateOnly,
    confirmed: true,
    memo: memoLines || null,
  })
}

// --- 탭별 Props ---
interface TabProps {
  project: DBProject
  getVal: (field: keyof DBProject) => string | number | null | undefined | { id: string; name: string } | { name: string } | { name: string; work_categories?: { name: string } | null }
  onChange: (field: string, value: string | number | null) => void
  apiFieldsLocked?: boolean
}

// --- 탭 1: 기본정보 ---
function TabBasicInfo({ project, getVal, onChange, apiFieldsLocked }: TabProps) {
  const [bankImage, setBankImage] = useState<string | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)

  const handleBankImageUpload = async (file: File) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string
      setBankImage(dataUrl)

      // Extract base64 data
      const base64 = dataUrl.split(',')[1]
      const mimeType = file.type || 'image/jpeg'

      setOcrLoading(true)
      try {
        const res = await fetch('/api/ocr/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, mimeType }),
        })
        const data = await res.json()
        if (data.bank_name) onChange('bank_name', data.bank_name)
        if (data.account_number) onChange('account_number', data.account_number)
        if (data.account_holder) onChange('account_holder', data.account_holder)
      } catch (err) {
        console.error('OCR failed:', err)
      } finally {
        setOcrLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">소유주/세입자</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="소유주" value={getVal('owner_name') as string} onChange={v => onChange('owner_name', v || null)} />
          <FormInput label="소유주 연락처" type="tel" value={getVal('owner_phone') as string} onChange={v => onChange('owner_phone', formatPhone(v))} />
          <FormInput label="세입자 연락처" type="tel" value={getVal('tenant_phone') as string} onChange={v => onChange('tenant_phone', formatPhone(v))} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">건축물 정보</h3>
        <div className="space-y-3">
          <LockedFormInput label="지번주소" value={getVal('jibun_address') as string} onChange={v => onChange('jibun_address', v || null)} locked={apiFieldsLocked} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <LockedFormInput label="동" placeholder="예: A동" value={getVal('dong') as string} onChange={v => onChange('dong', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="호" placeholder="예: 101호" value={getVal('ho') as string} onChange={v => onChange('ho', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="전유면적 (m²)" type="number" value={getVal('exclusive_area') as number} onChange={v => onChange('exclusive_area', Number(v) || null)} locked={apiFieldsLocked} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <LockedFormInput label="세대수" type="number" value={getVal('unit_count') as number} onChange={v => onChange('unit_count', Number(v) || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="사용승인일" type="date" value={getVal('approval_date') as string} onChange={v => onChange('approval_date', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="용도" value={getVal('building_use') as string} onChange={v => onChange('building_use', v || null)} locked={apiFieldsLocked} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">통장 정보</h3>
        <div className="mb-3">
          <label
            className="flex items-center justify-center gap-1.5 border border-dashed border-border-secondary rounded-lg p-2 cursor-pointer text-[11px] text-txt-tertiary hover:border-accent hover:text-accent transition-colors"
            onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) handleBankImageUpload(f) }}
          >
            <Upload size={12} />
            {ocrLoading ? 'OCR 처리 중...' : bankImage ? '통장사본 업로드 완료' : '통장사본 드래그 또는 클릭 (OCR 자동추출)'}
            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleBankImageUpload(f) }} />
          </label>
        </div>
        <div className="grid grid-cols-[1fr_1fr_2fr] gap-3">
          <FormInput label="은행" placeholder="국민은행" value={getVal('bank_name') as string} onChange={v => onChange('bank_name', v || null)} />
          <FormInput label="예금주" value={getVal('account_holder') as string} onChange={v => onChange('account_holder', v || null)} />
          <FormInput label="계좌번호" value={getVal('account_number') as string} onChange={v => onChange('account_number', v || null)} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">상담내용</h3>
        <textarea
          value={(getVal('note') as string) ?? ''}
          onChange={e => onChange('note', e.target.value || null)}
          rows={3}
          placeholder="상담 내용을 입력하세요"
          className="w-full px-3 py-2 border border-border-primary rounded-lg text-[13px] resize-none focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light hover:border-border-secondary transition-colors"
        />
      </section>
    </div>
  )
}

// 수도공사 기본 단가
const DEFAULT_WATER_PRICES = {
  전용: 8500,
  공용: 4500,
  공용_세대: 150000,
}

interface WaterPricing {
  전용: number
  공용: number
  공용_세대: number
}

// --- 탭 2: 1단계 (실측~신청서) ---
function TabStep1({ project, category, getVal, onChange, onRefresh, staffList }: TabProps & { category: '소규모' | '수도'; onRefresh?: () => void; staffList: { id: string; name: string }[] }) {
  const router = useRouter()
  const urlCategory = category === '소규모' ? 'small' : 'water'
  const [pricing, setPricing] = useState<WaterPricing>(DEFAULT_WATER_PRICES)
  const [pricingLoaded, setPricingLoaded] = useState(false)
  const [autoApplied, setAutoApplied] = useState(false)

  const area = (getVal('exclusive_area') as number) || 0
  const units = (getVal('unit_count') as number) || 0
  const cityName = project.cities?.name || ''
  const workTypeName = project.work_types?.name || ''
  const currentTotal = (getVal('total_cost') as number) || 0

  // 서류함 공문에서 단가 자동 로드
  useEffect(() => {
    if (!cityName) return
    fetch(`/api/pricing?city=${encodeURIComponent(cityName)}&category=${encodeURIComponent(category === '소규모' ? '소규모' : '수도')}`)
      .then(res => res.json())
      .then(data => {
        setPricing(data)
        setPricingLoaded(true)
      })
      .catch(() => setPricingLoaded(true))
  }, [cityName, category])

  // 전유면적 있고, 총공사비 없으면 자동 기입
  useEffect(() => {
    if (!pricingLoaded || autoApplied || !area || currentTotal > 0) return

    const isPublic = workTypeName === '공용수도' || workTypeName === '아파트공용'
    const cost = isPublic
      ? Math.round(area * pricing.공용 + units * pricing.공용_세대)
      : Math.round(area * pricing.전용)
    const vat = Math.round(cost * 0.1)
    const grandTotal = cost + vat
    const citySupport = Math.round(grandTotal * 0.8)
    const selfPay = grandTotal - citySupport

    onChange('total_cost', grandTotal)
    onChange('city_support', citySupport)
    onChange('self_pay', selfPay)
    setAutoApplied(true)
  }, [pricingLoaded, autoApplied, area, units, currentTotal, pricing, workTypeName, onChange])

  // 수동 재산출
  const handleRecalculate = () => {
    if (!area) {
      alert('전유면적 정보가 필요합니다.')
      return
    }
    const isPublic = workTypeName === '공용수도' || workTypeName === '아파트공용'
    const cost = isPublic
      ? Math.round(area * pricing.공용 + units * pricing.공용_세대)
      : Math.round(area * pricing.전용)
    const vat = Math.round(cost * 0.1)
    const grandTotal = cost + vat
    onChange('total_cost', grandTotal)
    onChange('city_support', Math.round(grandTotal * 0.8))
    onChange('self_pay', grandTotal - Math.round(grandTotal * 0.8))
  }

  // 미리보기 계산
  const isPublic = workTypeName === '공용수도' || workTypeName === '아파트공용'
  const pricingType = isPublic ? '공용' : '전용'
  const previewCost = area > 0
    ? (isPublic ? Math.round(area * pricing.공용 + units * pricing.공용_세대) : Math.round(area * pricing.전용))
    : 0
  const previewVat = Math.round(previewCost * 0.1)
  const previewTotal = previewCost + previewVat

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">실측</h3>
        <div className="grid grid-cols-2 gap-3">
          <DateTimeInput label="실측일시" value={getVal('survey_date') as string} onChange={v => { onChange('survey_date', v || null); if (v) syncSchedule({ projectId: project.id, buildingName: project.building_name || '', dateValue: v, staffName: (getVal('survey_staff') as string) || '', docType: '실측', address: (project.road_address || ''), phone: (project.owner_phone || '') }) }} />
          <StaffSelect label="실측 담당자" value={getVal('survey_staff') as string} onChange={v => onChange('survey_staff', v || null)} staffList={staffList} />
        </div>
        <FileAttachSection projectId={project.id} fileType="실측지" label="실측지" />
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">견적</h3>
        {area > 0 && (
          <div className="mb-3 p-3 bg-accent/5 rounded-lg border border-accent/20">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-accent-text">
                공문 단가 — {workTypeName || '수도'} [{pricingType}] ({cityName || '-'})
              </p>
              <button onClick={handleRecalculate}
                className="px-3 py-1 text-[11px] font-medium text-white bg-accent rounded-md hover:bg-accent-hover transition-colors">
                재산출
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] mt-2 pt-2 border-t border-accent/10">
              <div><span className="text-txt-tertiary">총공사비</span><p className="font-semibold text-txt-primary">{previewTotal.toLocaleString()}원</p></div>
              <div><span className="text-txt-tertiary">시지원 80%</span><p className="font-semibold text-accent-text">{Math.round(previewTotal * 0.8).toLocaleString()}원</p></div>
              <div><span className="text-txt-tertiary">자부담 20%</span><p className="font-semibold text-txt-secondary">{(previewTotal - Math.round(previewTotal * 0.8)).toLocaleString()}원</p></div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <MoneyInput label="총공사비" value={getVal('total_cost') as number} onChange={v => onChange('total_cost', v)} />
          <MoneyInput label="시지원금" value={getVal('city_support') as number} onChange={v => onChange('city_support', v)} />
          <MoneyInput label="자부담금" value={getVal('self_pay') as number} onChange={v => onChange('self_pay', v)} />
          <MoneyInput label="추가공사비" value={getVal('down_payment') as number} onChange={v => onChange('down_payment', v)} />
        </div>
        <FileAttachSection projectId={project.id} fileType="견적서" label="견적서" />
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">동의서</h3>
        <div className="grid grid-cols-2 gap-3">
          <DateTimeInput label="동의서 회수일시" value={getVal('consent_date') as string} onChange={v => { onChange('consent_date', v || null); if (v) syncSchedule({ projectId: project.id, buildingName: project.building_name || '', dateValue: v, staffName: (getVal('consent_submitter') as string) || '', docType: '동의서 회수', address: (project.road_address || ''), phone: (project.owner_phone || '') }) }} />
          <StaffSelect label="회수자" value={getVal('consent_submitter') as string} onChange={v => onChange('consent_submitter', v || null)} staffList={staffList} />
        </div>
        <FileAttachSection projectId={project.id} fileType="동의서" label="동의서" />
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">신청서</h3>
        <div className="grid grid-cols-2 gap-3">
          <DateTimeInput label="신청서 제출일시" value={getVal('application_date') as string} onChange={v => { onChange('application_date', v || null); if (v) syncSchedule({ projectId: project.id, buildingName: project.building_name || '', dateValue: v, staffName: (getVal('application_submitter') as string) || '', docType: '신청서 제출', address: (project.road_address || ''), phone: (project.owner_phone || '') }) }} />
          <StaffSelect label="제출자" value={getVal('application_submitter') as string} onChange={v => onChange('application_submitter', v || null)} staffList={staffList} />
        </div>
        <FileAttachSection projectId={project.id} fileType="신청서" label="신청서" />
      </section>
      <PaymentSection project={project} onRefresh={onRefresh} />
    </div>
  )
}

// --- 탭 3: 2단계 (승인 → 시공 분리) ---
function TabStep2({ project, category, getVal, onChange, onRefresh, staffList }: TabProps & { category: '소규모' | '수도'; onRefresh?: () => void; staffList: { id: string; name: string }[] }) {
  const [vendorSearch, setVendorSearch] = useState('')
  const [vendorResults, setVendorResults] = useState<{ id: string; name: string; phone: string | null }[]>([])
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)

  const searchVendors = async (q: string) => {
    setVendorSearch(q)
    if (q.trim().length < 1) { setVendorResults([]); setShowVendorDropdown(false); return }
    const { data } = await supabase.from('vendors').select('id, name, phone')
      .ilike('name', `%${q}%`).limit(8)
    setVendorResults(data || [])
    setShowVendorDropdown(true)
  }

  const selectVendor = (v: { name: string }) => {
    onChange('contractor', v.name)
    setVendorSearch('')
    setShowVendorDropdown(false)
  }

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">승인</h3>
        <div className="grid grid-cols-2 gap-3">
          <DateTimeInput label="승인일시" value={getVal('receipt_date') as string} onChange={v => onChange('receipt_date', v || null)} />
        </div>
      </section>

      {category === '소규모' && (
        <section>
          <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">착공서류</h3>
          <div className="grid grid-cols-2 gap-3">
            <DateTimeInput label="착공서류 제출일시" value={getVal('construction_doc_date') as string} onChange={v => { onChange('construction_doc_date', v || null); if (v) syncSchedule({ projectId: project.id, buildingName: project.building_name || '', dateValue: v, staffName: (getVal('construction_doc_submitter') as string) || '', docType: '착공서류 제출', address: (project.road_address || ''), phone: (project.owner_phone || '') }) }} />
            <StaffSelect label="제출자" value={getVal('construction_doc_submitter') as string} onChange={v => onChange('construction_doc_submitter', v || null)} staffList={staffList} />
          </div>
          <FileAttachSection projectId={project.id} fileType="착공서류" label="착공서류" />
        </section>
      )}

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">시공</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="시공일" type="date" value={getVal('construction_date') as string} onChange={v => onChange('construction_date', v || null)} />
          <div className="relative">
            <label className="block text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1">시공업체</label>
            <input
              type="text"
              value={vendorSearch || (getVal('contractor') as string) || ''}
              onChange={e => { onChange('contractor', e.target.value); searchVendors(e.target.value) }}
              onFocus={() => { if (vendorSearch) setShowVendorDropdown(true) }}
              placeholder="업체명 검색..."
              className="w-full h-[36px] px-3 border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
            {showVendorDropdown && vendorResults.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-border-primary rounded-lg shadow-lg max-h-[160px] overflow-y-auto">
                {vendorResults.map(v => (
                  <button key={v.id} onClick={() => selectVendor(v)}
                    className="w-full text-left px-3 py-2 hover:bg-surface-secondary text-[12px] border-b border-border-tertiary last:border-b-0 flex justify-between">
                    <span className="text-txt-primary">{v.name}</span>
                    {v.phone && <span className="text-txt-quaternary">{formatPhone(v.phone)}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <FormInput label="장비/일용직" value={getVal('equipment') as string} onChange={v => onChange('equipment', v || null)} />
          <MoneyInput label="착수금" value={getVal('down_payment') as number} onChange={v => onChange('down_payment', v)} />
        </div>
      </section>
      <PaymentSection project={project} onRefresh={onRefresh} />
    </div>
  )
}

// --- 입금 내역 공유 컴포넌트 (1~3단계 하단에 공통 표시) ---
function PaymentSection({ project, onRefresh }: { project: DBProject; onRefresh?: () => void }) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ payment_date: '', amount: '', payment_type: '자부담착수금', payer_name: '', memo: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadPayments() }, [project.id])

  const loadPayments = async () => {
    const { data } = await supabase.from('payments').select('*').eq('project_id', project.id).order('payment_date', { ascending: false })
    setPayments(data || [])
  }

  const handleAdd = async () => {
    if (!form.amount || Number(form.amount) <= 0) { alert('금액을 입력해주세요.'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('payments').insert({
        project_id: project.id, payment_date: form.payment_date || null,
        amount: Number(form.amount), payment_type: form.payment_type,
        payer_name: form.payer_name || null, memo: form.memo || null,
      })
      if (error) throw error
      const totalPaid = [...payments, { amount: Number(form.amount) }].reduce((s, p) => s + p.amount, 0)
      await supabase.from('projects').update({ outstanding: Math.max(0, (project.total_cost || 0) - totalPaid), updated_at: new Date().toISOString() }).eq('id', project.id)
      setForm({ payment_date: '', amount: '', payment_type: '자부담착수금', payer_name: '', memo: '' })
      setShowAdd(false)
      await loadPayments()
      onRefresh?.()
    } catch (err) { console.error('입금 추가 실패:', err); alert('입금 추가에 실패했습니다.') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('입금 내역을 삭제하시겠습니까?')) return
    try {
      await supabase.from('payments').delete().eq('id', id)
      const remaining = payments.filter(p => p.id !== id)
      const totalPaid = remaining.reduce((s, p) => s + p.amount, 0)
      await supabase.from('projects').update({ outstanding: Math.max(0, (project.total_cost || 0) - totalPaid), updated_at: new Date().toISOString() }).eq('id', project.id)
      setPayments(remaining)
      onRefresh?.()
    } catch (err) { console.error('입금 삭제 실패:', err) }
  }

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)

  return (
    <section className="mt-5 pt-4 border-t border-border-primary">
      <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">입금 내역</h3>
      <div className="border border-border-primary rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-surface-secondary border-b border-border-primary">
              <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-secondary">입금일</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-secondary">유형</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-secondary">입금자</th>
              <th className="px-3 py-2 text-right text-[11px] font-medium text-txt-secondary">금액</th>
              <th className="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-txt-tertiary text-[11px]">입금 내역이 없습니다</td></tr>
            ) : payments.map(p => (
              <tr key={p.id} className="border-b border-border-tertiary last:border-b-0 hover:bg-surface-secondary/50">
                <td className="px-3 py-2 text-[12px] text-txt-primary">{p.payment_date ? new Date(p.payment_date).toLocaleDateString('ko-KR') : '-'}</td>
                <td className="px-3 py-2 text-[11px] text-txt-secondary">{p.payment_type}</td>
                <td className="px-3 py-2 text-[12px] text-txt-primary">{p.payer_name || '-'}</td>
                <td className="px-3 py-2 text-[12px] text-right font-medium tabular-nums text-txt-primary">{p.amount.toLocaleString()}</td>
                <td className="px-1 py-2">
                  <button onClick={() => handleDelete(p.id)} className="p-1 text-txt-quaternary hover:text-money-negative"><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd ? (
        <div className="mt-3 p-3 border border-accent/20 rounded-lg bg-accent/5 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-txt-tertiary mb-0.5">입금일</label>
              <input type="date" value={form.payment_date} onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))}
                className="w-full h-[32px] px-2 border border-border-primary rounded text-[12px] focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-[10px] text-txt-tertiary mb-0.5">유형</label>
              <select value={form.payment_type} onChange={e => setForm(p => ({ ...p, payment_type: e.target.value }))}
                className="w-full h-[32px] px-2 border border-border-primary rounded text-[12px] focus:outline-none focus:border-accent">
                <option>자부담착수금</option><option>추가공사비</option><option>시지원금잔금</option><option>기타</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-txt-tertiary mb-0.5">입금자</label>
              <input type="text" value={form.payer_name} onChange={e => setForm(p => ({ ...p, payer_name: e.target.value }))}
                placeholder="입금자명" className="w-full h-[32px] px-2 border border-border-primary rounded text-[12px] focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-[10px] text-txt-tertiary mb-0.5">금액 *</label>
              <input type="text" inputMode="numeric" value={form.amount ? formatMoney(form.amount) : ''} onChange={e => setForm(p => ({ ...p, amount: String(parseMoney(e.target.value)) }))}
                placeholder="0" className="w-full h-[32px] px-2 border border-border-primary rounded text-[12px] text-right tabular-nums focus:outline-none focus:border-accent" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-txt-tertiary mb-0.5">메모</label>
            <input type="text" value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))}
              placeholder="메모 (선택)" className="w-full h-[32px] px-2 border border-border-primary rounded text-[12px] focus:outline-none focus:border-accent" />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleAdd} disabled={saving} className="px-3 py-1.5 text-[11px] font-medium text-white bg-accent rounded hover:bg-accent-hover disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-[11px] text-txt-tertiary border border-border-primary rounded hover:bg-surface-tertiary">취소</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="mt-2 px-3 py-1.5 text-[11px] text-link border border-accent/30 rounded-lg hover:bg-accent/5">+ 입금 추가</button>
      )}
    </section>
  )
}

// --- 탭 4: 3단계 (완료서류) ---
function TabStep3({ project, getVal, onChange, onRefresh, staffList }: TabProps & { onRefresh?: () => void; staffList: { id: string; name: string }[] }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">완료서류</h3>
        <div className="grid grid-cols-2 gap-3">
          <DateTimeInput label="완료서류 제출일시" value={getVal('completion_doc_date') as string} onChange={v => { onChange('completion_doc_date', v || null); if (v) syncSchedule({ projectId: project.id, buildingName: project.building_name || '', dateValue: v, staffName: (getVal('completion_submitter') as string) || '', docType: '완료서류 제출', address: (project.road_address || ''), phone: (project.owner_phone || '') }) }} />
          <StaffSelect label="제출자" value={getVal('completion_submitter') as string} onChange={v => onChange('completion_submitter', v || null)} staffList={staffList} />
        </div>
        <FileAttachSection projectId={project.id} fileType="완료서류" label="완료서류" />
      </section>
      <PaymentSection project={project} onRefresh={onRefresh} />
    </div>
  )
}

// --- 탭: 이력 ---
function TabHistory({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<{ from_status: string; to_status: string; note: string | null; created_at: string; staff_name: string | null }[]>([])

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('status_logs')
        .select('from_status, to_status, note, created_at, staff:staff_id ( name )')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = (data || []).map((item: any) => ({
        from_status: item.from_status,
        to_status: item.to_status,
        note: item.note,
        created_at: item.created_at,
        staff_name: item.staff?.name ?? null,
      }))
      setLogs(mapped)
    }
    load()
  }, [projectId])

  return (
    <div>
      <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">단계 변경 이력</h3>
      {logs.length === 0 ? (
        <p className="text-[13px] text-txt-tertiary text-center py-6">이력이 없습니다</p>
      ) : (
        <div className="space-y-0">
          {logs.map((item, idx) => (
            <div key={idx} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-accent mt-1.5" />
                {idx < logs.length - 1 && <div className="w-0.5 flex-1 bg-surface-tertiary" />}
              </div>
              <div className="pb-4">
                <p className="text-[13px] text-txt-primary">
                  {!item.from_status ? (
                    <span className="font-medium">{item.to_status}</span>
                  ) : (
                    <>
                      <span className="text-txt-secondary">{item.from_status}</span>
                      <span className="mx-1 text-txt-tertiary">&rarr;</span>
                      <span className="font-medium">{item.to_status}</span>
                    </>
                  )}
                </p>
                <p className="text-[11px] text-txt-secondary mt-0.5">
                  {new Date(item.created_at).toLocaleDateString('ko-KR')}
                  {item.staff_name && ` · ${item.staff_name}`}
                </p>
                {item.note && <p className="text-[11px] text-txt-tertiary mt-0.5">{item.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- 삭제 확인 모달 ---
function DeleteConfirmModal({ buildingName, onConfirm, onCancel }: {
  buildingName: string; onConfirm: () => void; onCancel: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const handleConfirm = async () => {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-surface rounded-xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-sm mx-4">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-[#dc2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary mb-2">프로젝트 삭제</h3>
          <p className="text-[13px] text-txt-secondary mb-1"><span className="font-semibold">{buildingName}</span></p>
          <p className="text-[13px] text-txt-secondary mb-6">정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 px-4 py-2.5 text-[13px] font-medium text-txt-secondary border border-border-secondary rounded-lg hover:bg-surface-tertiary transition-colors">취소</button>
            <button onClick={handleConfirm} disabled={deleting} className="flex-1 px-4 py-2.5 text-[13px] font-medium text-white bg-[#dc2626] rounded-lg hover:bg-[#b91c1c] transition-colors disabled:opacity-50">
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
