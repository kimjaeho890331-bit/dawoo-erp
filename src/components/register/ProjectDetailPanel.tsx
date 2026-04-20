'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { validateProjectData } from '@/lib/utils/validate'
import StepTransition from '@/components/register/StepTransition'
import type { DBProject, ProjectStep } from '@/components/register/RegisterPage'

import { InfoField } from './panels/panelHelpers'
import TabBasicInfo from './panels/TabBasicInfo'
import TabReception from './panels/TabReception'
import TabConstruction from './panels/TabConstruction'
import TabCompletion from './panels/TabCompletion'

const PROGRESS_STEPS: ProjectStep[] = [
  '문의', '실측', '견적전달', '동의서', '신청서제출',
  '승인', '착공계', '공사', '완료서류제출', '입금',
]

const STEP_LABELS_SHORT = [
  '문의', '실측', '견적', '동의', '신청',
  '승인', '착공', '공사', '완료', '입금',
]

const TABS = ['접수', '승인(시공)', '완료', '이력', '기본정보'] as const
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
  const [activeTab, setActiveTab] = useState<TabKey>('접수')
  const [editData, setEditData] = useState<Record<string, string | number | null>>({})
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [apiFieldsLocked, setApiFieldsLocked] = useState(true)
  const [editingMemo, setEditingMemo] = useState(false)
  const [editingInfo, setEditingInfo] = useState(false)
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([])
  const [showStatusModal, setShowStatusModal] = useState<'취소' | '문의(예약)' | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  // project.id 만 추적 (실시간 업데이트로 같은 프로젝트가 refresh 될 때는 editData 유지)
  const projectIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!project) return
    const isDifferentProject = projectIdRef.current !== project.id
    projectIdRef.current = project.id

    // 다른 프로젝트로 전환된 경우에만 editData 초기화
    if (isDifferentProject) {
      setEditData({})
      setHasChanges(false)
      setApiFieldsLocked(true)
      setEditingInfo(false)
      // 현재 단계에 맞는 탭 자동 선택
      const stepIdx = getStepIndex(project.status)
      if (stepIdx <= 4) setActiveTab('접수')
      else if (stepIdx <= 7) setActiveTab('승인(시공)')
      else if (stepIdx <= 9) setActiveTab('완료')
      else setActiveTab('접수')

      // 기존 날짜 기준으로 단계 자동 보정 (취소/예약 제외)
      if (project.status !== '취소' && project.status !== '문의(예약)') {
        const AUTO_MAP: Record<string, string> = {
          survey_date: '실측',
          consent_date: '동의서',
          application_date: '신청서제출',
          approval_received_date: '승인',
          construction_date: '공사',
          construction_end_date: '공사',
          completion_doc_date: '완료서류제출',
        }
        const ORDER = ['문의', '실측', '견적전달', '동의서', '신청서제출', '승인', '착공계', '공사', '완료서류제출', '입금']
        let target = project.status
        const curIdx = ORDER.indexOf(project.status)
        for (const [f, s] of Object.entries(AUTO_MAP)) {
          if ((project as unknown as Record<string, unknown>)[f]) {
            const si = ORDER.indexOf(s)
            if (si > curIdx && si > ORDER.indexOf(target)) target = s
          }
        }
        if (target !== project.status) {
          ;(async () => {
            await supabase.from('projects').update({ status: target }).eq('id', project.id)
            await supabase.from('status_logs').insert({
              project_id: project.id, from_status: project.status, to_status: target, note: '자동 보정',
            })
            onRefresh?.()
          })()
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  // 직원 목록 로드
  useEffect(() => {
    supabase.from('staff').select('id, name').order('name').then(({ data }) => {
      setStaffOptions(data || [])
    })
  }, [])

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updateField = useCallback((field: string, value: string | number | null) => {
    setEditData(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }, [])

  // 날짜 필드 → 캘린더 자동 동기화
  const SCHEDULE_MAP: Record<string, string> = {
    survey_date: '실측',
    consent_date: '동의서회수',
    application_date: '신청서제출',
    construction_doc_date: '착공서류제출',
    construction_date: '시공',
    completion_doc_date: '완료서류제출',
  }

  // 각 단계별 담당자 필드 매핑 (date 필드 → staff 필드)
  const STEP_STAFF_MAP: Record<string, string> = {
    survey_date: 'survey_staff',
    consent_date: 'consent_submitter',
    application_date: 'application_submitter',
    construction_doc_date: 'construction_doc_submitter',
    completion_doc_date: 'completion_submitter',
  }

  const syncSchedules = async (savedData: Record<string, string | number | null>) => {
    if (!project) return
    const dateFields = Object.keys(savedData).filter(k => k in SCHEDULE_MAP)
    const hasWorkerChange = 'direct_worker' in savedData || 'construction_end_date' in savedData
    const hasStaffChange = 'staff_id' in savedData

    // 시간 필드 변경 감지 — 대응되는 날짜 필드도 처리해야 함
    const timeFieldsChanged = Object.keys(savedData).filter(k => {
      const dateField = k.replace('_time', '_date')
      return k.endsWith('_time') && dateField in SCHEDULE_MAP
    })
    // 시간 변경된 경우, 대응 날짜 필드를 dateFields에 추가 (중복 제거)
    timeFieldsChanged.forEach(tf => {
      const df = tf.replace('_time', '_date')
      if (!dateFields.includes(df)) dateFields.push(df)
    })

    // 단계별 담당자 필드 변경 감지 (survey_staff, application_submitter 등)
    Object.keys(savedData).forEach(k => {
      const matchingDateField = Object.entries(STEP_STAFF_MAP).find(([, sf]) => sf === k)?.[0]
      if (matchingDateField && !dateFields.includes(matchingDateField)) {
        dateFields.push(matchingDateField)
      }
    })

    // 담당자 이름 → UUID 변환용 staff 목록 로드
    const { data: staffList } = await supabase.from('staff').select('id, name')
    const getStaffIdByName = (name: string | null | undefined): string | null => {
      if (!name) return null
      // UUID 형식이면 그대로 반환
      if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(name)) return name
      const found = staffList?.find(s => s.name === name)
      return found?.id || null
    }

    // 담당자만 변경된 경우: 이 프로젝트의 모든 일정 staff_id 업데이트
    if (hasStaffChange && dateFields.length === 0 && !hasWorkerChange) {
      await supabase.from('schedules')
        .update({ staff_id: savedData.staff_id })
        .eq('project_id', project.id)
        .eq('schedule_type', 'project')
      return
    }

    if (dateFields.length === 0 && !hasWorkerChange) return

    for (const field of dateFields) {
      // dateVal: savedData에 있으면 그 값, 없으면 project의 기존 값
      const dateVal = (field in savedData ? savedData[field] : (project as unknown as Record<string,string>)[field]) as string | null
      const scheduleType = SCHEDULE_MAP[field]
      // 시간: 실측은 survey_time, 나머지는 해당 time 필드
      const timeField = field.replace('_date', '_time')
      const timeVal = (savedData[timeField] as string) || (editData as Record<string,unknown>)?.[timeField] as string || (project as unknown as Record<string,string>)[timeField] || ''
      // title에는 시간 넣지 않음 (start_time 필드로 따로 저장 → 캘린더가 중복 표시 안 함)
      const title = `${project.building_name || '(이름없음)'} ${scheduleType}`
      const addr = project.jibun_address || project.road_address || ''
      const ownerInfo = [project.owner_name, project.owner_phone].filter(Boolean).join(' · ')
      const memo = [addr, ownerInfo].filter(Boolean).join('\n')

      if (!dateVal) {
        // 날짜 삭제 시 일정도 삭제
        await supabase
          .from('schedules')
          .delete()
          .eq('project_id', project.id)
          .ilike('title', `%${scheduleType}`)
        continue
      }

      // upsert: project_id + title 기준 (schedule_type은 'project' 고정)
      const { data: existing } = await supabase
        .from('schedules')
        .select('id')
        .eq('project_id', project.id)
        .ilike('title', `%${scheduleType}`)
        .limit(1)

      // DB date 타입에 맞게 날짜만 추출 (T14:00 제거)
      const cleanDate = dateVal.substring(0, 10)

      // 단계별 담당자 우선: STEP_STAFF_MAP에 정의된 필드 → 없으면 project.staff_id
      const stepStaffField = STEP_STAFF_MAP[field]
      const stepStaffName = stepStaffField
        ? ((savedData[stepStaffField] as string) || (editData as Record<string,unknown>)?.[stepStaffField] as string || (project as unknown as Record<string,string>)[stepStaffField])
        : null
      // 이름을 UUID로 변환 (StaffSelect는 이름 저장, schedules는 UUID 필요)
      const stepStaffId = getStaffIdByName(stepStaffName)
      const finalStaffId = stepStaffId || (savedData.staff_id as string) || project.staff_id

      const payload = {
        project_id: project.id,
        staff_id: finalStaffId,
        schedule_type: 'project' as const,
        title,
        start_date: cleanDate,
        end_date: cleanDate,
        start_time: timeVal || null,
        memo,
        confirmed: false,
        all_day: !timeVal,
      }

      if (existing && existing.length > 0) {
        await supabase.from('schedules').update(payload).eq('id', existing[0].id)
      } else {
        await supabase.from('schedules').insert(payload)
      }
    }

    // 시공 일정 자동 생성/업데이트
    const constDate = savedData.construction_date || project.construction_date
    const worker = (savedData.direct_worker ?? project.direct_worker) as string | null

    if (constDate && worker) {
      // 제목 생성 (옥내/공용 포맷)
      const type = project.water_work_type || ''
      const building = project.building_name || ''
      let constTitle = ''
      if (type === '옥내') {
        const dongHo = [project.dong, project.ho].filter(Boolean).join(' ')
        constTitle = `[${worker}] 수도옥내 ${building}${dongHo ? ' ' + dongHo : ''}`
      } else {
        constTitle = `[${worker}] 수도${type || ''} ${building}`
      }

      // 메모 생성
      const memoLines: string[] = []
      if (worker) memoLines.push(`작업자: ${worker}`)
      if (project.staff?.name) memoLines.push(`담당자: ${project.staff.name}`)
      const addr = project.road_address || project.jibun_address || ''
      if (addr) memoLines.push(`주소: ${addr}`)
      if (project.owner_phone) memoLines.push(`대표자 연락처: ${project.owner_phone}`)
      if (project.note) memoLines.push(`특이사항: ${project.note}`)

      const endDate = (savedData.construction_end_date || project.construction_end_date || constDate) as string
      const cleanConstDate = String(constDate).substring(0, 10)
      const cleanEndDate = String(endDate).substring(0, 10)

      // upsert: project_id + schedule_type='project' + 시공 키워드로 찾기 (중복 방지)
      const { data: existingConst } = await supabase
        .from('schedules')
        .select('id, memo')
        .eq('project_id', project.id)
        .eq('schedule_type', 'project')
        .or(`title.ilike.%시공%,title.ilike.%수도%`)
        .not('title', 'ilike', '%실측%')
        .not('title', 'ilike', '%동의서%')
        .not('title', 'ilike', '%신청서%')
        .not('title', 'ilike', '%완료서류%')
        .not('title', 'ilike', '%착공서류%')
        .limit(1)

      // 기존 메모 보존 (사용자가 추가한 메모)
      const existingMemo = existingConst?.[0]?.memo || ''
      const userMemo = existingMemo.split('\n---\n')[1] || ''
      const fullMemo = userMemo
        ? memoLines.join('\n') + '\n---\n' + userMemo
        : memoLines.join('\n')

      const constPayload = {
        project_id: project.id,
        staff_id: project.staff_id,
        schedule_type: 'project' as const,
        title: constTitle,
        start_date: cleanConstDate,
        end_date: cleanEndDate,
        memo: fullMemo,
        confirmed: false,
        all_day: true,
      }

      if (existingConst && existingConst.length > 0) {
        await supabase.from('schedules').update(constPayload).eq('id', existingConst[0].id)
      } else {
        await supabase.from('schedules').insert(constPayload)
      }
    }
  }

  // 자동저장 (3초 debounce - 입력 중이면 계속 연기)
  // 변경한 필드만 DB에 업데이트 (다른 사람이 다른 필드 편집 중이어도 안전)
  useEffect(() => {
    if (!hasChanges || !project) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const dataToSave = validateProjectData({ ...editData })
        if (Object.keys(dataToSave).length === 0) return
        const { error } = await supabase
          .from('projects')
          .update(dataToSave)
          .eq('id', project.id)
        if (error) throw error
        await syncSchedules(dataToSave)
        // editData에서 저장된 필드만 제거 (새로 입력 중인 필드는 유지)
        setEditData(prev => {
          const next = { ...prev }
          Object.keys(dataToSave).forEach(k => {
            if (prev[k] === dataToSave[k]) delete next[k]
          })
          return next
        })
        setHasChanges(false)
        setSaveError(null)
        // onRefresh 호출 안 함 — realtime 구독이 알아서 처리
      } catch (err) {
        console.error('자동저장 실패:', err)
        const msg = err instanceof Error ? err.message : '자동저장 실패'
        setSaveError(msg)
      }
    }, 3000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editData])

  // 자동 단계 전환 규칙: 해당 날짜가 입력되면 최소 이 단계로 이동
  const AUTO_STEP_MAP: Record<string, string> = {
    survey_date: '실측',
    application_date: '신청서제출',
    consent_date: '동의서',
    approval_received_date: '승인',
    construction_date: '공사',
    construction_end_date: '공사',
    completion_doc_date: '완료서류제출',
  }
  const STEP_ORDER = ['문의', '실측', '견적전달', '동의서', '신청서제출', '승인', '착공계', '공사', '완료서류제출', '입금']

  const autoProgressStatus = (savedData: Record<string, unknown>, currentStatus: string): string | null => {
    // 취소/예약 상태는 자동 전환 안 함
    if (currentStatus === '취소' || currentStatus === '문의(예약)') return null
    let targetStep = currentStatus
    const currentIdx = STEP_ORDER.indexOf(currentStatus)

    for (const [field, step] of Object.entries(AUTO_STEP_MAP)) {
      // savedData OR 기존 project에 날짜가 있으면
      const hasDate = savedData[field] || (project as unknown as Record<string, unknown>)[field]
      if (hasDate) {
        const stepIdx = STEP_ORDER.indexOf(step)
        if (stepIdx > currentIdx && stepIdx > STEP_ORDER.indexOf(targetStep)) {
          targetStep = step
        }
      }
    }
    return targetStep !== currentStatus ? targetStep : null
  }

  const handleSave = async () => {
    if (!project || !hasChanges) return
    setSaving(true)
    try {
      const dataToSave = validateProjectData({ ...editData })
      const { error } = await supabase
        .from('projects')
        .update(dataToSave)
        .eq('id', project.id)
      if (error) throw error

      // 날짜 변경 시 캘린더 동기화
      await syncSchedules(dataToSave)

      // 자동 단계 전환
      const nextStatus = autoProgressStatus(dataToSave, project.status)
      if (nextStatus) {
        await supabase.from('projects').update({ status: nextStatus }).eq('id', project.id)
        await supabase.from('status_logs').insert({
          project_id: project.id,
          from_status: project.status,
          to_status: nextStatus,
          note: '자동 전환',
        })
        onRefresh?.()
      }

      setHasChanges(false)
      setEditData({})
      setSaveError(null)
    } catch (err) {
      console.error('저장 실패:', err)
      const msg = err instanceof Error ? err.message : '저장 실패'
      setSaveError(msg)
      alert(`저장에 실패했습니다.\n${msg}`)
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

  const handleStatusChange = async () => {
    if (!project || !showStatusModal) return
    try {
      await supabase.from('projects').update({ status: showStatusModal }).eq('id', project.id)
      await supabase.from('status_logs').insert({
        project_id: project.id,
        from_status: project.status,
        to_status: showStatusModal,
        note: statusReason || null,
      })
      setShowStatusModal(null)
      setStatusReason('')
      onRefresh?.()
    } catch (err) {
      console.error('상태 변경 실패:', err)
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

      <div className="fixed right-0 top-0 h-full w-full md:w-[600px] bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.12)] z-40 flex flex-col animate-slide-in overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary">
          <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">
            {project.building_name || '(이름없음)'}
          </h2>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-[11px] font-medium text-white bg-[#c96442] rounded-lg hover:bg-[#b5573a] transition-colors disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            )}
            <button
              onClick={() => setShowStatusModal('취소')}
              className="px-3 py-1.5 text-[11px] font-medium text-[#b53333] border border-[#b53333]/30 rounded-lg hover:bg-[#b53333]/5 transition-colors"
            >
              취소
            </button>
            <button
              onClick={() => setShowStatusModal('문의(예약)')}
              className="px-3 py-1.5 text-[11px] font-medium text-[#d97706] border border-[#fef3c7] rounded-lg hover:bg-amber-50 transition-colors"
            >
              예약
            </button>
            {(project as unknown as Record<string, string>).drive_folder_url ? (
              <a
                href={(project as unknown as Record<string, string>).drive_folder_url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-[11px] font-medium text-white bg-[#0F9D58] rounded-lg hover:bg-[#0b8043] transition-colors inline-flex items-center gap-1"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M7.71 3.5L1.15 15l3.43 5.97L11 9.47 7.71 3.5zm8.58 0H8.29l6.56 11.5h8L16.29 3.5zM5.57 21h12.86l-3.43-6H2.14l3.43 6z"/></svg>
                드라이브
              </a>
            ) : null}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-1.5 text-[11px] font-medium text-[#b53333] border border-[#b53333]/30 rounded-lg hover:bg-[#b53333]/5 transition-colors"
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

        {/* 저장 실패 배너 */}
        {saveError && (
          <div className="px-6 py-2 bg-[#fef2f2] border-b border-[#fecaca] flex items-center justify-between gap-3">
            <div className="text-[12px] text-[#b91c1c]">
              <span className="font-medium">저장 실패:</span> {saveError}
            </div>
            <button
              onClick={() => setSaveError(null)}
              className="text-[11px] text-[#b91c1c]/70 hover:text-[#b91c1c]"
            >
              닫기
            </button>
          </div>
        )}

        {/* 프로그레스 바 - 슬림 라인 스타일 */}
        <div className="px-6 py-3 border-b border-border-tertiary">
          <div className="relative">
            {/* 배경 라인 */}
            <div className="absolute top-[11px] left-3 right-3 h-[2px] bg-[#f3f4f6]" />
            {/* 진행 라인 */}
            <div
              className="absolute top-[11px] left-3 h-[2px] bg-[#c96442] transition-all"
              style={{ width: `${(currentStepIdx / (PROGRESS_STEPS.length - 1)) * 100}%` }}
            />
            {/* 단계 점 */}
            <div className="relative flex justify-between">
              {PROGRESS_STEPS.map((step, idx) => {
                const isSkippedStep = idx === 3 && project.water_work_type === '옥내'
                return (
                <div key={step} className={`flex flex-col items-center ${isSkippedStep ? 'opacity-30' : ''}`} style={{ width: '10%' }}>
                  <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-semibold transition-all ${
                    isSkippedStep
                      ? 'bg-surface text-txt-quaternary border-2 border-dashed border-[#d1d5db]'
                      : idx < currentStepIdx
                      ? 'bg-[#c96442] text-white'
                      : idx === currentStepIdx
                      ? 'bg-[#c96442] text-white shadow-md shadow-[#c96442]/20'
                      : 'bg-surface text-txt-quaternary border-2 border-[#f3f4f6]'
                  }`}>
                    {isSkippedStep ? '-' : idx < currentStepIdx ? <Check size={12} className="text-white" /> : idx + 1}
                  </div>
                  <span className={`mt-1 text-[9px] leading-tight text-center whitespace-nowrap ${
                    isSkippedStep
                      ? 'text-txt-quaternary line-through'
                      : idx === currentStepIdx
                      ? 'text-[#c96442] font-medium'
                      : idx < currentStepIdx
                      ? 'text-txt-secondary'
                      : 'text-txt-quaternary'
                  }`}>
                    {STEP_LABELS_SHORT[idx]}
                  </span>
                </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 단계 전환 */}
        <StepTransition project={project} onStepChange={() => onRefresh?.()} />

        {/* 상시 표시 영역 (항상 전체 표시) */}
        <div className="px-6 py-3 border-b border-border-tertiary bg-[#f0eee6]">
          {/* 건물명 + 공사종류 */}
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-[16px] font-bold text-txt-primary">
              {project.building_name || '(이름없음)'}
            </h3>
            {project.water_work_type && (
              <span className={`px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${
                project.water_work_type === '공용' ? 'bg-blue-500 text-white' :
                project.water_work_type === '옥내' ? 'bg-emerald-500 text-white' :
                project.water_work_type === '단독' ? 'bg-orange-500 text-white' :
                'bg-gray-500 text-white'
              }`}>
                {project.water_work_type}
              </span>
            )}
            <button
              onClick={() => setEditingInfo(prev => !prev)}
              className="ml-auto text-[11px] text-[#c96442] hover:text-[#b5573a] transition-colors font-medium"
            >
              {editingInfo ? '완료' : '수정'}
            </button>
          </div>
          {/* 주소 + 카카오맵 */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[12px] text-txt-secondary flex-1">{project.road_address || project.jibun_address || '-'}</span>
            {(project.road_address || project.jibun_address) && (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => navigator.clipboard.writeText(project.road_address || project.jibun_address || '')}
                  className="text-[10px] px-1.5 py-0.5 bg-surface border border-border-primary rounded text-txt-tertiary hover:text-[#c96442]"
                >복사</button>
                <a
                  href={`https://map.kakao.com/link/search/${encodeURIComponent(project.road_address || project.jibun_address || '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] px-1.5 py-0.5 bg-[#FEE500] rounded text-[#3C1E1E] font-medium"
                >지도</a>
              </div>
            )}
          </div>
          {/* 2행: 소유주 / 연락처 / 담당자 — 인라인 편집 */}
          {editingInfo ? (
            <div className="grid grid-cols-3 gap-2 mb-1.5">
              <div>
                <span className="text-[11px] text-txt-tertiary block mb-0.5">소유주</span>
                <input
                  type="text"
                  value={(getVal('owner_name') as string) ?? ''}
                  onChange={e => updateField('owner_name', e.target.value || null)}
                  className="w-full h-[28px] px-2 text-[12px] bg-white border border-[#c96442] rounded focus:outline-none focus:ring-2 focus:ring-[#c96442]/10"
                  placeholder="소유주"
                />
              </div>
              <div>
                <span className="text-[11px] text-txt-tertiary block mb-0.5">연락처</span>
                <input
                  type="tel"
                  value={(getVal('owner_phone') as string) ?? ''}
                  onChange={e => updateField('owner_phone', e.target.value || null)}
                  className="w-full h-[28px] px-2 text-[12px] bg-white border border-[#c96442] rounded focus:outline-none focus:ring-2 focus:ring-[#c96442]/10"
                  placeholder="010-0000-0000"
                />
              </div>
              <div>
                <span className="text-[11px] text-txt-tertiary block mb-0.5">담당자</span>
                <select
                  value={(getVal('staff_id') as string) ?? ''}
                  onChange={e => updateField('staff_id', e.target.value || null)}
                  className="w-full h-[28px] px-2 text-[12px] bg-white border border-[#c96442] rounded focus:outline-none focus:ring-2 focus:ring-[#c96442]/10"
                >
                  <option value="">선택</option>
                  {staffOptions.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-x-4 mb-1.5 text-[13px]">
              <InfoField label="소유주" value={(getVal('owner_name') as string) || '-'} />
              <InfoField label="연락처" value={(getVal('owner_phone') as string) || '-'} />
              <InfoField label="담당자" value={(() => {
                const sid = getVal('staff_id') as string
                return staffOptions.find(s => s.id === sid)?.name || project.staff?.name || '-'
              })()} />
            </div>
          )}
          {/* 상담내역 + 세입자 연락처 (같은 줄) */}
          <div className="flex items-start gap-4 mb-2">
            <div className="flex-1">
              <span className="text-[11px] text-txt-tertiary">상담내역</span>
              {editingMemo ? (
                <textarea
                  autoFocus
                  rows={2}
                  value={(getVal('note') as string) ?? ''}
                  onChange={e => updateField('note', e.target.value || null)}
                  onBlur={() => setEditingMemo(false)}
                  className="w-full mt-0.5 px-2 py-1 border border-[#c96442] rounded-md text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-[#c96442]/10"
                />
              ) : (
                <p
                  onClick={() => setEditingMemo(true)}
                  className="text-[13px] text-txt-secondary cursor-pointer hover:bg-surface-tertiary rounded px-1 py-0.5 -mx-1 transition-colors truncate"
                  title="클릭하여 수정"
                >
                  {(getVal('note') as string) || '-'}
                </p>
              )}
            </div>
            {project.tenant_phone && (
              <div className="shrink-0">
                <span className="text-[11px] text-txt-tertiary">세입자</span>
                <p className="text-[13px] text-txt-secondary">{project.tenant_phone}</p>
              </div>
            )}
          </div>
          {/* 세입자 연락처는 위에서 상담내역 옆에 표시 */}
          {/* 금액 5개 */}
          <div className="grid grid-cols-5 gap-2 pt-2 border-t border-surface-tertiary">
            <MiniStat label="총공사비" value={project.total_cost} />
            <MiniStat label="자부담금" value={project.self_pay} />
            <MiniStat label="시지원금" value={project.city_support} />
            <MiniStat label="추가공사금" value={project.additional_cost || 0} />
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
                  ? 'border-b-[1.5px] border-[#c96442] text-[#c96442]'
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
          {activeTab === '접수' && <TabReception project={project} category={category} getVal={getVal} onChange={updateField} />}
          {activeTab === '승인(시공)' && <TabConstruction project={project} category={category} getVal={getVal} onChange={updateField} currentStepIdx={currentStepIdx} />}
          {activeTab === '완료' && <TabCompletion project={project} getVal={getVal} onChange={updateField} />}
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

      {showStatusModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowStatusModal(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface rounded-xl shadow-xl z-50 p-6 w-[360px]">
            <h3 className="text-[15px] font-semibold text-txt-primary mb-3">
              {showStatusModal === '취소' ? '취소 처리' : '예약으로 전환'}
            </h3>
            <textarea
              autoFocus
              rows={3}
              placeholder="사유를 입력하세요"
              value={statusReason}
              onChange={e => setStatusReason(e.target.value)}
              className="w-full px-3 py-2 border border-border-primary rounded-lg text-[13px] resize-none focus:outline-none focus:border-[#c96442] focus:ring-2 focus:ring-[#c96442]/10"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowStatusModal(null)} className="flex-1 px-4 py-2 text-[13px] text-txt-secondary border border-border-primary rounded-lg hover:bg-surface-tertiary">
                닫기
              </button>
              <button onClick={handleStatusChange} className={`flex-1 px-4 py-2 text-[13px] font-medium text-white rounded-lg ${showStatusModal === '취소' ? 'bg-[#dc2626] hover:bg-[#b91c1c]' : 'bg-[#d97706] hover:bg-[#b45309]'}`}>
                {showStatusModal === '취소' ? '취소 처리' : '예약 전환'}
              </button>
            </div>
          </div>
        </>
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

// --- MiniStat (금액 표시용, 이 파일 전용) ---
function MiniStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-txt-tertiary">{label}</p>
      <p className={`text-[11px] font-semibold tabular-nums ${highlight && value > 0 ? 'text-[#dc2626] font-medium' : 'text-txt-secondary'}`}>
        {value > 0 ? `${value.toLocaleString()}원` : '-'}
      </p>
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
                <div className="w-2 h-2 rounded-full bg-[#c96442] mt-1.5" />
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
