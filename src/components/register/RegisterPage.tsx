'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
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
    case '문의': case '실사': return 'bg-[#f1f3f5] text-[#4b5563]'
    case '견적전달': case '동의서': case '신청서제출': return 'bg-[#e0e7ff] text-[#3730a3]'
    case '승인': return 'bg-[#d1fae5] text-[#065f46]'
    case '착공계': case '공사': return 'bg-[#ffedd5] text-[#9a3412]'
    case '완료서류제출': return 'bg-[#ede9fe] text-[#5b21b6]'
    case '입금': return 'bg-[#d1fae5] text-[#065f46]'
    case '취소': return 'bg-[#fee2e2] text-[#991b1b]'
    default: return 'bg-[#f1f3f5] text-[#4b5563]'
  }
}

function getTypeBadgeColor(): string {
  return 'bg-[#f1f3f5] text-[#4b5563]'
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
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#e9ecef] text-[#9ca3af] hover:text-[#4b5563] transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-8 w-28 bg-[#ffffff] rounded-[10px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-[#e5e7eb] py-1 z-20">
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onEdit() }}
            className="w-full text-left px-4 py-2 text-[13px] text-[#4b5563] hover:bg-[#f1f3f5] transition-colors"
          >
            수정
          </button>
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onDelete() }}
            className="w-full text-left px-4 py-2 text-[13px] text-[#dc2626] hover:bg-[#fee2e2] transition-colors"
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
      <div className="relative bg-[#ffffff] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-sm mx-4 p-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#fee2e2] flex items-center justify-center">
            <svg className="w-6 h-6 text-[#dc2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-[16px] font-semibold text-[#111827] mb-2">프로젝트 삭제</h3>
          <p className="text-[13px] text-[#4b5563] mb-1">
            <span className="font-semibold">{buildingName}</span>
          </p>
          <p className="text-[13px] text-[#9ca3af] mb-6">
            정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-5 py-2 text-[13px] font-medium text-[#4b5563] border border-[#e5e7eb] rounded-lg hover:bg-[#f1f3f5] transition-colors min-h-[36px]"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={deleting}
              className="flex-1 px-5 py-2 text-[13px] font-medium text-white bg-[#dc2626] rounded-lg hover:bg-[#b91c1c] transition-colors disabled:opacity-50 min-h-[36px]"
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
    <div className="max-w-full bg-[#f8f9fa] min-h-screen">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[#111827]">{category} 접수대장</h1>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="빌라명, 소유주, 연락처 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-72 px-4 h-[36px] bg-[#ffffff] border border-[#e5e7eb] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#e0e7ff] focus:border-[#6366f1]"
          />
          <button
            onClick={() => setShowNewModal(true)}
            className="px-5 py-2 bg-[#6366f1] text-white rounded-lg text-[13px] font-medium hover:bg-[#4f46e5] transition-colors min-h-[36px]"
          >
            + 신규등록
          </button>
        </div>
      </div>

      {/* 상태 필터 탭 */}
      <div className="flex gap-1 mb-4 border-b border-[#e5e7eb]">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 text-[13px] font-medium transition-colors ${
              statusFilter === tab.key
                ? 'border-b-[1.5px] border-[#6366f1] text-[#6366f1]'
                : 'border-b-[1.5px] border-transparent text-[#9ca3af] hover:text-[#4b5563]'
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] ${
              statusFilter === tab.key ? 'bg-[#e0e7ff] text-[#6366f1]' : 'bg-[#f1f3f5] text-[#9ca3af]'
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
                ? 'bg-[#e0e7ff] text-[#6366f1] border-[#6366f1]'
                : 'bg-transparent text-[#4b5563] border-[#e5e7eb] hover:border-[#6366f1] hover:text-[#6366f1]'
            }`}
          >
            {city.name}
          </button>
        ))}
        {selectedCities.length > 0 && (
          <button
            onClick={() => setSelectedCities([])}
            className="rounded-full px-[14px] py-1 text-[11px] font-medium text-[#dc2626] border border-[#fee2e2] hover:bg-[#fee2e2] transition-colors"
          >
            초기화
          </button>
        )}
      </div>

      {/* 테이블 */}
      <div className="bg-[#ffffff] rounded-[10px] border border-[#e5e7eb] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#f1f3f5] border-b border-[#e5e7eb]">
                <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.3px] text-[#9ca3af]">담당직원</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.3px] text-[#9ca3af]">빌라명</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.3px] text-[#9ca3af]">소유주</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.3px] text-[#9ca3af]">연락처</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.3px] text-[#9ca3af]">주소</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.3px] text-[#9ca3af]">종류</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.3px] text-[#9ca3af]">단계</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.3px] text-[#9ca3af]">상담내역</th>
                <th className="px-4 py-3 text-right text-[11px] font-medium tracking-[0.3px] text-[#9ca3af]">총공사비</th>
                <th className="px-4 py-3 text-right text-[11px] font-medium tracking-[0.3px] text-[#9ca3af]">미수금</th>
                <th className="w-10 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-[#9ca3af]">
                    불러오는 중...
                  </td>
                </tr>
              ) : filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-[#9ca3af]">
                    등록된 프로젝트가 없습니다
                  </td>
                </tr>
              ) : (
                filteredProjects.map(project => (
                  <tr
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    className={`border-b border-[#e5e7eb] cursor-pointer transition-colors h-[44px] ${
                      selectedProjectId === project.id
                        ? 'bg-[#e0e7ff]'
                        : 'hover:bg-[#e9ecef]'
                    }`}
                  >
                    <td className="px-4 py-2.5 font-medium text-[#111827]">{project.staff?.name || '-'}</td>
                    <td className="px-4 py-2.5 text-[#111827]">{project.building_name || '-'}</td>
                    <td className="px-4 py-2.5 text-[#4b5563]">{project.owner_name || '-'}</td>
                    <td className="px-4 py-2.5 text-[#4b5563]">{project.owner_phone || '-'}</td>
                    <td className="px-4 py-2.5 text-[#4b5563] max-w-[200px] truncate" title={project.road_address || ''}>
                      {project.road_address || '-'}
                    </td>
                    <td className="px-4 py-2.5">
                      {project.work_types?.name ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${getTypeBadgeColor()}`}>
                          {project.work_types.name}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${getStepBadgeColor(project.status)}`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#9ca3af] max-w-[160px] truncate" title={project.note || ''}>
                      {project.note || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#111827] whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {project.total_cost > 0 ? `${project.total_cost.toLocaleString()}원` : '-'}
                    </td>
                    <td className={`px-4 py-2.5 text-right whitespace-nowrap ${project.outstanding > 0 ? 'text-[#dc2626] font-medium' : 'text-[#9ca3af]'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
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
      <div className="mt-3 text-[13px] text-[#9ca3af]">
        총 {filteredProjects.length}건
        {filteredProjects.length > 0 && (
          <>
            {' / '}총공사비 <span style={{ fontVariantNumeric: 'tabular-nums' }}>{filteredProjects.reduce((s, p) => s + p.total_cost, 0).toLocaleString()}원</span>
            {' / '}미수금 <span style={{ fontVariantNumeric: 'tabular-nums' }}>{filteredProjects.reduce((s, p) => s + p.outstanding, 0).toLocaleString()}원</span>
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
    </div>
  )
}
