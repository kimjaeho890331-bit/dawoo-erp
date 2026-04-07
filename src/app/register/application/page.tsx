'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Printer } from 'lucide-react'

interface ProjectData {
  id: string
  building_name: string | null
  road_address: string | null
  jibun_address: string | null
  owner_name: string | null
  owner_phone: string | null
  tenant_phone: string | null
  dong: string | null
  ho: string | null
  exclusive_area: number | null
  unit_count: number | null
  approval_date: string | null
  building_use: string | null
  total_cost: number
  self_pay: number
  city_support: number
  bank_name: string | null
  account_number: string | null
  account_holder: string | null
  note: string | null
  staff?: { name: string } | null
  cities?: { name: string } | null
  work_types?: { name: string } | null
}

function ApplicationFormContent() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId')
  const [project, setProject] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    async function load() {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          staff:staff_id ( name ),
          cities:city_id ( name ),
          work_types:work_type_id ( name )
        `)
        .eq('id', projectId)
        .single()
      if (!error && data) setProject(data as ProjectData)
      setLoading(false)
    }
    load()
  }, [projectId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-gray-500">불러오는 중...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-gray-500">프로젝트를 찾을 수 없습니다</p>
      </div>
    )
  }

  const today = new Date()
  const formattedDate = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      {/* 인쇄 버튼 */}
      <div className="max-w-[210mm] mx-auto mb-4 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Printer size={16} />
          인쇄 / PDF 저장
        </button>
      </div>

      {/* A4 용지 */}
      <div className="max-w-[210mm] mx-auto bg-white shadow-lg print:shadow-none p-[20mm] text-[14px] leading-relaxed text-black">
        {/* 제목 */}
        <h1 className="text-center text-[24px] font-bold mb-8 tracking-wider">
          소규모 주택수선 지원사업 신청서
        </h1>

        {/* 신청인 정보 */}
        <table className="w-full border-collapse border border-black mb-6">
          <tbody>
            <tr>
              <td colSpan={4} className="bg-gray-100 px-3 py-2 font-semibold text-[13px] border border-black">신청인 정보</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 w-[25%] text-[13px] font-medium border border-black">성명 (신청인)</td>
              <td className="px-3 py-2 w-[25%] text-[13px] border border-black">{project.owner_name || ''}</td>
              <td className="bg-gray-50 px-3 py-2 w-[25%] text-[13px] font-medium border border-black">연락처</td>
              <td className="px-3 py-2 w-[25%] text-[13px] border border-black">{project.owner_phone || ''}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">세입자 연락처</td>
              <td colSpan={3} className="px-3 py-2 text-[13px] border border-black">{project.tenant_phone || ''}</td>
            </tr>
          </tbody>
        </table>

        {/* 건물 정보 */}
        <table className="w-full border-collapse border border-black mb-6">
          <tbody>
            <tr>
              <td colSpan={4} className="bg-gray-100 px-3 py-2 font-semibold text-[13px] border border-black">건물 정보</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 w-[25%] text-[13px] font-medium border border-black">건물명</td>
              <td colSpan={3} className="px-3 py-2 text-[13px] border border-black">{project.building_name || ''}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">도로명주소</td>
              <td colSpan={3} className="px-3 py-2 text-[13px] border border-black">{project.road_address || ''}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">지번주소</td>
              <td colSpan={3} className="px-3 py-2 text-[13px] border border-black">{project.jibun_address || ''}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">동/호수</td>
              <td className="px-3 py-2 text-[13px] border border-black">
                {[project.dong, project.ho].filter(Boolean).join(' ') || ''}
              </td>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">전유면적</td>
              <td className="px-3 py-2 text-[13px] border border-black">
                {project.exclusive_area ? `${project.exclusive_area} m2` : ''}
              </td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">세대수</td>
              <td className="px-3 py-2 text-[13px] border border-black">{project.unit_count || ''}</td>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">사용승인일</td>
              <td className="px-3 py-2 text-[13px] border border-black">{project.approval_date || ''}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">용도</td>
              <td className="px-3 py-2 text-[13px] border border-black">{project.building_use || ''}</td>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">관할시</td>
              <td className="px-3 py-2 text-[13px] border border-black">{project.cities?.name || ''}</td>
            </tr>
          </tbody>
        </table>

        {/* 공사 정보 */}
        <table className="w-full border-collapse border border-black mb-6">
          <tbody>
            <tr>
              <td colSpan={4} className="bg-gray-100 px-3 py-2 font-semibold text-[13px] border border-black">공사 정보</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 w-[25%] text-[13px] font-medium border border-black">공사종류</td>
              <td className="px-3 py-2 w-[25%] text-[13px] border border-black">{project.work_types?.name || ''}</td>
              <td className="bg-gray-50 px-3 py-2 w-[25%] text-[13px] font-medium border border-black">담당자</td>
              <td className="px-3 py-2 w-[25%] text-[13px] border border-black">{project.staff?.name || ''}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">총공사비</td>
              <td className="px-3 py-2 text-[13px] border border-black">{project.total_cost ? `${project.total_cost.toLocaleString()}원` : ''}</td>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">시지원금 (80%)</td>
              <td className="px-3 py-2 text-[13px] border border-black">{project.city_support ? `${project.city_support.toLocaleString()}원` : ''}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">자부담 (20%)</td>
              <td colSpan={3} className="px-3 py-2 text-[13px] border border-black">{project.self_pay ? `${project.self_pay.toLocaleString()}원` : ''}</td>
            </tr>
          </tbody>
        </table>

        {/* 통장 정보 */}
        <table className="w-full border-collapse border border-black mb-8">
          <tbody>
            <tr>
              <td colSpan={4} className="bg-gray-100 px-3 py-2 font-semibold text-[13px] border border-black">입금 계좌 정보</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 w-[25%] text-[13px] font-medium border border-black">은행명</td>
              <td className="px-3 py-2 w-[25%] text-[13px] border border-black">{project.bank_name || ''}</td>
              <td className="bg-gray-50 px-3 py-2 w-[25%] text-[13px] font-medium border border-black">예금주</td>
              <td className="px-3 py-2 w-[25%] text-[13px] border border-black">{project.account_holder || ''}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 text-[13px] font-medium border border-black">계좌번호</td>
              <td colSpan={3} className="px-3 py-2 text-[13px] border border-black">{project.account_number || ''}</td>
            </tr>
          </tbody>
        </table>

        {/* 비고 */}
        <table className="w-full border-collapse border border-black mb-10">
          <tbody>
            <tr>
              <td className="bg-gray-50 px-3 py-2 w-[25%] text-[13px] font-medium border border-black">비고</td>
              <td className="px-3 py-2 text-[13px] border border-black min-h-[60px]">{project.note || ''}</td>
            </tr>
          </tbody>
        </table>

        {/* 서약문 */}
        <div className="text-[13px] leading-relaxed mb-10">
          <p className="mb-4">
            위와 같이 소규모 주택수선 지원사업에 신청하며, 사업 관련 제반 규정을 준수할 것을 서약합니다.
          </p>
        </div>

        {/* 날짜 + 서명 */}
        <div className="text-center text-[14px] mb-10">
          <p className="mb-8">{formattedDate}</p>
          <p className="mb-2">신청인: {project.owner_name || '___________'} (인)</p>
        </div>

        {/* 제출처 */}
        <div className="text-center text-[16px] font-semibold">
          <p>{project.cities?.name || '○○'}시장 귀하</p>
        </div>
      </div>

      {/* 인쇄 스타일 */}
      <style jsx global>{`
        @media print {
          body { margin: 0; padding: 0; }
          @page { size: A4; margin: 0; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:bg-white { background: white !important; }
          .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
        }
      `}</style>
    </div>
  )
}

export default function ApplicationFormPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">로딩중...</div>}>
      <ApplicationFormContent />
    </Suspense>
  )
}
