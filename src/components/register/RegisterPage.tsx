'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatPhone } from '@/lib/utils/format'
import ProjectDetailPanel from '@/components/register/ProjectDetailPanel'
import NewProjectModal from '@/components/register/NewProjectModal'

// --- 타입 ---
export type ProjectStep =
  | '문의' | '실측' | '견적전달' | '동의서' | '신청서제출'
  | '승인' | '착공계' | '공사' | '완료서류제출' | '입금'

export interface DBProject {
  id: string
  building_name: string | null
  staff_id: string | null
  road_address: string | null
  jibun_address: string | null
  city_id: string | null
  work_type_id: string | null
  owner_name: string | null
  owner_phone: string | null
  tenant_phone: string | null
  total_cost: number
  self_pay: number
  city_support: number
  outstanding: number
  collected: number
  status: string
  note: string | null
  area: number | null
  unit_count: number | null
  approval_date: string | null
  survey_date: string | null
  survey_time: string | null
  survey_staff: string | null
  consent_time: string | null
  application_time: string | null
  construction_time: string | null
  construction_doc_time: string | null
  completion_doc_time: string | null
  application_date: string | null
  application_submitter: string | null
  construction_date: string | null
  contractor: string | null
  equipment: string | null
  down_payment: number
  completion_doc_date: string | null
  completion_submitter: string | null
  // 추가 필드 (고도화)
  additional_cost: number
  consent_date: string | null
  consent_submitter: string | null
  construction_end_date: string | null
  approval_received_date: string | null
  construction_doc_date: string | null
  construction_doc_submitter: string | null
  receipt_date: string | null
  field_memo: string | null
  area_result: string | null
  // 수도 전용
  water_work_type: string | null
  unit_password: string | null
  direct_worker: string | null
  // 소규모 전용
  external_contractor: string | null
  other_contractor: string | null
  design_amount: number
  // 전유부/표제부
  dong: string | null
  ho: string | null
  exclusive_area: number | null
  building_use: string | null
  bank_name: string | null
  account_number: string | null
  account_holder: string | null
  support_program: string | null
  year: number | null
  created_at: string
  updated_at: string
  // JOIN 필드
  staff?: { id: string; name: string; color?: string | null } | null
  cities?: { name: string } | null
  work_types?: { name: string; work_categories?: { name: string } | null } | null
}

// --- 상수 ---
const STATUS_TABS = [
  { key: '진행중', label: '진행중' },
  { key: '접수', label: '접수' },
  { key: '승인', label: '승인' },
  { key: '완료', label: '완료' },
  { key: '취소', label: '취소' },
  { key: '문의(예약)', label: '문의(예약)' },
  { key: '전체', label: '전체' },
] as const

type StatusFilter = (typeof STATUS_TABS)[number]['key']

const PROGRESS_STEPS: ProjectStep[] = [
  '문의', '실측', '견적전달', '동의서', '신청서제출',
  '승인', '착공계', '공사', '완료서류제출', '입금',
]

const STEP_LABELS_SHORT = ['문의','실측','견적','동의','신청','승인','착공','공사','완료','입금']

const IN_PROGRESS_STEPS: ProjectStep[] = PROGRESS_STEPS.filter(s => s !== '입금')

function matchesStatusFilter(step: string, filter: StatusFilter): boolean {
  switch (filter) {
    case '전체': return true
    case '진행중': return IN_PROGRESS_STEPS.includes(step as ProjectStep) && step !== '문의(예약)'
    case '접수': return ['문의', '실측', '견적전달', '동의서', '신청서제출'].includes(step)
    case '승인': return ['승인', '착공계', '공사'].includes(step)
    case '완료': return step === '완료서류제출' || step === '입금'
    case '취소': return step === '취소'
    case '문의(예약)': return step === '문의(예약)'
    default: return true
  }
}

function getStepBadgeColor(step: string): string {
  switch (step) {
    case '문의': case '문의(예약)': return 'bg-slate-100 text-slate-600'
    case '실측': return 'bg-sky-100 text-sky-700'
    case '견적전달': return 'bg-accent-light text-accent'
    case '동의서': return 'bg-violet-100 text-violet-700'
    case '신청서제출': return 'bg-purple-100 text-purple-700'
    case '승인': return 'bg-emerald-100 text-emerald-700'
    case '착공계': return 'bg-teal-100 text-teal-700'
    case '공사': return 'bg-amber-100 text-amber-800'
    case '완료서류제출': return 'bg-blue-100 text-blue-700'
    case '입금': return 'bg-green-100 text-green-700'
    case '취소': return 'bg-red-100 text-red-600'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function getTypeBadgeColor(): string {
  return 'bg-status-initial-bg text-status-initial-text'
}

// --- 케밥 메뉴 ---
function KebabMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(prev => !prev) }}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-tertiary text-txt-tertiary hover:text-txt-secondary transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-8 w-28 bg-surface rounded-[10px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-border-primary py-1 z-20">
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onEdit() }}
            className="w-full text-left px-4 py-2 text-[13px] text-txt-secondary hover:bg-surface-secondary transition-colors"
          >
            수정
          </button>
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onDelete() }}
            className="w-full text-left px-4 py-2 text-[13px] text-danger hover:bg-danger-bg transition-colors"
          >
            삭제
          </button>
        </div>
      )}
    </div>
  )
}

// --- 삭제 확인 모달 ---
function DeleteConfirmModal({
  buildingName,
  onConfirm,
  onCancel,
}: {
  buildingName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  const handleConfirm = async () => {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-surface rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-sm mx-4 p-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-danger-bg flex items-center justify-center">
            <svg className="w-6 h-6 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-[16px] font-semibold text-txt-primary mb-2">프로젝트 삭제</h3>
          <p className="text-[13px] text-txt-secondary mb-1">
            <span className="font-semibold">{buildingName}</span>
          </p>
          <p className="text-[13px] text-txt-tertiary mb-6">
            정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 btn-secondary"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={deleting}
              className="flex-1 btn-danger disabled:opacity-50"
            >
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- 컴포넌트 ---
export default function RegisterPage({ category }: { category: '소규모' | '수도' }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('진행중')
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [editProject, setEditProject] = useState<DBProject | null>(null)
  const [deleteProject, setDeleteProject] = useState<DBProject | null>(null)
  const [showCityManager, setShowCityManager] = useState(false)
  const [projects, setProjects] = useState<DBProject[]>([])
  const [cities, setCities] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  // 데이터 로드
  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      // 해당 카테고리의 work_type_id 목록 조회
      const { data: workTypes } = await supabase
        .from('work_types')
        .select('id, work_categories!inner( name )')
        .eq('work_categories.name', category)

      const typeIds = workTypes?.map((wt: { id: string }) => wt.id) || []

      let query = supabase
        .from('projects')
        .select(`
          *,
          staff:staff_id ( id, name, color ),
          cities:city_id ( name ),
          work_types:work_type_id ( name, work_categories:category_id ( name ) )
        `)
        .order('created_at', { ascending: false })

      if (typeIds.length > 0) {
        query = query.in('work_type_id', typeIds)
      }

      const { data, error } = await query
      if (error) throw error
      setProjects((data as DBProject[]) || [])
    } catch (err) {
      console.error('프로젝트 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [category])

  const loadCities = useCallback(async () => {
    const { data } = await supabase
      .from('cities')
      .select('id, name')
      .order('name')
    setCities(data || [])
  }, [])

  useEffect(() => {
    loadProjects()
    loadCities()
  }, [loadProjects, loadCities])

  // URL ?project=xxx 파라미터로 자동 패널 열기 (캘린더에서 넘어올 때)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const projectParam = params.get('project')
    if (!projectParam) return

    // 프로젝트의 카테고리 확인 후 올바른 URL로 리다이렉트 or 패널 열기
    ;(async () => {
      const { data: proj } = await supabase
        .from('projects')
        .select('id, work_types(work_categories(name))')
        .eq('id', projectParam)
        .single()
      if (!proj) return
      const projCat = (proj.work_types as { work_categories?: { name?: string } } | null)?.work_categories?.name
      // 현재 페이지 카테고리와 프로젝트 카테고리가 다르면 올바른 페이지로 이동
      if (projCat && projCat !== category) {
        const targetPath = projCat === '수도' ? '/register/water' : '/register/small'
        window.location.href = `${targetPath}?project=${projectParam}`
        return
      }
      setSelectedProjectId(projectParam)
      const url = new URL(window.location.href)
      url.searchParams.delete('project')
      window.history.replaceState({}, '', url.toString())
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Supabase Realtime: projects 테이블 변경 실시간 구독
  useEffect(() => {
    const channel = supabase
      .channel('projects-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => { loadProjects() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadProjects])

  // 상태별 건수
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      '진행중': 0, '접수': 0, '승인': 0, '완료': 0,
      '취소': 0, '문의(예약)': 0, '전체': projects.length,
    }
    projects.forEach(p => {
      STATUS_TABS.forEach(tab => {
        if (tab.key !== '전체' && matchesStatusFilter(p.status, tab.key)) {
          counts[tab.key]++
        }
      })
    })
    return counts
  }, [projects])

  // 최종 필터링
  const filteredProjects = useMemo(() => {
    let result = projects

    result = result.filter(p => matchesStatusFilter(p.status, statusFilter))

    if (selectedCities.length > 0) {
      result = result.filter(p => {
        const cityName = p.cities?.name
        return cityName ? selectedCities.includes(cityName) : false
      })
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(p =>
        (p.building_name || '').toLowerCase().includes(q) ||
        (p.owner_name || '').toLowerCase().includes(q) ||
        (p.owner_phone || '').includes(q) ||
        (p.road_address || '').toLowerCase().includes(q) ||
        (p.note || '').toLowerCase().includes(q)
      )
    }

    // 정렬: 단계 낮은 순 → 같은 단계면 실측일순
    result.sort((a, b) => {
      const aIdx = PROGRESS_STEPS.indexOf(a.status as ProjectStep)
      const bIdx = PROGRESS_STEPS.indexOf(b.status as ProjectStep)
      // 취소/문의(예약)은 맨 뒤
      const aStep = aIdx >= 0 ? aIdx : 99
      const bStep = bIdx >= 0 ? bIdx : 99
      if (aStep !== bStep) return aStep - bStep
      // 같은 단계: 실측일(survey_date) 오래된 순
      const aDate = a.survey_date || '9999'
      const bDate = b.survey_date || '9999'
      return aDate.localeCompare(bDate)
    })

    return result
  }, [projects, statusFilter, selectedCities, searchQuery])

  const selectedProject = projects.find(p => p.id === selectedProjectId) || null

  const toggleCity = (cityName: string) => {
    // 1개씩만 선택 (같은 거 누르면 해제)
    setSelectedCities(prev =>
      prev.includes(cityName) ? [] : [cityName]
    )
  }

  const handleProjectCreated = () => {
    setShowNewModal(false)
    setEditProject(null)
    loadProjects()
  }

  const handleEditFromPanel = (project: DBProject) => {
    setSelectedProjectId(null)
    setEditProject(project)
  }

  const handleDeleteFromPanel = (project: DBProject) => {
    setSelectedProjectId(null)
    loadProjects()
  }

  const handleDeleteFromMenu = (project: DBProject) => {
    setDeleteProject(project)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteProject) return
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', deleteProject.id)
      if (error) throw error
      setDeleteProject(null)
      if (selectedProjectId === deleteProject.id) {
        setSelectedProjectId(null)
      }
      loadProjects()
    } catch (err) {
      console.error('삭제 실패:', err)
      alert('삭제에 실패했습니다.')
    }
  }

  return (
    <div className="max-w-full bg-page min-h-screen">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-[18px] md:text-[22px] font-semibold tracking-[-0.4px] text-txt-primary whitespace-nowrap">{category} 접수대장</h1>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="빌라명, 소유주, 연락처 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-72 px-4 input-field"
          />
          <button
            onClick={() => setShowNewModal(true)}
            className="btn-primary"
          >
            + 신규등록
          </button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="bg-surface rounded-lg border border-border-primary p-4" style={{boxShadow:'rgba(0,0,0,0.05) 0px 4px 24px'}}>
          <p className="text-xs text-txt-tertiary font-medium mb-1">진행중</p>
          <p className="text-2xl font-bold tabular-nums">{statusCounts['진행중']}</p>
        </div>
        <div className="bg-surface rounded-lg border border-border-primary p-4" style={{boxShadow:'rgba(0,0,0,0.05) 0px 4px 24px'}}>
          <p className="text-xs text-txt-tertiary font-medium mb-1">완료</p>
          <p className="text-2xl font-bold tabular-nums text-green-600">{statusCounts['완료']}</p>
        </div>
        <div className="bg-surface rounded-lg border border-border-primary p-4" style={{boxShadow:'rgba(0,0,0,0.05) 0px 4px 24px'}}>
          <p className="text-xs text-txt-tertiary font-medium mb-1">총공사비</p>
          <p className="text-xl font-bold tabular-nums">{filteredProjects.reduce((s, p) => s + p.total_cost, 0).toLocaleString()}</p>
        </div>
        <div className="bg-surface rounded-lg border border-border-primary p-4" style={{boxShadow:'rgba(0,0,0,0.05) 0px 4px 24px'}}>
          <p className="text-xs text-txt-tertiary font-medium mb-1">미수금</p>
          <p className="text-xl font-bold tabular-nums text-red-600">{filteredProjects.reduce((s, p) => s + p.outstanding, 0).toLocaleString()}</p>
        </div>
      </div>

      {/* 상태 필터 탭 + 진행 프로세스 가이드 */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-4 border-b border-border-primary">
        <div className="flex gap-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-4 py-2 text-[13px] font-medium transition-colors ${
                statusFilter === tab.key
                  ? 'border-b-[1.5px] border-accent text-accent'
                  : 'border-b-[1.5px] border-transparent text-txt-tertiary hover:text-txt-secondary'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] ${
                statusFilter === tab.key ? 'bg-accent-light text-accent' : 'bg-surface-secondary text-txt-tertiary'
              }`}>
                {statusCounts[tab.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="hidden md:block">
          <div className="bg-surface rounded-lg border border-border-primary p-2 mb-3" style={{boxShadow:'rgba(0,0,0,0.05) 0px 4px 24px'}}>
            <div className="flex items-center gap-1 px-2 py-1.5">
              {PROGRESS_STEPS.map((step, i) => {
                const colors = ['bg-slate-400','bg-sky-500','bg-[#c96442]','bg-violet-500','bg-purple-500','bg-emerald-600','bg-teal-500','bg-amber-500','bg-blue-600','bg-green-600']
                return (
                  <div key={step} className="flex items-center gap-0.5">
                    <span className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-bold text-white ${colors[i]}`}>{i+1}</span>
                    <span className="text-[9px] text-txt-tertiary">{STEP_LABELS_SHORT[i]}</span>
                    {i < PROGRESS_STEPS.length - 1 && <span className="text-[8px] text-txt-quaternary mx-0.5">›</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* (상태 필터 탭은 위에서 프로세스 가이드와 함께 렌더됨) */}

      {/* 지역 필터 (1개씩 선택 + 건수 표시) */}
      {(() => {
        const cityNames = [...new Set(projects.map(p => p.cities?.name).filter(Boolean) as string[])].sort()
        if (cityNames.length === 0) return null
        // 지역별 건수 (현재 탭 기준)
        const cityCounts: Record<string, number> = {}
        projects.forEach(p => {
          const cn = p.cities?.name
          if (cn && matchesStatusFilter(p.status, statusFilter)) {
            cityCounts[cn] = (cityCounts[cn] || 0) + 1
          }
        })
        return (
          <div className="flex flex-wrap gap-2 mb-4">
            {cityNames.map(name => {
              const count = cityCounts[name] || 0
              const isActive = selectedCities.includes(name)
              return (
                <button key={name} onClick={() => toggleCity(name)}
                  className={`rounded-full px-[14px] py-1 text-[11px] font-medium border transition-colors ${
                    isActive ? 'bg-accent-light text-accent border-accent' : 'bg-transparent text-txt-secondary border-border-primary hover:border-accent hover:text-accent'
                  }`}>
                  {name}
                  <span className={`ml-1 text-[10px] ${isActive ? 'text-accent' : 'text-txt-quaternary'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="px-4 py-16 text-center text-txt-tertiary">불러오는 중...</div>
        ) : filteredProjects.length === 0 ? (
          <div className="px-4 py-16 text-center text-txt-tertiary">등록된 프로젝트가 없습니다</div>
        ) : (
          filteredProjects.map(project => (
            <div
              key={project.id}
              onClick={() => setSelectedProjectId(project.id)}
              className={`bg-surface border rounded-lg p-3 cursor-pointer transition ${
                selectedProjectId === project.id ? 'border-accent bg-accent-light' : 'border-border-primary'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-medium text-txt-primary truncate flex-1">{project.building_name || '-'}</span>
                <span className={`badge ml-2 ${getStepBadgeColor(project.status)}`}>
                  <span className="inline-block w-[5px] h-[5px] rounded-full mr-1" style={{backgroundColor: 'currentColor', opacity: 0.7}} />
                  {project.status}
                </span>
              </div>
              <div className="text-[11px] text-txt-secondary truncate">{project.road_address || '-'}</div>
              <div className="flex items-center gap-2 mt-1.5">
                {project.staff?.name && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: project.staff.color || '#94a3b8' }}>
                    {project.staff.name}
                  </span>
                )}
                {category === '수도' && project.water_work_type && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    project.water_work_type === '공용' ? 'bg-blue-100 text-blue-700' :
                    project.water_work_type === '옥내' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>{project.water_work_type}</span>
                )}
                <span className="text-[10px] text-txt-tertiary truncate">{project.note || ''}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
      <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden" style={{boxShadow:'rgba(0,0,0,0.05) 0px 4px 24px'}}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-surface-secondary/50">
                <th className="px-3 py-2 text-left font-medium text-txt-tertiary">담당</th>
                <th className="px-3 py-2 text-left font-medium text-txt-tertiary">빌라명</th>
                <th className="px-3 py-2 text-left font-medium text-txt-tertiary">호수</th>
                <th className="px-3 py-2 text-left font-medium text-txt-tertiary">연락처</th>
                <th className="px-3 py-2 text-left font-medium text-txt-tertiary">주소</th>
                <th className="px-3 py-2 text-left font-medium text-txt-tertiary">{category === '소규모' ? '지원사업' : '종류'}</th>
                <th className="px-3 py-2 text-left font-medium text-txt-tertiary">상담내역</th>
                <th className="px-3 py-2 text-left font-medium text-txt-tertiary">단계</th>
                <th className="w-8 px-1 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-txt-tertiary">
                    불러오는 중...
                  </td>
                </tr>
              ) : filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-txt-tertiary">
                    등록된 프로젝트가 없습니다
                  </td>
                </tr>
              ) : (
                filteredProjects.map(project => (
                  <tr
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    className={`border-b border-border-primary cursor-pointer transition-colors hover:bg-surface-secondary/40 ${
                      selectedProjectId === project.id
                        ? 'bg-accent-light'
                        : ''
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      {project.staff?.name ? (
                        <span
                          className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white whitespace-nowrap"
                          style={{ backgroundColor: project.staff.color || '#94a3b8' }}
                        >
                          {project.staff.name}
                        </span>
                      ) : (
                        <span className="text-txt-quaternary text-[11px]">-</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-txt-primary">{project.building_name || '-'}</td>
                    <td className="px-3 py-1.5 text-txt-secondary">{[project.dong, project.ho].filter(Boolean).join(' ') || '-'}</td>
                    <td className="px-3 py-1.5 text-txt-secondary">{project.owner_phone ? formatPhone(project.owner_phone) : '-'}</td>
                    <td className="px-3 py-1.5 text-txt-secondary max-w-[180px] truncate" title={project.road_address || ''}>
                      {project.road_address || '-'}
                    </td>
                    <td className="px-3 py-1.5">
                      {category === '소규모' ? (
                        <span className={`badge ${getTypeBadgeColor()}`}>
                          {project.support_program || project.work_types?.name || '-'}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          project.water_work_type === '공용' ? 'bg-blue-100 text-blue-700' :
                          project.water_work_type === '옥내' ? 'bg-emerald-100 text-emerald-700' :
                          project.water_work_type === '단독' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {project.water_work_type || project.work_types?.name || '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-txt-tertiary max-w-[140px] truncate" title={project.note || ''}>
                      {project.note || '-'}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`badge ${getStepBadgeColor(project.status)}`}>
                        <span className="inline-block w-[5px] h-[5px] rounded-full mr-1" style={{backgroundColor: 'currentColor', opacity: 0.7}} />
                        {project.status}
                      </span>
                      {project.outstanding > 0 && project.total_cost > 0 &&
                        ['완료서류제출', '입금'].includes(project.status) && (
                        <span className="ml-1 text-[10px] font-semibold text-money-negative">미수금</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <KebabMenu
                        onEdit={() => { setEditProject(project) }}
                        onDelete={() => { handleDeleteFromMenu(project) }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* 하단 요약 */}
      <div className="mt-3 text-[13px] text-txt-tertiary">
        총 {filteredProjects.length}건
        {filteredProjects.length > 0 && (
          <>
            {' / '}총공사비 <span className="tabular-nums">{filteredProjects.reduce((s, p) => s + p.total_cost, 0).toLocaleString()}원</span>
            {' / '}미수금 <span className="tabular-nums">{filteredProjects.reduce((s, p) => s + p.outstanding, 0).toLocaleString()}원</span>
          </>
        )}
      </div>

      {/* 상세 패널 */}
      <ProjectDetailPanel
        project={selectedProject}
        category={category}
        onClose={() => setSelectedProjectId(null)}
        onEdit={handleEditFromPanel}
        onDelete={handleDeleteFromPanel}
        onRefresh={loadProjects}
      />

      {/* 신규등록 / 수정 모달 */}
      {(showNewModal || editProject) && (
        <NewProjectModal
          category={category}
          onClose={() => { setShowNewModal(false); setEditProject(null) }}
          onSubmit={handleProjectCreated}
          editProject={editProject || undefined}
        />
      )}

      {/* 삭제 확인 모달 */}
      {deleteProject && (
        <DeleteConfirmModal
          buildingName={deleteProject.building_name || '(이름없음)'}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteProject(null)}
        />
      )}

      {showCityManager && (
        <CityManagerModal
          cities={cities}
          onClose={() => setShowCityManager(false)}
          onRefresh={() => { loadCities(); setShowCityManager(false) }}
        />
      )}
    </div>
  )
}

function CityManagerModal({ cities, onClose, onRefresh }: {
  cities: { id: string; name: string }[]
  onClose: () => void
  onRefresh: () => void
}) {
  const [newCity, setNewCity] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!newCity.trim()) return
    const { error } = await supabase.from('cities').insert({ name: newCity.trim() })
    if (error) {
      alert('추가 실패: ' + error.message)
      return
    }
    setNewCity('')
    onRefresh()
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    const { error } = await supabase.from('cities').delete().eq('id', id)
    if (error) {
      alert('삭제 실패: ' + error.message)
    }
    setDeleting(null)
    onRefresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-surface rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-semibold text-txt-primary">지역 관리</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-secondary text-txt-tertiary">&#x2715;</button>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newCity}
            onChange={e => setNewCity(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            placeholder="새 지역명 입력"
            className="flex-1 input-field px-3"
          />
          <button
            onClick={handleAdd}
            className="btn-primary"
          >
            추가
          </button>
        </div>

        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {cities.map(city => (
            <div key={city.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-secondary group">
              <span className="text-[13px] text-txt-primary">{city.name}</span>
              <button
                onClick={() => handleDelete(city.id)}
                disabled={deleting === city.id}
                className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded hover:bg-danger-bg text-txt-tertiary hover:text-danger transition-all disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
