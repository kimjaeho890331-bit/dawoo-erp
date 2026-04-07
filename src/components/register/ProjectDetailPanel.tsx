'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { DBProject, ProjectStep } from '@/components/register/RegisterPage'

const PROGRESS_STEPS: ProjectStep[] = [
  '문의', '실사', '견적전달', '동의서', '신청서제출',
  '승인', '착공계', '공사', '완료서류제출', '입금',
]

const STEP_LABELS_SHORT = [
  '문의', '실사', '견적', '동의', '신청',
  '승인', '착공', '공사', '완료', '입금',
]

const TABS = ['기본정보', '1단계', '2단계', '3~4단계', '서류/첨부', '이력'] as const
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
      else if (stepIdx <= 9) setActiveTab('3~4단계')
      else setActiveTab('기본정보')
    }
  }, [project])

  const updateField = useCallback((field: string, value: string | number | null) => {
    setEditData(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }, [])

  const handleSave = async () => {
    if (!project || !hasChanges) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('projects')
        .update(editData)
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

        {/* 프로그레스 바 - 슬림 라인 스타일 */}
        <div className="px-6 py-3 border-b border-border-tertiary">
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

        {/* 상시 표시 영역 - 핵심 정보만 */}
        <div className="px-6 py-3 border-b border-border-tertiary bg-surface-secondary">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
            <InfoField label="담당자" value={project.staff?.name || '-'} />
            <InfoField label="빌라명" value={project.building_name || '-'} />
            <InfoField label="공사종류" value={project.work_types?.name || '-'} />
            <InfoField label="현재단계" value={project.status} />
          </div>
          <div className="grid grid-cols-4 gap-3 mt-2 pt-2 border-t border-surface-tertiary">
            <MiniStat label="총공사비" value={project.total_cost} />
            <MiniStat label="자부담금" value={project.self_pay} />
            <MiniStat label="시지원금" value={project.city_support} />
            <MiniStat label="미수금" value={project.outstanding} highlight />
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
          {activeTab === '1단계' && <TabStep1 project={project} category={category} getVal={getVal} onChange={updateField} />}
          {activeTab === '2단계' && <TabStep2 project={project} getVal={getVal} onChange={updateField} />}
          {activeTab === '3~4단계' && <TabStep34 project={project} getVal={getVal} onChange={updateField} />}
          {activeTab === '서류/첨부' && <TabDocuments />}
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

// --- 탭별 Props ---
interface TabProps {
  project: DBProject
  getVal: (field: keyof DBProject) => string | number | null | undefined | { id: string; name: string } | { name: string } | { name: string; work_categories?: { name: string } | null }
  onChange: (field: string, value: string | number | null) => void
  apiFieldsLocked?: boolean
}

// --- 탭 1: 기본정보 ---
function TabBasicInfo({ project, getVal, onChange, apiFieldsLocked }: TabProps) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">소유주/세입자</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="소유주" value={getVal('owner_name') as string} onChange={v => onChange('owner_name', v || null)} />
          <FormInput label="소유주 연락처" type="tel" value={getVal('owner_phone') as string} onChange={v => onChange('owner_phone', v || null)} />
          <FormInput label="세입자 연락처" type="tel" value={getVal('tenant_phone') as string} onChange={v => onChange('tenant_phone', v || null)} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">주소</h3>
        <div className="space-y-3">
          <FormInput label="도로명주소" value={getVal('road_address') as string} onChange={v => onChange('road_address', v || null)} />
          <FormInput label="지번주소" value={getVal('jibun_address') as string} onChange={v => onChange('jibun_address', v || null)} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">건물 정보</h3>
        <div className="grid grid-cols-2 gap-3">
          <LockedFormInput label="용도" value={getVal('building_use') as string} onChange={v => onChange('building_use', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="세대수" type="number" value={getVal('unit_count') as number} onChange={v => onChange('unit_count', Number(v) || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="사용승인일" type="date" value={getVal('approval_date') as string} onChange={v => onChange('approval_date', v || null)} locked={apiFieldsLocked} />
          <FormInput label="면적 (m2)" type="number" value={getVal('area') as number} onChange={v => onChange('area', Number(v) || null)} />
          <LockedFormInput label="동" placeholder="예: 101동" value={getVal('dong') as string} onChange={v => onChange('dong', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="호" placeholder="예: 201호" value={getVal('ho') as string} onChange={v => onChange('ho', v || null)} locked={apiFieldsLocked} />
          <LockedFormInput label="전유면적 (m2)" type="number" value={getVal('exclusive_area') as number} onChange={v => onChange('exclusive_area', Number(v) || null)} locked={apiFieldsLocked} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">통장 정보</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="은행" placeholder="예: 국민은행" value={getVal('bank_name') as string} onChange={v => onChange('bank_name', v || null)} />
          <FormInput label="계좌번호" value={getVal('account_number') as string} onChange={v => onChange('account_number', v || null)} />
          <FormInput label="예금주" value={getVal('account_holder') as string} onChange={v => onChange('account_holder', v || null)} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">메모</h3>
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

// --- 탭 2: 1단계 (실측~신청서) ---
function TabStep1({ project, category, getVal, onChange }: TabProps & { category: '소규모' | '수도' }) {
  const router = useRouter()
  const urlCategory = category === '소규모' ? 'small' : 'water'

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">실측</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="실측일" type="date" value={getVal('survey_date') as string} onChange={v => onChange('survey_date', v || null)} />
          <FormInput label="실측 담당자" value={getVal('survey_staff') as string} onChange={v => onChange('survey_staff', v || null)} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">견적</h3>
        <div className="grid grid-cols-3 gap-3">
          <FormInput label="자부담금" type="number" value={getVal('self_pay') as number} onChange={v => onChange('self_pay', Number(v) || 0)} />
          <FormInput label="시지원금" type="number" value={getVal('city_support') as number} onChange={v => onChange('city_support', Number(v) || 0)} />
          <FormInput label="총공사비" type="number" value={getVal('total_cost') as number} onChange={v => onChange('total_cost', Number(v) || 0)} />
        </div>
        <button
          onClick={() => router.push(`/register/${urlCategory}/estimate?projectId=${project.id}`)}
          className="mt-3 px-4 py-2 text-[13px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
        >
          견적서 열기
        </button>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">동의서</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="동의서 수령일" type="date" value={getVal('approval_date') as string} onChange={v => onChange('approval_date', v || null)} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">신청서</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="신청서 제출일" type="date" value={getVal('application_date') as string} onChange={v => onChange('application_date', v || null)} />
          <FormInput label="제출자" value={getVal('application_submitter') as string} onChange={v => onChange('application_submitter', v || null)} />
        </div>
      </section>
    </div>
  )
}

// --- 탭 3: 2단계 (승인 → 시공 분리) ---
function TabStep2({ project, getVal, onChange }: TabProps) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">승인</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="승인일" type="date" value={getVal('approval_date') as string} onChange={v => onChange('approval_date', v || null)} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">시공</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="시공일" type="date" value={getVal('construction_date') as string} onChange={v => onChange('construction_date', v || null)} />
          <FormInput label="시공업체" value={getVal('contractor') as string} onChange={v => onChange('contractor', v || null)} />
          <FormInput label="장비/일용직" value={getVal('equipment') as string} onChange={v => onChange('equipment', v || null)} />
          <FormInput label="착수금" type="number" value={getVal('down_payment') as number} onChange={v => onChange('down_payment', Number(v) || 0)} />
        </div>
      </section>
    </div>
  )
}

// --- 탭 4: 3~4단계 ---
function TabStep34({ project, getVal, onChange }: TabProps) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">완료서류</h3>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="완료서류 제출일" type="date" value={getVal('completion_doc_date') as string} onChange={v => onChange('completion_doc_date', v || null)} />
          <FormInput label="제출자" value={getVal('completion_submitter') as string} onChange={v => onChange('completion_submitter', v || null)} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">수금</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <FormInput label="미수금" type="number" value={getVal('outstanding') as number} onChange={v => onChange('outstanding', Number(v) || 0)} />
        </div>
        <p className="text-[11px] text-txt-tertiary mb-2">복수 입금 기록</p>
        <div className="border border-border-primary rounded-[10px] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-surface-secondary border-b border-border-primary">
                <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-secondary">입금일</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-secondary">입금자</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-txt-secondary">금액</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-txt-tertiary text-[11px]">
                  입금 내역이 없습니다
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button className="mt-2 px-3 py-1.5 text-[11px] text-link border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">
          + 입금 추가
        </button>
      </section>
    </div>
  )
}

// --- 탭 5: 서류/첨부 ---
function TabDocuments() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">서류 목록</h3>
        <div className="border border-dashed border-border-secondary rounded-[10px] p-8 text-center text-txt-tertiary text-[13px]">
          서류가 없습니다. 서류함에서 생성하면 여기에 표시됩니다.
        </div>
      </div>
      <div>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">첨부파일</h3>
        <div className="border border-dashed border-border-secondary rounded-[10px] p-8 text-center text-txt-tertiary text-[13px]">
          첨부파일이 없습니다. 파일을 드래그앤드롭하여 업로드하세요.
        </div>
      </div>
    </div>
  )
}

// --- 탭 6: 이력 ---
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
