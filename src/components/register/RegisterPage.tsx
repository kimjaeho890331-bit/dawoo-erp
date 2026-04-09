'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Settings, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatPhone } from '@/lib/utils/format'
import ProjectDetailPanel from '@/components/register/ProjectDetailPanel'
import NewProjectModal from '@/components/register/NewProjectModal'

// --- 타입 ---
export type ProjectStep =
  | '문의' | '실사' | '견적전달' | '동의서' | '신청서제출'
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
  status: string
  note: string | null
  area: number | null
  unit_count: number | null
  approval_date: string | null
  survey_date: string | null
  survey_staff: string | null
  application_date: string | null
  application_submitter: string | null
  construction_date: string | null
  contractor: string | null
  equipment: string | null
  down_payment: number
  completion_doc_date: string | null
  completion_submitter: string | null
  dong: string | null
  ho: string | null
  exclusive_area: number | null
  building_use: string | null
  bank_name: string | null
  account_number: string | null
  account_holder: string | null
  year: number | null
  created_at: string
  updated_at: string
  // JOIN 필드
  staff?: { id: string; name: string } | null
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
  '문의', '실사', '견적전달', '동의서', '신청서제출',
  '승인', '착공계', '공사', '완료서류제출', '입금',
]

const IN_PROGRESS_STEPS: ProjectStep[] = PROGRESS_STEPS.filter(s => s !== '입금')

function matchesStatusFilter(step: string, filter: StatusFilter): boolean {
  switch (filter) {
    case '전체': return true
    case '진행중': return IN_PROGRESS_STEPS.includes(step as ProjectStep)
    case '접수': return ['문의', '실사', '견적전달', '동의서', '신청서제출'].includes(step)
    case '승인': return ['승인', '착공계', '공사'].includes(step)
    case '완료': return step === '완료서류제출'
    case '취소': return step === '취소'
    case '문의(예약)': return step === '문의'
    default: return true
  }
}

function getStepBadgeColor(step: string): string {
  switch (step) {
    case '문의': case '실사': return 'bg-status-initial-bg text-status-initial-text'
    case '견적전달': case '동의서': case '신청서제출': return 'bg-status-docs-bg text-status-docs-text'
    case '승인': return 'bg-status-approved-bg text-status-approved-text'
    case '착공계': case '공사': return 'bg-status-construction-bg text-status-construction-text'
    case '완료서류제출': return 'bg-status-completion-bg text-status-completion-text'
    case '입금': return 'bg-status-done-bg text-status-done-text'
    case '취소': return 'bg-status-cancel-bg text-status-cancel-text'
    default: return 'bg-status-initial-bg text-status-initial-text'
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
          staff:staff_id ( id, name ),
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

    return result
  }, [projects, statusFilter, selectedCities, searchQuery])

  const selectedProject = projects.find(p => p.id === selectedProjectId) || null

  const toggleCity = (cityName: string) => {
    setSelectedCities(prev =>
      prev.includes(cityName) ? prev.filter(c => c !== cityName) : [...prev, cityName]
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
      <div className="flex items-center justify-between mb-6">
        <h1>{category} 접수대장</h1>
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

      {/* 상태 필터 탭 */}
      <div className="flex gap-1 mb-4 border-b border-border-primary">
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

      {/* 시 태그 필터 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {cities.map(city => (
          <button
            key={city.id}
            onClick={() => toggleCity(city.name)}
            className={`rounded-full px-[14px] py-1 text-[11px] font-medium border transition-colors ${
              selectedCities.includes(city.name)
                ? 'bg-accent-light text-accent border-accent'
                : 'bg-transparent text-txt-secondary border-border-primary hover:border-accent hover:text-accent'
            }`}
          >
            {city.name}
          </button>
        ))}
        {selectedCities.length > 0 && (
          <button
            onClick={() => setSelectedCities([])}
            className="rounded-full px-[14px] py-1 text-[11px] font-medium text-danger border border-danger-border hover:bg-danger-bg transition-colors"
          >
            초기화
          </button>
        )}
        <button
          onClick={() => setShowCityManager(true)}
          className="rounded-full w-[26px] h-[26px] flex items-center justify-center text-txt-tertiary border border-border-primary hover:border-accent hover:text-accent transition-colors"
          title="지역 관리"
        >
          <Settings size={12} />
        </button>
      </div>

      {/* 테이블 */}
      <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left">담당직원</th>
                <th className="px-4 py-3 text-left">빌라명</th>
                <th className="px-4 py-3 text-left">소유주</th>
                <th className="px-4 py-3 text-left">연락처</th>
                <th className="px-4 py-3 text-left">주소</th>
                <th className="px-4 py-3 text-left">종류</th>
                <th className="px-4 py-3 text-left">단계</th>
                <th className="px-4 py-3 text-left">상담내역</th>
                <th className="px-4 py-3 text-right">총공사비</th>
                <th className="px-4 py-3 text-right">미수금</th>
                <th className="w-10 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-txt-tertiary">
                    불러오는 중...
                  </td>
                </tr>
              ) : filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-txt-tertiary">
                    등록된 프로젝트가 없습니다
                  </td>
                </tr>
              ) : (
                filteredProjects.map(project => (
                  <tr
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    className={`border-b border-border-primary cursor-pointer transition-colors ${
                      selectedProjectId === project.id
                        ? 'bg-accent-light'
                        : ''
                    }`}
                  >
                    <td className="px-4 py-2.5 font-medium text-txt-primary">{project.staff?.name || '-'}</td>
                    <td className="px-4 py-2.5 text-txt-primary">{project.building_name || '-'}</td>
                    <td className="px-4 py-2.5 text-txt-secondary">{project.owner_name || '-'}</td>
                    <td className="px-4 py-2.5 text-txt-secondary">{project.owner_phone ? formatPhone(project.owner_phone) : '-'}</td>
                    <td className="px-4 py-2.5 text-txt-secondary max-w-[200px] truncate" title={project.road_address || ''}>
                      {project.road_address || '-'}
                    </td>
                    <td className="px-4 py-2.5">
                      {project.work_types?.name ? (
                        <span className={`badge ${getTypeBadgeColor()}`}>
                          {project.work_types.name}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`badge ${getStepBadgeColor(project.status)}`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-txt-tertiary max-w-[160px] truncate" title={project.note || ''}>
                      {project.note || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-txt-primary whitespace-nowrap tabular-nums">
                      {project.total_cost > 0 ? `${project.total_cost.toLocaleString()}원` : '-'}
                    </td>
                    <td className={`px-4 py-2.5 text-right whitespace-nowrap tabular-nums ${project.outstanding > 0 ? 'text-money-negative font-medium' : 'text-txt-tertiary'}`}>
                      {project.outstanding > 0 ? `${project.outstanding.toLocaleString()}원` : '-'}
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
