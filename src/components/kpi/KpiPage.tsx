'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// --- 타입 ---
interface Project {
  id: string; building_name: string | null; status: string; staff_id: string | null
  total_cost: number; self_pay: number; collected: number
  survey_date: string | null; construction_date: string | null; completion_doc_date: string | null
  payment_date: string | null; created_at: string
}
interface Staff { id: string; name: string; role: string }
interface AsRecord { id: string; status: string; cost: number; reported_date: string; resolved_date: string | null; assigned_vendor_id: string | null }
interface Expense { id: string; amount: number; expense_date: string; staff_id: string | null; site_id: string | null }

const COMPLETE_STATUSES = ['입금', '완료']

// ===== 등급 =====
type GradeLevel = 'S' | 'A' | 'B' | 'C' | 'D'
function getGrade(score: number): GradeLevel {
  if (score >= 90) return 'S'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  return 'D'
}
const GRADE_STYLE: Record<GradeLevel, { bg: string; text: string; label: string; border: string }> = {
  S: { bg: 'bg-[#d1fae5]', text: 'text-[#065f46]', label: '탁월', border: 'border-[#a7f3d0]' },
  A: { bg: 'bg-[#e0e7ff]', text: 'text-[#3730a3]', label: '우수', border: 'border-[#c7d2fe]' },
  B: { bg: 'bg-[#f1f3f5]', text: 'text-[#4b5563]', label: '양호', border: 'border-[#e5e7eb]' },
  C: { bg: 'bg-[#fef3c7]', text: 'text-[#92400e]', label: '보통', border: 'border-[#fde68a]' },
  D: { bg: 'bg-[#fee2e2]', text: 'text-[#991b1b]', label: '미흡', border: 'border-[#fecaca]' },
}

// ===== 기준 설정 타입 =====
interface Threshold {
  key: string
  name: string
  area: string
  maxPoints: number
  excellent: number
  normal: number
  reverse: boolean // true면 낮을수록 우수
  unit: string
}

// 기본 기준값
const DEFAULT_THRESHOLDS: Threshold[] = [
  // 지원사업 (30점)
  { key: 'conversion', name: '접수 전환율', area: '지원사업', maxPoints: 10, excellent: 70, normal: 50, reverse: false, unit: '%' },
  { key: 'schedule', name: '일정 준수율', area: '지원사업', maxPoints: 8, excellent: 90, normal: 80, reverse: false, unit: '%' },
  { key: 'docError', name: '서류 오류율', area: '지원사업', maxPoints: 6, excellent: 5, normal: 10, reverse: true, unit: '%' },
  { key: 'collection', name: '미수금 회수기간', area: '지원사업', maxPoints: 6, excellent: 30, normal: 60, reverse: true, unit: '일' },
  // 현장 (25점)
  { key: 'progress', name: '공정 준수율', area: '현장', maxPoints: 8, excellent: 95, normal: 85, reverse: false, unit: '%' },
  { key: 'budget', name: '예산 대비 지출', area: '현장', maxPoints: 7, excellent: 100, normal: 110, reverse: true, unit: '%' },
  { key: 'defect', name: '하자 발생', area: '현장', maxPoints: 5, excellent: 0, normal: 2, reverse: true, unit: '건' },
  { key: 'siteLog', name: '현장일지 성실도', area: '현장', maxPoints: 5, excellent: 5, normal: 3, reverse: false, unit: '회/주' },
  // 업무효율 (25점 중 정량 20점)
  { key: 'activity', name: '활동량 추이', area: '업무효율', maxPoints: 8, excellent: 100, normal: 90, reverse: false, unit: '%' },
  { key: 'promo', name: '홍보 달성률', area: '업무효율', maxPoints: 7, excellent: 80, normal: 60, reverse: false, unit: '%' },
  { key: 'emptySchedule', name: '빈 일정 비율', area: '업무효율', maxPoints: 5, excellent: 20, normal: 40, reverse: true, unit: '%' },
  // 협력업체 (10점)
  { key: 'vendorDelivery', name: '납기 준수율', area: '협력업체', maxPoints: 4, excellent: 95, normal: 85, reverse: false, unit: '%' },
  { key: 'vendorQuality', name: '시공 품질(A/S)', area: '협력업체', maxPoints: 3, excellent: 0, normal: 1, reverse: true, unit: '건' },
  { key: 'vendorRehire', name: '재고용 횟수', area: '협력업체', maxPoints: 3, excellent: 5, normal: 2, reverse: false, unit: '회' },
]

// 정성 평가 항목
interface QualitativeItem {
  key: string; name: string; maxPoints: number; area: string
}
const QUALITATIVE_ITEMS: QualitativeItem[] = [
  { key: 'attitude', name: '업무 태도/협업', maxPoints: 5, area: '업무효율' },
  { key: 'emergency', name: '긴급 대응력', maxPoints: 3, area: '상황점수' },
  { key: 'teamwork', name: '팀 기여도', maxPoints: 3, area: '상황점수' },
  { key: 'growth', name: '자기 개발', maxPoints: 2, area: '상황점수' },
  { key: 'customer', name: '고객 관리', maxPoints: 2, area: '상황점수' },
]
// 5단계: 탁월=100%, 우수=80%, 보통=60%, 미흡=40%, 부족=20%
const QUAL_LEVELS = [
  { label: '탁월', pct: 100 },
  { label: '우수', pct: 80 },
  { label: '보통', pct: 60 },
  { label: '미흡', pct: 40 },
  { label: '부족', pct: 20 },
]

function calcScore(value: number, t: Threshold): number {
  let pct: number
  if (t.reverse) {
    if (value <= t.excellent) pct = 100
    else if (value <= t.normal) pct = 70
    else pct = 40
  } else {
    if (value >= t.excellent) pct = 100
    else if (value >= t.normal) pct = 70
    else pct = 40
  }
  return Math.round(t.maxPoints * pct / 100 * 10) / 10
}

type KpiTab = 'overview' | 'detail' | 'settings'

// 직원별 정성 점수
interface StaffQualScores {
  [staffId: string]: { [key: string]: number } // key = qualitative item key, value = pct (20~100)
}

export default function KpiPage() {
  const [tab, setTab] = useState<KpiTab>('overview')
  const [projects, setProjects] = useState<Project[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [asRecords, setAsRecords] = useState<AsRecord[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  // 기준값 (수정 가능)
  const [thresholds, setThresholds] = useState<Threshold[]>(DEFAULT_THRESHOLDS)
  // 정성 점수 (직원별, 대표 입력)
  const [qualScores, setQualScores] = useState<StaffQualScores>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    const [pR, sR, aR, eR] = await Promise.all([
      supabase.from('projects').select('*'),
      supabase.from('staff').select('*'),
      supabase.from('as_records').select('*'),
      supabase.from('expenses').select('*'),
    ])
    if (!pR.error) setProjects(pR.data || [])
    if (!sR.error) setStaff(sR.data || [])
    if (!aR.error) setAsRecords(aR.data || [])
    if (!eR.error) setExpenses(eR.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const getThreshold = (key: string) => thresholds.find(t => t.key === key)!
  const updateThreshold = (key: string, field: 'excellent' | 'normal', value: number) => {
    setThresholds(prev => prev.map(t => t.key === key ? { ...t, [field]: value } : t))
  }

  const getQualScore = (staffId: string, key: string): number => {
    return qualScores[staffId]?.[key] ?? 60 // 기본 보통(60%)
  }
  const setQualScore = (staffId: string, key: string, pct: number) => {
    setQualScores(prev => ({
      ...prev,
      [staffId]: { ...(prev[staffId] || {}), [key]: pct }
    }))
  }

  // ===== KPI 자동 계산 (thresholds, qualScores 변경 시 자동 재계산) =====
  const kpiData = useMemo(() => {
    const workers = staff.filter(s => s.role !== '관리자')

    const staffKpis = workers.map(s => {
      const my = projects.filter(p => p.staff_id === s.id)
      const total = my.length
      const completed = my.filter(p => COMPLETE_STATUSES.includes(p.status)).length

      // 지원사업 (30점)
      const conversion = total > 0 ? Math.round((completed / total) * 100) : 0
      const conversionScore = calcScore(conversion, getThreshold('conversion'))

      const scheduleRate = 85 // 데이터 쌓이면 실제값
      const scheduleScore = calcScore(scheduleRate, getThreshold('schedule'))

      const docErrorRate = 3
      const docErrorScore = calcScore(docErrorRate, getThreshold('docError'))

      const collDays = my.filter(p => p.completion_doc_date && p.payment_date)
        .map(p => Math.max(0, Math.floor((new Date(p.payment_date!).getTime() - new Date(p.completion_doc_date!).getTime()) / 86400000)))
      const avgCollection = collDays.length > 0 ? Math.round(collDays.reduce((a, b) => a + b, 0) / collDays.length) : 0
      const collectionScore = collDays.length > 0 ? calcScore(avgCollection, getThreshold('collection')) : 4.2

      const projectAreaScore = conversionScore + scheduleScore + docErrorScore + collectionScore

      // 현장 (25점)
      const myExp = expenses.filter(e => e.staff_id === s.id).reduce((sum, e) => sum + e.amount, 0)
      const myBudget = my.reduce((sum, p) => sum + (p.total_cost || 0), 0)
      const budgetRate = myBudget > 0 ? Math.round((myExp / myBudget) * 100) : 0
      const budgetScore = calcScore(budgetRate, getThreshold('budget'))

      const defectCount = 0
      const defectScore = calcScore(defectCount, getThreshold('defect'))

      const progressScore = calcScore(90, getThreshold('progress')) // 데이터 쌓이면 실제값
      const siteLogScore = calcScore(4, getThreshold('siteLog'))

      const siteAreaScore = progressScore + budgetScore + defectScore + siteLogScore

      // 업무효율 정량 (20점)
      const activityScore = calcScore(95, getThreshold('activity'))
      const promoScore = calcScore(70, getThreshold('promo'))
      const emptyScore = calcScore(25, getThreshold('emptySchedule'))
      const workQuantScore = activityScore + promoScore + emptyScore

      // 업무효율 정성: 업무태도 (5점)
      const attitudePct = getQualScore(s.id, 'attitude')
      const attitudeScore = Math.round(5 * attitudePct / 100 * 10) / 10

      const workAreaScore = workQuantScore + attitudeScore

      // 협력업체 (10점)
      const vendorDeliveryScore = calcScore(92, getThreshold('vendorDelivery'))
      const vendorQualityScore = calcScore(asRecords.length, getThreshold('vendorQuality'))
      const vendorRehireScore = calcScore(3, getThreshold('vendorRehire'))
      const vendorAreaScore = vendorDeliveryScore + vendorQualityScore + vendorRehireScore

      // 상황점수 정성 (10점)
      const situationScore = QUALITATIVE_ITEMS.filter(q => q.area === '상황점수')
        .reduce((sum, q) => sum + Math.round(q.maxPoints * getQualScore(s.id, q.key) / 100 * 10) / 10, 0)

      // 합산
      const quantitative = Math.round((projectAreaScore + siteAreaScore + workQuantScore + vendorAreaScore) * 10) / 10
      const qualitative = Math.round((attitudeScore + situationScore) * 10) / 10
      const totalScore = Math.round((quantitative + qualitative) * 10) / 10

      return {
        staff: s,
        total: totalScore, grade: getGrade(totalScore),
        quantitative, qualitative,
        // 영역별
        projectArea: Math.round(projectAreaScore * 10) / 10,
        siteArea: Math.round(siteAreaScore * 10) / 10,
        workArea: Math.round(workAreaScore * 10) / 10,
        vendorArea: Math.round(vendorAreaScore * 10) / 10,
        situationArea: Math.round(situationScore * 10) / 10,
        // 상세
        conversion, conversionScore, scheduleScore, docErrorScore, collectionScore, avgCollection,
        budgetRate, budgetScore, defectScore, progressScore, siteLogScore,
        activityScore, promoScore, emptyScore, attitudeScore, situationScore,
        vendorDeliveryScore, vendorQualityScore, vendorRehireScore,
        projectTotal: total,
      }
    }).sort((a, b) => b.total - a.total)

    const avg = staffKpis.length > 0 ? Math.round(staffKpis.reduce((s, k) => s + k.total, 0) / staffKpis.length * 10) / 10 : 0
    return { staffKpis, avgTotal: avg }
  }, [projects, staff, expenses, thresholds, qualScores])

  if (loading) return <div className="p-6 max-w-[1400px] mx-auto"><div className="text-center py-20 text-txt-tertiary">KPI 분석 중...</div></div>

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">KPI</h1>
          <div className="flex bg-surface-secondary rounded-lg p-0.5">
            {([
              { key: 'overview' as KpiTab, label: '종합' },
              { key: 'detail' as KpiTab, label: '상세' },
              { key: 'settings' as KpiTab, label: '기준설정' },
            ]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-sm rounded-md transition ${tab === t.key ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-tertiary'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <Link href="/reports" className="px-3 py-1.5 text-sm text-link border border-[#c7d2fe] rounded-lg hover:bg-[#eef2ff]">
          &larr; 보고서
        </Link>
      </div>

      {/* ===== 종합 ===== */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* 평균 + 배점 */}
          <div className="grid grid-cols-6 gap-3">
            <div className="bg-surface rounded-[10px] border border-border-primary p-5">
              <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">전체 평균</p>
              <div className="flex items-end gap-1 mt-1">
                <span className={`text-3xl font-semibold tabular-nums ${GRADE_STYLE[getGrade(kpiData.avgTotal)].text}`}>{kpiData.avgTotal}</span>
                <span className="text-sm text-txt-tertiary mb-1">/100</span>
              </div>
              <div className="mt-2"><GradeBadge grade={getGrade(kpiData.avgTotal)} /></div>
            </div>
            {[
              { l: '지원사업', p: 30, t: '정량 (AI)' }, { l: '현장', p: 25, t: '정량 (AI)' }, { l: '업무효율', p: 25, t: '정량+정성' }, { l: '협력업체', p: 10, t: '정량 (AI)' }, { l: '상황점수', p: 10, t: '정성 (대표)' },
            ].map((a, i) => (
              <div key={i} className="bg-surface rounded-[10px] border border-border-primary p-4">
                <p className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">{a.l}</p>
                <p className="text-2xl font-semibold text-txt-primary mt-1 tabular-nums">{a.p}<span className="text-sm font-normal text-txt-tertiary">점</span></p>
                <p className="text-[10px] text-txt-tertiary mt-1">{a.t}</p>
              </div>
            ))}
          </div>

          {/* 순위 테이블 */}
          <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
            <div className="px-4 py-3 border-b border-border-tertiary flex items-center justify-between">
              <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">직원별 KPI</h3>
              <span className="text-[10px] text-txt-tertiary">정량 75 + 정성 25 = 100점 | 기준설정 탭에서 수정 가능</span>
            </div>
            <table className="w-full text-[13px]">
              <thead><tr className="bg-surface-secondary border-b border-border-primary">
                <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary w-10">#</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">직원</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">지원사업<br/><span className="text-[9px] text-txt-quaternary">/30</span></th>
                <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">현장<br/><span className="text-[9px] text-txt-quaternary">/25</span></th>
                <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">업무효율<br/><span className="text-[9px] text-txt-quaternary">/25</span></th>
                <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">협력업체<br/><span className="text-[9px] text-txt-quaternary">/10</span></th>
                <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">상황<br/><span className="text-[9px] text-txt-quaternary">/10</span></th>
                <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">총점</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">등급</th>
              </tr></thead>
              <tbody className="divide-y divide-surface-secondary">
                {kpiData.staffKpis.map((k, i) => {
                  const st = GRADE_STYLE[k.grade]
                  return (
                    <tr key={k.staff.id} className="hover:bg-surface-tertiary">
                      <td className="px-4 py-3 text-center text-txt-tertiary">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-surface-tertiary flex items-center justify-center text-xs font-semibold text-txt-secondary">{k.staff.name.charAt(0)}</div>
                          <span className="font-medium text-txt-primary">{k.staff.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-txt-secondary tabular-nums">{k.projectArea}</td>
                      <td className="px-4 py-3 text-center text-txt-secondary tabular-nums">{k.siteArea}</td>
                      <td className="px-4 py-3 text-center text-txt-secondary tabular-nums">{k.workArea}</td>
                      <td className="px-4 py-3 text-center text-txt-secondary tabular-nums">{k.vendorArea}</td>
                      <td className="px-4 py-3 text-center text-txt-tertiary tabular-nums">{k.situationArea}</td>
                      <td className="px-4 py-3 text-center"><span className={`text-lg font-semibold tabular-nums ${st.text}`}>{k.total}</span></td>
                      <td className="px-4 py-3 text-center"><GradeBadge grade={k.grade} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 등급 범례 */}
          <div className="flex items-center justify-center gap-6">
            {(['S', 'A', 'B', 'C', 'D'] as GradeLevel[]).map(g => (
              <div key={g} className="flex items-center gap-1.5 text-xs">
                <GradeBadge grade={g} />
                <span className="text-txt-tertiary">{g === 'S' ? '90+' : g === 'A' ? '80~89' : g === 'B' ? '70~79' : g === 'C' ? '60~69' : '~59'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 상세 ===== */}
      {tab === 'detail' && (
        <div className="space-y-3">
          {kpiData.staffKpis.map(k => (
            <DetailCard key={k.staff.id} kpi={k} qualScores={qualScores} setQualScore={setQualScore} getQualScore={getQualScore} />
          ))}
        </div>
      )}

      {/* ===== 기준설정 ===== */}
      {tab === 'settings' && (
        <div className="space-y-4">
          <div className="bg-[#fef3c7] border border-[#fef3c7] rounded-lg px-4 py-3 text-sm text-[#d97706]">
            기준값을 수정하면 모든 직원의 KPI 점수가 즉시 재계산됩니다.
          </div>

          {/* 정량 기준 (수정 가능) */}
          {['지원사업', '현장', '업무효율', '협력업체'].map(area => (
            <div key={area} className="bg-surface rounded-[10px] border border-border-primary p-5">
              <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-3">
                {area}
                <span className="text-[11px] text-txt-tertiary font-normal ml-2">
                  {thresholds.filter(t => t.area === area).reduce((s, t) => s + t.maxPoints, 0)}점
                </span>
              </h3>
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-border-tertiary">
                  <th className="pb-2 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">지표</th>
                  <th className="pb-2 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary w-16">배점</th>
                  <th className="pb-2 text-center text-[11px] font-medium tracking-[0.3px] text-[#065f46] w-32">우수 (100%)</th>
                  <th className="pb-2 text-center text-[11px] font-medium tracking-[0.3px] text-[#d97706] w-32">보통 (70%)</th>
                  <th className="pb-2 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary w-20">단위</th>
                  <th className="pb-2 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary w-20">방향</th>
                </tr></thead>
                <tbody>
                  {thresholds.filter(t => t.area === area).map(t => (
                    <tr key={t.key} className="border-b border-surface-secondary">
                      <td className="py-2.5 text-txt-secondary">{t.name}</td>
                      <td className="py-2.5 text-center font-medium text-txt-primary tabular-nums">{t.maxPoints}</td>
                      <td className="py-2.5 text-center">
                        <input type="number" value={t.excellent}
                          onChange={e => updateThreshold(t.key, 'excellent', Number(e.target.value))}
                          className="w-20 text-center text-[13px] border border-[#a7f3d0] rounded px-2 py-1 focus:ring-1 focus:ring-[#065f46] focus:outline-none bg-[#d1fae5]/30 tabular-nums" />
                      </td>
                      <td className="py-2.5 text-center">
                        <input type="number" value={t.normal}
                          onChange={e => updateThreshold(t.key, 'normal', Number(e.target.value))}
                          className="w-20 text-center text-[13px] border border-[#fde68a] rounded px-2 py-1 focus:ring-1 focus:ring-[#d97706] focus:outline-none bg-[#fef3c7]/30 tabular-nums" />
                      </td>
                      <td className="py-2.5 text-center text-[11px] text-txt-tertiary">{t.unit}</td>
                      <td className="py-2.5 text-center text-[11px] text-txt-tertiary">{t.reverse ? '낮을수록 좋음' : '높을수록 좋음'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* 정성 평가 항목 */}
          <div className="bg-surface rounded-[10px] border border-border-primary p-5">
            <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-2">정성 평가 (25점) — 대표 직접 입력</h3>
            <p className="text-[11px] text-txt-tertiary mb-4">상세 탭에서 직원별로 평가합니다. 5단계: 탁월(100%) / 우수(80%) / 보통(60%) / 미흡(40%) / 부족(20%)</p>
            <div className="grid grid-cols-2 gap-3">
              {QUALITATIVE_ITEMS.map(q => (
                <div key={q.key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-secondary">
                  <div>
                    <span className="text-[13px] text-txt-secondary">{q.name}</span>
                    <span className="text-[10px] text-txt-tertiary ml-2">{q.area}</span>
                  </div>
                  <span className="text-[13px] font-medium text-txt-primary tabular-nums">{q.maxPoints}점</span>
                </div>
              ))}
            </div>
          </div>

          {/* 등급 */}
          <div className="bg-surface rounded-[10px] border border-border-primary p-5">
            <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-3">등급 기준</h3>
            <div className="grid grid-cols-5 gap-3">
              {[
                { g: 'S' as GradeLevel, r: '90~100', d: '핵심 인재' },
                { g: 'A' as GradeLevel, r: '80~89', d: '기대 이상' },
                { g: 'B' as GradeLevel, r: '70~79', d: '기대 충족' },
                { g: 'C' as GradeLevel, r: '60~69', d: '개선 여지' },
                { g: 'D' as GradeLevel, r: '~59', d: '면담 필요' },
              ].map(item => {
                const st = GRADE_STYLE[item.g]
                return (
                  <div key={item.g} className={`rounded-lg border p-3 text-center ${st.bg} ${st.border}`}>
                    <span className={`text-2xl font-semibold ${st.text}`}>{item.g}</span>
                    <p className="text-[11px] text-txt-tertiary mt-1">{item.r}</p>
                    <p className={`text-[11px] font-medium ${st.text}`}>{item.d}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 직원 상세 카드 =====
function DetailCard({ kpi, qualScores, setQualScore, getQualScore }: {
  kpi: any; qualScores: StaffQualScores
  setQualScore: (sid: string, key: string, pct: number) => void
  getQualScore: (sid: string, key: string) => number
}) {
  const [open, setOpen] = useState(false)
  const st = GRADE_STYLE[kpi.grade as GradeLevel]

  // 상황점수 개별 항목 계산
  const situationItems = {
    emergency: Math.round(3 * getQualScore(kpi.staff.id, 'emergency') / 100 * 10) / 10,
    teamwork: Math.round(3 * getQualScore(kpi.staff.id, 'teamwork') / 100 * 10) / 10,
    growth: Math.round(2 * getQualScore(kpi.staff.id, 'growth') / 100 * 10) / 10,
    customer: Math.round(2 * getQualScore(kpi.staff.id, 'customer') / 100 * 10) / 10,
  }

  const indicators = [
    { area: '지원사업 /30', items: [
      { n: '전환율', v: `${kpi.conversion}%`, s: kpi.conversionScore, m: 10 },
      { n: '일정준수', v: '-', s: kpi.scheduleScore, m: 8 },
      { n: '서류오류', v: '-', s: kpi.docErrorScore, m: 6 },
      { n: '미수금회수', v: kpi.avgCollection > 0 ? `${kpi.avgCollection}일` : '-', s: kpi.collectionScore, m: 6 },
    ]},
    { area: '현장 /25', items: [
      { n: '공정준수', v: '-', s: kpi.progressScore, m: 8 },
      { n: '예산지출', v: kpi.budgetRate > 0 ? `${kpi.budgetRate}%` : '-', s: kpi.budgetScore, m: 7 },
      { n: '하자', v: '0건', s: kpi.defectScore, m: 5 },
      { n: '일지성실', v: '-', s: kpi.siteLogScore, m: 5 },
    ]},
    { area: '업무효율 /25', items: [
      { n: '활동량', v: '-', s: kpi.activityScore, m: 8 },
      { n: '홍보달성', v: '-', s: kpi.promoScore, m: 7 },
      { n: '빈일정', v: '-', s: kpi.emptyScore, m: 5 },
      { n: '업무태도', v: '정성', s: kpi.attitudeScore, m: 5 },
    ]},
    { area: '협력업체 /10', items: [
      { n: '납기준수', v: '-', s: kpi.vendorDeliveryScore, m: 4 },
      { n: '시공품질', v: '-', s: kpi.vendorQualityScore, m: 3 },
      { n: '재고용', v: '-', s: kpi.vendorRehireScore, m: 3 },
    ]},
    { area: '상황점수 /10', items: [
      { n: '긴급대응', v: '정성', s: situationItems.emergency, m: 3 },
      { n: '팀기여', v: '정성', s: situationItems.teamwork, m: 3 },
      { n: '자기개발', v: '정성', s: situationItems.growth, m: 2 },
      { n: '고객관리', v: '정성', s: situationItems.customer, m: 2 },
    ]},
  ]

  return (
    <div className={`bg-surface rounded-[10px] border ${open ? st.border : 'border-border-primary'} overflow-hidden`}>
      {/* 접힌 헤더 */}
      <div className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-surface-tertiary" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-tertiary flex items-center justify-center text-sm font-semibold text-txt-secondary">{kpi.staff.name.charAt(0)}</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-txt-primary">{kpi.staff.name}</span>
              <GradeBadge grade={kpi.grade} />
            </div>
            <p className="text-[11px] text-txt-tertiary">담당 {kpi.projectTotal}건 | 전환율 {kpi.conversion}%</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-24 h-2.5 bg-surface-secondary rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${kpi.total >= 80 ? 'bg-[#065f46]' : kpi.total >= 60 ? 'bg-[#d97706]' : 'bg-[#dc2626]'}`}
              style={{ width: `${kpi.total}%` }} />
          </div>
          <span className={`text-xl font-semibold ${st.text} w-14 text-right tabular-nums`}>{kpi.total}</span>
          <span className="text-txt-tertiary text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* 펼친 상세 */}
      {open && (
        <div className="border-t border-border-tertiary px-5 py-4 space-y-4">
          {/* 정량 영역별 바 */}
          <div className="grid grid-cols-5 gap-4">
            {indicators.map((area, ai) => (
              <div key={ai}>
                <p className="text-[11px] font-semibold text-txt-secondary mb-2">{area.area}</p>
                <div className="space-y-2">
                  {area.items.map((item, ii) => {
                    const pct = item.m > 0 ? (item.s / item.m) * 100 : 0
                    return (
                      <div key={ii}>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-txt-tertiary">{item.n}</span>
                          <span className="font-medium text-txt-secondary tabular-nums">{item.s}/{item.m}</span>
                        </div>
                        <div className="h-1.5 bg-surface-secondary rounded-full mt-0.5 overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 80 ? 'bg-[#065f46]' : pct >= 60 ? 'bg-[#d97706]' : 'bg-[#dc2626]'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        {item.v !== '-' && item.v !== '정성' && <p className="text-[9px] text-txt-tertiary mt-0.5">{item.v}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* 정성 평가 입력 */}
          <div className="border-t border-border-tertiary pt-3">
            <p className="text-[11px] font-semibold text-txt-secondary mb-2">정성 평가 (대표 입력) — 상황점수 /10 + 업무태도 /5</p>
            <div className="grid grid-cols-5 gap-2">
              {QUALITATIVE_ITEMS.map(q => {
                const current = getQualScore(kpi.staff.id, q.key)
                return (
                  <div key={q.key} className="bg-surface-secondary rounded-lg px-3 py-2">
                    <p className="text-[11px] text-txt-tertiary mb-1">{q.name} <span className="text-txt-quaternary">({q.maxPoints}점)</span></p>
                    <select
                      value={current}
                      onChange={e => setQualScore(kpi.staff.id, q.key, Number(e.target.value))}
                      className="w-full text-xs border border-border-primary rounded px-1.5 py-1 bg-surface focus:ring-1 focus:border-accent focus:ring-accent focus:outline-none"
                    >
                      {QUAL_LEVELS.map(lv => (
                        <option key={lv.pct} value={lv.pct}>{lv.label} ({Math.round(q.maxPoints * lv.pct / 100 * 10) / 10}점)</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 합계 */}
          <div className="flex justify-between text-xs pt-2 border-t border-border-tertiary">
            <div className="flex gap-4">
              <span className="text-link">정량: {kpi.quantitative}/75</span>
              <span className="text-[#7c3aed]">정성: {kpi.qualitative}/25</span>
            </div>
            <span className={`font-semibold ${st.text}`}>{kpi.total}/100 ({GRADE_STYLE[kpi.grade as GradeLevel].label})</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 공통 =====
function GradeBadge({ grade }: { grade: GradeLevel }) {
  const st = GRADE_STYLE[grade]
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] rounded-full font-semibold px-2 py-0.5 ${st.bg} ${st.text} ${st.border} border`}>
      {grade} {st.label}
    </span>
  )
}
