'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// --- 타입 (11개 채널) ---
interface Project {
  id: string; building_name: string | null; status: string; staff_id: string | null
  total_cost: number; self_pay: number; city_support: number; collected: number; outstanding: number
  survey_date: string | null; construction_date: string | null; completion_doc_date: string | null
  payment_date: string | null; created_at: string; year: number | null
  city_id: string | null; work_type_id: string | null; road_address: string | null
  water_work_type: string | null; support_program: string | null
}
interface Staff { id: string; name: string; role: string; salary: number | null }
interface Expense { id: string; category: string; amount: number; expense_date: string; site_id: string | null; staff_id: string | null; title: string }
interface FixedExpense { id: string; title: string; category: string; amount: number }
interface CardTxn { id: string; card_name: string; merchant: string; amount: number; category: string; transaction_date: string; staff_id: string | null; flagged: boolean }
interface AsRecord { id: string; status: string; issue_type: string; cost: number; reported_date: string; resolved_date: string | null; site_name: string | null; assigned_vendor_id: string | null }
interface LeaveReq { id: string; staff_id: string | null; leave_type: string; start_date: string; days: number; status: string }
interface Schedule { id: string; title: string; staff_id: string | null; schedule_type: string | null; start_date: string; end_date: string | null }
interface SiteLog { id: string; site_id: string | null; log_date: string; content: string | null; staff_id: string | null }
interface Template { id: string; name: string; updated_at: string | null }
interface Site { id: string; name: string; status: string | null }

const ACTIVE = ['문의', '실측', '견적전달', '동의서', '신청서제출', '승인', '착공계', '공사', '완료서류제출']
const DONE = ['입금', '완료']

type AlertLevel = 'urgent' | 'caution' | 'normal'

function daysSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000) }
function isYM(d: string | null, ym: string) { return d ? d.startsWith(ym) : false }
function isThisWeek(d: string | null) {
  if (!d) return false
  const dt = new Date(d), now = new Date()
  const s = new Date(now); s.setDate(now.getDate() - now.getDay()); s.setHours(0, 0, 0, 0)
  const e = new Date(s); e.setDate(s.getDate() + 7)
  return dt >= s && dt < e
}
function isToday(d: string | null) { return d ? d.startsWith(new Date().toISOString().slice(0, 10)) : false }
function fmt(n: number) { return n.toLocaleString() }
function fmtW(n: number) { return n >= 10000 ? `${Math.round(n / 10000)}만${n % 10000 > 0 ? ` ${fmt(n % 10000)}` : ''}원` : `${fmt(n)}원` }

type Tab = 'reports' | 'summary' | 'staff' | 'sites' | 'finance'
type ReportType = 'daily' | 'weekly' | 'monthly'

// 보고서 = 서술형 문단들
interface NarrativeReport {
  id: string
  type: ReportType
  title: string
  date: string
  read: boolean
  greeting: string          // 서두 인사
  overview: string          // 전체 요약 1~2줄
  urgentSection: string[]   // 긴급 사항 (빨간색)
  cautionSection: string[]  // 주의 사항 (노란색)
  sections: NarrativeSection[]  // 본문 섹션들
  closing: string           // 마무리
}
interface NarrativeSection {
  heading: string
  paragraphs: string[]   // 서술형 문단
  highlight?: 'good' | 'warn' | 'bad'
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('reports')
  const [projects, setProjects] = useState<Project[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [fixedExp, setFixedExp] = useState<FixedExpense[]>([])
  const [cardTxns, setCardTxns] = useState<CardTxn[]>([])
  const [asRecords, setAsRecords] = useState<AsRecord[]>([])
  const [leaves, setLeaves] = useState<LeaveReq[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [siteLogs, setSiteLogs] = useState<SiteLog[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [openReport, setOpenReport] = useState<string | null>(null)
  const [reportFilter, setReportFilter] = useState<'week' | 'month' | 'all'>('all')

  const loadData = useCallback(async () => {
    setLoading(true)
    const results = await Promise.all([
      supabase.from('projects').select('*'),
      supabase.from('staff').select('*'),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('fixed_expenses').select('*'),
      supabase.from('card_transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('as_records').select('*'),
      supabase.from('leave_requests').select('*'),
      supabase.from('schedules').select('*'),
      supabase.from('site_logs').select('*'),
      supabase.from('templates').select('*'),
      supabase.from('sites').select('*'),
    ])
    const safe = (r: { error: unknown; data: unknown }) => (!r.error && r.data) ? r.data as never[] : []
    setProjects(safe(results[0]))
    setStaff(safe(results[1]))
    setExpenses(safe(results[2]))
    setFixedExp(safe(results[3]))
    setCardTxns(safe(results[4]))
    setAsRecords(safe(results[5]))
    setLeaves(safe(results[6]))
    setSchedules(safe(results[7]))
    setSiteLogs(safe(results[8]))
    setTemplates(safe(results[9]))
    setSites(safe(results[10]))
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])
  const sn = useCallback((id: string | null) => !id ? '-' : staff.find(s => s.id === id)?.name || '-', [staff])

  // ===== 11개 채널 기반 분석 + 서술형 보고서 생성 =====
  const data = useMemo(() => {
    const now = new Date()
    const ym = now.toISOString().slice(0, 7)
    const today = now.toISOString().slice(0, 10)
    const thisYear = String(now.getFullYear())
    const monthName = `${now.getMonth() + 1}월`
    const dayStr = `${now.getMonth() + 1}월 ${now.getDate()}일`
    const weekDay = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()]

    // --- 기초 데이터 ---
    const active = projects.filter(p => ACTIVE.includes(p.status))
    const done = projects.filter(p => DONE.includes(p.status))
    const todayNew = projects.filter(p => isToday(p.created_at))
    const weekNew = projects.filter(p => isThisWeek(p.created_at))
    const monthNew = projects.filter(p => isYM(p.created_at, ym))
    const monthDone = done.filter(p => isYM(p.payment_date, ym))
    const stale30 = active.filter(p => daysSince(p.created_at) > 30)
    const stale60 = active.filter(p => daysSince(p.created_at) > 60)

    // 미수금
    const outstanding = done.map(p => {
      const expected = p.city_support || 0
      const paid = p.collected || 0
      const remaining = expected - paid
      const age = daysSince(p.completion_doc_date || p.payment_date || p.created_at)
      return { ...p, remaining, age }
    }).filter(p => p.remaining > 0).sort((a, b) => b.age - a.age)
    const totalOutstanding = outstanding.reduce((s, p) => s + p.remaining, 0)

    // 지출
    const mExp = expenses.filter(e => isYM(e.expense_date, ym))
    const mExpTotal = mExp.reduce((s, e) => s + e.amount, 0)
    const mCard = cardTxns.filter(c => isYM(c.transaction_date, ym))
    const mCardTotal = mCard.reduce((s, c) => s + c.amount, 0)
    const fixTotal = fixedExp.reduce((s, f) => s + f.amount, 0)
    const totalSpend = mExpTotal + mCardTotal + fixTotal
    const yearRevenue = projects.filter(p => p.payment_date?.startsWith(thisYear)).reduce((s, p) => s + (p.collected || 0), 0)

    // 이상지출
    type ExpFlag = { type: string; detail: string; level: AlertLevel }
    const expFlags: ExpFlag[] = []
    mCard.forEach(c => {
      if (c.category === '식대' && c.amount >= 15000)
        expFlags.push({ type: '식대 초과', detail: `${c.merchant} ${fmt(c.amount)}원`, level: 'caution' })
      if (c.amount >= 100000 && c.category === '주유')
        expFlags.push({ type: '유류비 고액', detail: `${c.merchant} ${fmt(c.amount)}원`, level: 'urgent' })
    })
    const conv = mCard.filter(c => ['편의점', 'CU', 'GS25', '세븐', '이마트24'].some(k => c.merchant.includes(k)))
    if (conv.length >= 10) expFlags.push({ type: '편의점 반복', detail: `월 ${conv.length}회`, level: 'caution' })

    // 캘린더
    const weekSchedules = schedules.filter(s => isThisWeek(s.start_date))
    const workers = staff.filter(s => s.role !== '관리자')
    const emptyWorkers = workers.filter(w => !weekSchedules.some(s => s.staff_id === w.id))

    // 현장
    const weekLogs = siteLogs.filter(l => isThisWeek(l.log_date))
    const todayLogs = siteLogs.filter(l => isToday(l.log_date))
    const activeSites = sites.filter(s => s.status !== '완료')

    // A/S
    const openAs = asRecords.filter(a => a.status !== '완료')
    const monthAs = asRecords.filter(a => isYM(a.reported_date, ym))

    // 서류
    const expiringDocs = templates.filter(t => {
      if (!t.updated_at) return false
      const d = daysSince(t.updated_at)
      return d > 300 && d < 400
    })

    // 직원 성과
    const staffPerf = workers.map(s => {
      const my = projects.filter(p => p.staff_id === s.id)
      const myActive = my.filter(p => ACTIVE.includes(p.status)).length
      const myDone = my.filter(p => DONE.includes(p.status)).length
      const conversion = my.length > 0 ? Math.round((myDone / my.length) * 100) : 0
      const wk = my.filter(p => isThisWeek(p.created_at)).length
      const mySchedules = weekSchedules.filter(sc => sc.staff_id === s.id).length
      const mExpense = expenses.filter(e => e.staff_id === s.id && isYM(e.expense_date, ym)).reduce((sum, e) => sum + e.amount, 0)
      const usedLeave = leaves.filter(l => l.staff_id === s.id && l.status === '승인').reduce((sum, l) => sum + l.days, 0)
      const myStale = my.filter(p => ACTIVE.includes(p.status) && daysSince(p.created_at) > 30)
      return { ...s, total: my.length, active: myActive, done: myDone, conversion, weekNew: wk, weekSchedules: mySchedules, monthExp: mExpense, usedLeave, staleCount: myStale.length, staleList: myStale }
    })

    // 연차
    const pendingLeaves = leaves.filter(l => l.status === '대기')
    const weekLeaves = leaves.filter(l => isThisWeek(l.start_date) && l.status === '승인')

    // ================================================================
    //  서술형 보고서 생성
    // ================================================================
    const reports: NarrativeReport[] = []

    // -------- 일일 보고서 --------
    const dailySections: NarrativeSection[] = []

    // 1) 지원사업 현황
    {
      const paras: string[] = []
      if (todayNew.length > 0) {
        const names = todayNew.map(p => p.building_name || '(미입력)').join(', ')
        paras.push(`오늘 신규 접수된 건은 ${todayNew.length}건입니다. (${names}) 담당 배정 및 실측 일정 확인이 필요합니다.`)
      } else {
        paras.push(`오늘 신규 접수 건은 없습니다.`)
      }
      paras.push(`현재 진행 중인 건은 총 ${active.length}건이며, 누적 완료 건은 ${done.length}건입니다.`)

      if (stale60.length > 0) {
        const names60 = stale60.slice(0, 3).map(p => `${p.building_name || '미상'}(${daysSince(p.created_at)}일, ${sn(p.staff_id)})`).join(', ')
        paras.push(`※ 60일 이상 정체 중인 건이 ${stale60.length}건 있습니다. ${names60}${stale60.length > 3 ? ' 외' : ''} — 담당자에게 사유 확인 후 조치가 필요합니다.`)
      } else if (stale30.length > 0) {
        paras.push(`30일 이상 진행이 지연된 건이 ${stale30.length}건 있습니다. 아직 긴급 단계는 아니나, 이번 주 내 현황 파악을 권장합니다.`)
      }

      // 단계별 분포
      const stageCounts = ACTIVE.map(st => ({ st, c: projects.filter(p => p.status === st).length })).filter(x => x.c > 0)
      if (stageCounts.length > 0) {
        const dist = stageCounts.map(x => `${x.st} ${x.c}건`).join(', ')
        paras.push(`단계별 현황: ${dist}`)
      }

      dailySections.push({ heading: '지원사업 현황', paragraphs: paras, highlight: stale60.length > 0 ? 'bad' : stale30.length > 0 ? 'warn' : undefined })
    }

    // 2) 미수금 현황
    {
      const paras: string[] = []
      if (outstanding.length === 0) {
        paras.push('현재 미수금 건은 없습니다. 수금 상태 양호합니다.')
      } else {
        paras.push(`완료 후 미수금이 남아있는 건이 총 ${outstanding.length}건, 합계 ${fmtW(totalOutstanding)}입니다.`)
        const urgent60 = outstanding.filter(p => p.age >= 60)
        if (urgent60.length > 0) {
          urgent60.slice(0, 3).forEach(p => {
            paras.push(`※ ${p.building_name || '미상'} — ${fmtW(p.remaining)} (${p.age}일 경과, 담당: ${sn(p.staff_id)}). 시 지원금 입금이 상당 기간 지연되고 있어 해당 시청 담당자에게 확인이 시급합니다.`)
          })
        }
        const caution30 = outstanding.filter(p => p.age >= 30 && p.age < 60)
        if (caution30.length > 0) {
          paras.push(`30일 이상 지연 ${caution30.length}건도 함께 모니터링이 필요합니다.`)
        }
      }
      dailySections.push({ heading: '미수금', paragraphs: paras, highlight: outstanding.filter(p => p.age >= 60).length > 0 ? 'bad' : outstanding.length > 0 ? 'warn' : 'good' })
    }

    // 3) 직원 활동
    {
      const paras: string[] = []
      if (workers.length === 0) {
        paras.push('등록된 직원이 없습니다.')
      } else {
        staffPerf.forEach(s => {
          let line = `${s.name} — 담당 ${s.total}건 (진행 ${s.active}, 완료 ${s.done}, 전환율 ${s.conversion}%)`
          if (s.weekSchedules > 0) {
            line += `. 이번 주 일정 ${s.weekSchedules}건 배정됨.`
          } else {
            line += `. 이번 주 배정된 일정이 없어 업무 확인 필요.`
          }
          if (s.staleCount > 0) {
            line += ` ※ 30일+ 정체 ${s.staleCount}건 보유 중.`
          }
          paras.push(line)
        })

        // 종합 코멘트
        const topPerf = [...staffPerf].sort((a, b) => b.conversion - a.conversion)[0]
        const lowPerf = [...staffPerf].sort((a, b) => a.conversion - b.conversion)[0]
        if (staffPerf.length >= 2 && topPerf && lowPerf && topPerf.id !== lowPerf.id) {
          paras.push(`전환율 기준 ${topPerf.name}(${topPerf.conversion}%)이 가장 높고, ${lowPerf.name}(${lowPerf.conversion}%)이 가장 낮습니다.`)
        }
      }
      dailySections.push({ heading: '직원 활동', paragraphs: paras })
    }

    // 4) 캘린더 & 일정
    {
      const paras: string[] = []
      paras.push(`이번 주 전체 일정은 ${weekSchedules.length}건이 등록되어 있습니다.`)
      if (emptyWorkers.length > 0) {
        paras.push(`※ ${emptyWorkers.map(w => w.name).join(', ')} — 이번 주 일정이 비어있습니다. 실측/시공/홍보 등 업무 배정이 필요합니다.`)
      }
      if (weekLeaves.length > 0) {
        const lvNames = weekLeaves.map(l => sn(l.staff_id)).join(', ')
        paras.push(`이번 주 연차 사용 예정 직원: ${lvNames}. 업무 공백 대비가 필요합니다.`)
      }
      if (pendingLeaves.length > 0) {
        paras.push(`승인 대기 중인 연차 신청이 ${pendingLeaves.length}건 있습니다.`)
      }
      dailySections.push({ heading: '캘린더 및 일정', paragraphs: paras, highlight: emptyWorkers.length > 0 ? 'warn' : undefined })
    }

    // 5) 현장
    {
      const paras: string[] = []
      paras.push(`현재 활성 현장은 ${activeSites.length}곳입니다.`)
      if (todayLogs.length > 0) {
        paras.push(`오늘 작성된 현장일지는 ${todayLogs.length}건입니다.`)
      } else {
        paras.push(`오늘 아직 작성된 현장일지가 없습니다.${activeSites.length > 0 ? ' 공사 중인 현장이 있다면 일지 작성을 독려해주세요.' : ''}`)
      }
      if (weekLogs.length > 0) {
        paras.push(`이번 주 현장일지 누적 ${weekLogs.length}건.`)
      }
      dailySections.push({ heading: '현장 현황', paragraphs: paras })
    }

    // 6) A/S
    if (openAs.length > 0 || monthAs.length > 0) {
      const paras: string[] = []
      if (openAs.length > 0) {
        paras.push(`현재 미완료 A/S가 ${openAs.length}건 남아있습니다.${openAs.length >= 3 ? ' 건수가 누적되고 있어 처리 속도를 높일 필요가 있습니다.' : ''}`)
        openAs.slice(0, 3).forEach(a => {
          const age = daysSince(a.reported_date)
          paras.push(`· ${a.site_name || '미상'} — ${a.issue_type} (접수 ${age}일 전)${age >= 14 ? ' ※ 2주 이상 지연' : ''}`)
        })
      }
      if (monthAs.length > 0) {
        paras.push(`이번 달 A/S 접수는 총 ${monthAs.length}건이며, A/S 비용 누적 ${fmtW(asRecords.reduce((s, a) => s + (a.cost || 0), 0))}입니다.`)
      }
      dailySections.push({ heading: 'A/S 현황', paragraphs: paras, highlight: openAs.length >= 3 ? 'warn' : undefined })
    }

    // 긴급/주의 분리
    const dailyUrgent: string[] = []
    const dailyCaution: string[] = []
    outstanding.filter(p => p.age >= 60).forEach(p => {
      dailyUrgent.push(`미수금 긴급 — ${p.building_name || '미상'} ${fmtW(p.remaining)} (${p.age}일 경과). 시청 확인 필요.`)
    })
    if (stale60.length > 0) dailyUrgent.push(`정체 긴급 — 60일 이상 정체 ${stale60.length}건. 담당자 사유 확인 필요.`)
    expFlags.filter(f => f.level === 'urgent').forEach(f => dailyUrgent.push(`이상지출 — ${f.type}: ${f.detail}`))
    if (expiringDocs.length > 0) dailyUrgent.push(`서류 만료 임박 — ${expiringDocs.length}건의 템플릿 유효기간이 곧 만료됩니다.`)

    outstanding.filter(p => p.age >= 30 && p.age < 60).forEach(p => {
      dailyCaution.push(`미수금 주의 — ${p.building_name || '미상'} ${fmtW(p.remaining)} (${p.age}일)`)
    })
    if (stale30.length > stale60.length) dailyCaution.push(`30일 이상 정체 ${stale30.length}건 — 주간 내 점검 권장.`)
    if (emptyWorkers.length > 0) dailyCaution.push(`일정 공백 — ${emptyWorkers.map(w => w.name).join(', ')} 이번 주 일정 미배정.`)
    expFlags.filter(f => f.level === 'caution').forEach(f => dailyCaution.push(`이상지출 — ${f.type}: ${f.detail}`))

    // 전체 상황 요약
    const overallStatus = dailyUrgent.length > 0 ? '긴급 사항이 있어 즉시 확인이 필요합니다.' : dailyCaution.length > 0 ? '주의가 필요한 사항이 있으나 전반적으로 정상 운영 중입니다.' : '전체적으로 양호합니다. 특별한 이상 없이 정상 운영 중입니다.'

    reports.push({
      id: `daily-${today}`,
      type: 'daily',
      title: `${dayStr}(${weekDay}) 일일 업무 보고`,
      date: today,
      read: false,
      greeting: `사장님, ${dayStr} ${weekDay}요일 업무 보고 드립니다.`,
      overview: overallStatus,
      urgentSection: dailyUrgent,
      cautionSection: dailyCaution,
      sections: dailySections,
      closing: dailyUrgent.length > 0
        ? '이상 긴급 사항 우선 보고 드렸습니다. 확인 후 지시 부탁드립니다.'
        : '이상 금일 업무 현황 보고 드렸습니다.',
    })

    // -------- 주간 보고서 --------
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay())
    const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()} ~ ${now.getMonth() + 1}/${now.getDate()}`

    const weeklySections: NarrativeSection[] = []

    // 주간 지원사업
    {
      const paras: string[] = []
      paras.push(`이번 주 신규 접수 ${weekNew.length}건, 이번 달 누적 완료 ${monthDone.length}건입니다. 현재 진행 중인 건은 총 ${active.length}건입니다.`)
      if (weekNew.length === 0) {
        paras.push('이번 주 신규 접수가 없었습니다. 홍보 활동 강화나 기존 문의 건 재접촉을 검토해볼 필요가 있습니다.')
      }
      if (stale30.length > 0) {
        paras.push(`30일 이상 정체 건이 ${stale30.length}건 누적되어 있습니다. 특히 60일 이상은 ${stale60.length}건으로, 장기 정체가 매출 지연의 원인이 될 수 있습니다.`)
        stale60.slice(0, 3).forEach(p => {
          paras.push(`  · ${p.building_name || '미상'} — ${p.status} 단계에서 ${daysSince(p.created_at)}일 정체 (담당: ${sn(p.staff_id)})`)
        })
      }
      weeklySections.push({ heading: '지원사업 진행 현황', paragraphs: paras, highlight: stale60.length > 0 ? 'bad' : undefined })
    }

    // 주간 직원 성과
    {
      const paras: string[] = []
      const sorted = [...staffPerf].sort((a, b) => b.conversion - a.conversion)
      sorted.forEach(s => {
        let eval_text = ''
        if (s.conversion >= 70) eval_text = '양호'
        else if (s.conversion >= 50) eval_text = '보통'
        else eval_text = '개선 필요'

        paras.push(`${s.name} — 전환율 ${s.conversion}%(${eval_text}). 이번 주 접수 +${s.weekNew}건, 일정 ${s.weekSchedules}건.${s.staleCount > 0 ? ` 정체 ${s.staleCount}건 보유.` : ''}`)
      })

      if (emptyWorkers.length > 0) {
        paras.push(`※ ${emptyWorkers.map(w => w.name).join(', ')}의 이번 주 일정이 비어있습니다. 업무 배분 재조정이 필요할 수 있습니다.`)
      }
      weeklySections.push({ heading: '직원 성과', paragraphs: paras })
    }

    // 주간 현장
    {
      const paras: string[] = []
      paras.push(`활성 현장 ${activeSites.length}곳, 이번 주 현장일지 ${weekLogs.length}건 작성되었습니다.`)
      if (activeSites.length > 0 && weekLogs.length === 0) {
        paras.push('※ 공사 중인 현장이 있으나 이번 주 현장일지가 하나도 없습니다. 현장 소장에게 일지 작성을 독려해주세요.')
      }
      if (openAs.length > 0) {
        paras.push(`A/S 미완료 ${openAs.length}건이 누적 중입니다.${openAs.length >= 3 ? ' 3건 이상 누적되어 하자 처리 속도 개선이 필요합니다.' : ''}`)
      }
      weeklySections.push({ heading: '현장 및 A/S', paragraphs: paras, highlight: openAs.length >= 3 ? 'warn' : undefined })
    }

    // 주간 미수금
    {
      const paras: string[] = []
      if (outstanding.length === 0) {
        paras.push('미수금 건 없음. 수금 상태 양호합니다.')
      } else {
        paras.push(`미수금 총 ${outstanding.length}건, ${fmtW(totalOutstanding)} 잔액입니다.`)
        const urgent60 = outstanding.filter(p => p.age >= 60)
        if (urgent60.length > 0) {
          paras.push(`60일 이상 장기 미수금 ${urgent60.length}건 — 시청 담당자 확인이 시급합니다.`)
          urgent60.forEach(p => paras.push(`  · ${p.building_name || '미상'}: ${fmtW(p.remaining)} (${p.age}일, ${sn(p.staff_id)})`))
        }
      }
      weeklySections.push({ heading: '미수금', paragraphs: paras, highlight: outstanding.filter(p => p.age >= 60).length > 0 ? 'bad' : outstanding.length > 0 ? 'warn' : 'good' })
    }

    // 주간 지출
    {
      const paras: string[] = []
      paras.push(`이번 달 지출 현황 — 지출결의 ${fmtW(mExpTotal)}, 카드 ${fmtW(mCardTotal)}, 고정비 ${fmtW(fixTotal)}, 합계 ${fmtW(totalSpend)}입니다.`)
      if (expFlags.length > 0) {
        paras.push(`이상지출이 ${expFlags.length}건 감지되었습니다.`)
        expFlags.forEach(f => paras.push(`  · ${f.type}: ${f.detail}`))
      } else {
        paras.push('특별한 이상지출은 감지되지 않았습니다.')
      }
      weeklySections.push({ heading: '지출 현황', paragraphs: paras, highlight: expFlags.length > 0 ? 'warn' : undefined })
    }

    reports.push({
      id: `weekly-${today}`,
      type: 'weekly',
      title: `${weekLabel} 주간 업무 보고`,
      date: today,
      read: false,
      greeting: `사장님, ${weekLabel} 주간 업무 보고 드립니다.`,
      overview: `이번 주 접수 ${weekNew.length}건, 진행 ${active.length}건, 미수금 ${fmtW(totalOutstanding)}. ${overallStatus}`,
      urgentSection: dailyUrgent,
      cautionSection: dailyCaution,
      sections: weeklySections,
      closing: '이상 주간 업무 보고 마치겠습니다. 추가 지시 사항 있으시면 말씀해주십시오.',
    })

    // -------- 월간 보고서 --------
    const monthlySections: NarrativeSection[] = []

    // 월간 지원사업
    {
      const paras: string[] = []
      paras.push(`${monthName} 신규 접수 ${monthNew.length}건, 완료 ${monthDone.length}건입니다. 현재 전체 진행 중 ${active.length}건, 누적 완료 ${done.length}건입니다.`)
      if (monthDone.length > monthNew.length) {
        paras.push('완료 건수가 접수 건수를 넘어서고 있어, 기존 파이프라인이 순조롭게 소화되고 있습니다.')
      } else if (monthNew.length > 0 && monthDone.length === 0) {
        paras.push('※ 이번 달 접수는 있었으나 완료가 없습니다. 파이프라인 병목이 없는지 점검이 필요합니다.')
      }
      monthlySections.push({ heading: '지원사업 월간 현황', paragraphs: paras })
    }

    // 월간 지출 (새는 돈 찾기)
    {
      const paras: string[] = []
      paras.push(`${monthName} 전체 지출 ${fmtW(totalSpend)} (결의 ${fmtW(mExpTotal)} + 카드 ${fmtW(mCardTotal)} + 고정 ${fmtW(fixTotal)})`)

      // 카테고리별 지출 분석
      const catSum: Record<string, number> = {}
      mExp.forEach(e => { catSum[e.category] = (catSum[e.category] || 0) + e.amount })
      mCard.forEach(c => { catSum[c.category] = (catSum[c.category] || 0) + c.amount })
      const sorted = Object.entries(catSum).sort((a, b) => b[1] - a[1])
      if (sorted.length > 0) {
        const top3 = sorted.slice(0, 3).map(([k, v]) => `${k} ${fmtW(v)}`).join(', ')
        paras.push(`지출 상위 항목: ${top3}`)
      }

      if (yearRevenue > 0) {
        const ratio = Math.round((totalSpend / yearRevenue) * 100)
        paras.push(`올해 수금 대비 이번 달 지출 비율은 ${ratio}%입니다.${ratio > 30 ? ' 지출 비율이 높은 편이니 비용 절감 포인트를 확인해보시기 바랍니다.' : ''}`)
      }

      if (expFlags.length > 0) {
        paras.push(`이상지출 감지 ${expFlags.length}건:`)
        expFlags.forEach(f => paras.push(`  · ${f.type} — ${f.detail}`))
      }

      // 고정지출 명세
      if (fixedExp.length > 0) {
        paras.push(`고정지출 ${fixedExp.length}건, 월 ${fmtW(fixTotal)}: ${fixedExp.map(f => `${f.title}(${fmtW(f.amount)})`).join(', ')}`)
      }

      monthlySections.push({ heading: '지출 분석 (새는 돈 찾기)', paragraphs: paras, highlight: expFlags.length > 0 ? 'warn' : undefined })
    }

    // 월간 미수금
    {
      const paras: string[] = []
      if (outstanding.length === 0) {
        paras.push('미수금 없음. 수금 관리 양호합니다.')
      } else {
        paras.push(`미수금 총 ${outstanding.length}건 / ${fmtW(totalOutstanding)}.`)
        const u60 = outstanding.filter(p => p.age >= 60)
        const u30 = outstanding.filter(p => p.age >= 30 && p.age < 60)
        if (u60.length > 0) paras.push(`긴급(60일+): ${u60.length}건 ${fmtW(u60.reduce((s, p) => s + p.remaining, 0))} — 시청 독촉 필요.`)
        if (u30.length > 0) paras.push(`주의(30~59일): ${u30.length}건 ${fmtW(u30.reduce((s, p) => s + p.remaining, 0))}`)
      }
      monthlySections.push({ heading: '미수금 현황', paragraphs: paras, highlight: totalOutstanding > 0 ? 'warn' : 'good' })
    }

    // 월간 직원 KPI
    {
      const paras: string[] = []
      const sorted = [...staffPerf].sort((a, b) => b.conversion - a.conversion)
      sorted.forEach(s => {
        paras.push(`${s.name} — 전환율 ${s.conversion}%, 월 지출 ${fmtW(s.monthExp)}, 연차 ${s.usedLeave}일.${s.staleCount > 0 ? ` 정체건 ${s.staleCount}건.` : ''}`)
      })
      monthlySections.push({ heading: '직원 KPI 요약', paragraphs: paras })
    }

    // 월간 A/S
    if (asRecords.length > 0) {
      const paras: string[] = []
      const asCost = asRecords.reduce((s, a) => s + (a.cost || 0), 0)
      paras.push(`이번 달 A/S 접수 ${monthAs.length}건, 미완료 ${openAs.length}건, 누적 A/S 비용 ${fmtW(asCost)}.`)
      if (openAs.length >= 3) {
        paras.push('미완료 건이 3건 이상 누적되고 있습니다. 처리 지연이 고객 불만으로 이어질 수 있으니 우선 처리를 권장합니다.')
      }
      monthlySections.push({ heading: 'A/S', paragraphs: paras, highlight: openAs.length >= 3 ? 'warn' : undefined })
    }

    // 서류함
    if (expiringDocs.length > 0) {
      monthlySections.push({
        heading: '서류함',
        paragraphs: [`유효기간 만료가 임박한 서류 템플릿이 ${expiringDocs.length}건 있습니다. 갱신 처리가 필요합니다.`],
        highlight: 'warn'
      })
    }

    reports.push({
      id: `monthly-${ym}`,
      type: 'monthly',
      title: `${monthName} 월간 경영 보고`,
      date: `${ym}-01`,
      read: false,
      greeting: `사장님, ${monthName} 월간 경영 보고 드립니다.`,
      overview: `${monthName} 접수 ${monthNew.length}건 / 완료 ${monthDone.length}건 / 지출 ${fmtW(totalSpend)} / 미수금 ${fmtW(totalOutstanding)}. ${overallStatus}`,
      urgentSection: dailyUrgent,
      cautionSection: dailyCaution,
      sections: monthlySections,
      closing: '이상 월간 보고를 마칩니다. 중점 관리 항목에 대해 추가 지시가 있으시면 말씀해주십시오.',
    })

    // 미확인 상단, 최신순
    reports.sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1
      return b.date.localeCompare(a.date)
    })

    return {
      active, done, todayNew, weekNew, monthNew, monthDone, stale30, stale60,
      outstanding, totalOutstanding,
      mExpTotal, mCardTotal, fixTotal, totalSpend, yearRevenue, expFlags,
      weekSchedules, emptyWorkers, weekLogs, openAs, monthAs,
      expiringDocs, staffPerf, reports, activeSites,
      dailyUrgent, dailyCaution,
    }
  }, [projects, staff, expenses, fixedExp, cardTxns, asRecords, leaves, schedules, siteLogs, templates, sites, sn])

  if (loading) return <div className="p-6 max-w-[1100px] mx-auto"><div className="text-center py-20 text-txt-tertiary">데이터 수집 중...</div></div>

  const TYPE_STYLE = {
    daily: { bg: 'bg-[#111827]', label: '일일' },
    weekly: { bg: 'bg-[#5e6ad2]', label: '주간' },
    monthly: { bg: 'bg-[#7c3aed]', label: '월간' },
  }

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">보고서</h1>
          <div className="flex bg-surface-secondary rounded-lg p-0.5">
            {([
              { key: 'reports' as Tab, label: '보고서' },
              { key: 'summary' as Tab, label: '긴급/요약' },
              { key: 'staff' as Tab, label: '직원 성과' },
              { key: 'sites' as Tab, label: '현장 현황' },
              { key: 'finance' as Tab, label: '매출/지출' },
            ]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-sm rounded-md transition ${tab === t.key ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-tertiary'}`}>
                {t.label}
                {t.key === 'reports' && data.reports.filter(r => !r.read).length > 0 && (
                  <span className="ml-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] rounded-full inline-flex items-center justify-center font-semibold">
                    {data.reports.filter(r => !r.read).length}
                  </span>
                )}
                {t.key === 'summary' && data.dailyUrgent.length > 0 && (
                  <span className="ml-1 w-2 h-2 bg-red-500 rounded-full inline-block" />
                )}
              </button>
            ))}
          </div>
        </div>
        <Link href="/kpi" className="px-3 py-1.5 text-sm text-link border border-[#c7d2fe] rounded-lg hover:bg-[#eef2ff]">KPI →</Link>
      </div>

      {/* ===== 탭 1: 보고서 목록 (서술형) ===== */}
      {tab === 'reports' && (
        <div className="space-y-4">
          {/* 기간 필터 */}
          <div className="flex items-center gap-1 bg-surface-secondary rounded-lg p-0.5 w-fit">
            {([
              { key: 'all' as const, label: '전체' },
              { key: 'month' as const, label: '이번 달' },
              { key: 'week' as const, label: '이번 주' },
            ]).map(f => (
              <button key={f.key} onClick={() => setReportFilter(f.key)}
                className={`px-3 py-1.5 text-[13px] rounded-md transition ${reportFilter === f.key ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'}`}>
                {f.label}
              </button>
            ))}
          </div>

          {data.reports.filter(report => {
            if (reportFilter === 'all') return true
            if (reportFilter === 'week') return isThisWeek(report.date)
            if (reportFilter === 'month') return isYM(report.date, new Date().toISOString().slice(0, 7))
            return true
          }).map(report => {
            const ts = TYPE_STYLE[report.type]
            const isOpen = openReport === report.id
            return (
              <div key={report.id} className={`bg-surface rounded-[10px] border overflow-hidden transition-all ${!report.read ? 'border-[#818cf8] shadow-md' : 'border-border-primary'}`}>
                {/* 보고서 헤더 */}
                <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-surface-tertiary"
                  onClick={() => setOpenReport(isOpen ? null : report.id)}>
                  {!report.read && <span className="w-2.5 h-2.5 bg-[#5e6ad2] rounded-full shrink-0 animate-pulse" />}
                  <span className={`text-[11px] px-2.5 py-1 rounded text-white font-semibold ${ts.bg}`}>{ts.label}</span>
                  <span className="font-semibold text-txt-primary flex-1 text-[15px]">{report.title}</span>
                  <span className="text-[11px] text-txt-tertiary">{report.date}</span>
                  <svg className={`w-4 h-4 text-txt-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>

                {/* 서술형 보고서 본문 */}
                {isOpen && (
                  <div className="border-t border-border-primary">
                    {/* 서두 */}
                    <div className="px-8 pt-6 pb-2">
                      <p className="text-[13px] text-txt-secondary leading-relaxed">{report.greeting}</p>
                      <p className="text-[13px] text-txt-primary font-medium mt-2 leading-relaxed">{report.overview}</p>
                    </div>

                    {/* 긴급 사항 */}
                    {report.urgentSection.length > 0 && (
                      <div className="mx-6 mt-4 rounded-lg bg-[#fee2e2] border border-[#fecaca] px-5 py-4">
                        <h4 className="text-[13px] font-semibold text-[#dc2626] mb-2 flex items-center gap-2">
                          <span className="w-2 h-2 bg-[#dc2626] rounded-full" /> 긴급 보고
                        </h4>
                        {report.urgentSection.map((msg, i) => (
                          <p key={i} className="text-[13px] text-[#dc2626] leading-relaxed mb-1 pl-4">• {msg}</p>
                        ))}
                      </div>
                    )}

                    {/* 주의 사항 */}
                    {report.cautionSection.length > 0 && (
                      <div className="mx-6 mt-3 rounded-lg bg-[#fef3c7] border border-[#fef3c7] px-5 py-4">
                        <h4 className="text-[13px] font-semibold text-[#d97706] mb-2 flex items-center gap-2">
                          <span className="w-2 h-2 bg-[#d97706] rounded-full" /> 주의 사항
                        </h4>
                        {report.cautionSection.map((msg, i) => (
                          <p key={i} className="text-[13px] text-[#d97706] leading-relaxed mb-1 pl-4">• {msg}</p>
                        ))}
                      </div>
                    )}

                    {/* 본문 섹션들 */}
                    <div className="px-8 py-5 space-y-5">
                      {report.sections.map((sec, si) => (
                        <div key={si} className={`rounded-lg px-5 py-4 ${
                          sec.highlight === 'bad' ? 'bg-[#fee2e2]/50 border border-[#fecaca]' :
                          sec.highlight === 'warn' ? 'bg-[#fef3c7]/50 border border-[#fef3c7]' :
                          sec.highlight === 'good' ? 'bg-[#d1fae5]/50 border border-[#a7f3d0]' :
                          'bg-surface-secondary border border-border-tertiary'
                        }`}>
                          <h4 className={`text-[14px] font-semibold tracking-[-0.1px] mb-3 ${
                            sec.highlight === 'bad' ? 'text-[#dc2626]' :
                            sec.highlight === 'warn' ? 'text-[#d97706]' :
                            sec.highlight === 'good' ? 'text-[#065f46]' :
                            'text-txt-secondary'
                          }`}>{si + 1}. {sec.heading}</h4>
                          {sec.paragraphs.map((para, pi) => (
                            <p key={pi} className={`text-[13px] leading-relaxed mb-2 ${
                              para.startsWith('※') ? 'text-[#dc2626] font-medium' :
                              para.startsWith('  ·') ? 'text-txt-tertiary pl-3' :
                              'text-txt-secondary'
                            }`}>{para}</p>
                          ))}
                        </div>
                      ))}
                    </div>

                    {/* 마무리 */}
                    <div className="px-8 pb-6">
                      <div className="border-t border-border-primary pt-4">
                        <p className="text-[13px] text-txt-tertiary italic">{report.closing}</p>
                        <p className="text-[11px] text-txt-quaternary mt-2">다우건설 AI ERP 자동 생성 보고서</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {data.reports.filter(report => {
            if (reportFilter === 'all') return true
            if (reportFilter === 'week') return isThisWeek(report.date)
            if (reportFilter === 'month') return isYM(report.date, new Date().toISOString().slice(0, 7))
            return true
          }).length === 0 && (
            <div className="bg-surface rounded-[10px] border border-border-primary text-center py-20 text-txt-quaternary text-[13px]">
              {reportFilter === 'all' ? '데이터가 쌓이면 보고서가 자동 생성됩니다' : '해당 기간에 보고서가 없습니다'}
            </div>
          )}
        </div>
      )}

      {/* ===== 탭 2: 긴급/요약 ===== */}
      {tab === 'summary' && (
        <div className="space-y-4">
          {/* 긴급 */}
          {data.dailyUrgent.length > 0 && (
            <div className="bg-[#fee2e2] border border-[#fecaca] rounded-[10px] p-5">
              <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-[#dc2626] mb-3">긴급 사항</h3>
              {data.dailyUrgent.map((msg, i) => (
                <p key={i} className="text-[13px] text-[#dc2626] leading-relaxed mb-1.5 pl-2">• {msg}</p>
              ))}
            </div>
          )}
          {/* 주의 */}
          {data.dailyCaution.length > 0 && (
            <div className="bg-[#fef3c7] border border-[#fef3c7] rounded-[10px] p-5">
              <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-[#d97706] mb-3">주의 사항</h3>
              {data.dailyCaution.map((msg, i) => (
                <p key={i} className="text-[13px] text-[#d97706] leading-relaxed mb-1.5 pl-2">• {msg}</p>
              ))}
            </div>
          )}
          {data.dailyUrgent.length === 0 && data.dailyCaution.length === 0 && (
            <div className="bg-[#d1fae5] border border-[#a7f3d0] rounded-[10px] p-5">
              <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-[#065f46]">정상</h3>
              <p className="text-[13px] text-[#065f46] mt-1">긴급/주의 사항 없이 정상 운영 중입니다.</p>
            </div>
          )}

          {/* 핵심 수치 요약 (간결하게) */}
          <div className="bg-surface rounded-[10px] border border-border-primary p-5">
            <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-3">현황 요약</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[13px]">
              <div className="flex justify-between py-1.5 border-b border-surface-secondary">
                <span className="text-txt-tertiary">진행 중</span><span className="font-semibold tabular-nums">{data.active.length}건</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-secondary">
                <span className="text-txt-tertiary">이번 달 완료</span><span className="font-semibold tabular-nums">{data.monthDone.length}건</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-secondary">
                <span className="text-txt-tertiary">미수금</span><span className={`font-semibold tabular-nums ${data.totalOutstanding > 0 ? 'text-[#dc2626]' : ''}`}>{fmtW(data.totalOutstanding)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-secondary">
                <span className="text-txt-tertiary">월 지출</span><span className="font-semibold tabular-nums">{fmtW(data.totalSpend)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-secondary">
                <span className="text-txt-tertiary">A/S 미완료</span><span className={`font-semibold tabular-nums ${data.openAs.length >= 3 ? 'text-[#d97706]' : ''}`}>{data.openAs.length}건</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-secondary">
                <span className="text-txt-tertiary">정체(30일+)</span><span className={`font-semibold tabular-nums ${data.stale30.length > 0 ? 'text-[#d97706]' : ''}`}>{data.stale30.length}건</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-secondary">
                <span className="text-txt-tertiary">활성 현장</span><span className="font-semibold tabular-nums">{data.activeSites.length}곳</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-secondary">
                <span className="text-txt-tertiary">올해 수금</span><span className="font-semibold text-[#065f46] tabular-nums">{fmtW(data.yearRevenue)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 탭 3: 직원 성과 ===== */}
      {tab === 'staff' && (
        <div className="space-y-4">
          {/* 서술형 직원 평가 */}
          {data.staffPerf.length > 0 ? (
            <div className="space-y-3">
              {[...data.staffPerf].sort((a, b) => b.conversion - a.conversion).map(s => {
                let evalGrade = ''
                let evalColor = ''
                if (s.conversion >= 70) { evalGrade = '양호'; evalColor = 'border-[#a7f3d0] bg-[#d1fae5]/30' }
                else if (s.conversion >= 50) { evalGrade = '보통'; evalColor = 'border-border-primary' }
                else { evalGrade = '개선필요'; evalColor = 'border-[#fecaca] bg-[#fee2e2]/30' }

                return (
                  <div key={s.id} className={`bg-surface rounded-[10px] border p-5 ${evalColor}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-surface-tertiary flex items-center justify-center text-sm font-semibold text-txt-secondary">{s.name.charAt(0)}</div>
                        <div>
                          <span className="font-semibold text-txt-primary">{s.name}</span>
                          <span className={`ml-2 text-[11px] px-2 py-0.5 rounded font-semibold ${
                            evalGrade === '양호' ? 'bg-[#d1fae5] text-[#065f46]' :
                            evalGrade === '보통' ? 'bg-surface-secondary text-txt-secondary' :
                            'bg-[#fee2e2] text-[#991b1b]'
                          }`}>{evalGrade}</span>
                        </div>
                      </div>
                      <span className={`text-2xl font-semibold tabular-nums ${
                        s.conversion >= 70 ? 'text-[#065f46]' : s.conversion >= 50 ? 'text-txt-secondary' : 'text-[#dc2626]'
                      }`}>{s.conversion}%</span>
                    </div>
                    {/* 활동 분포 바 */}
                    <div className="mb-3 space-y-1.5">
                      {[
                        { label: '담당 건수', value: s.total, max: Math.max(s.total, 1), color: 'bg-[#5e6ad2]' },
                        { label: '진행 중', value: s.active, max: Math.max(s.total, 1), color: 'bg-[#d97706]' },
                        { label: '완료', value: s.done, max: Math.max(s.total, 1), color: 'bg-[#065f46]' },
                        { label: '이번 주 접수', value: s.weekNew, max: Math.max(s.weekNew, 5), color: 'bg-[#7c3aed]' },
                        { label: '일정', value: s.weekSchedules, max: Math.max(s.weekSchedules, 5), color: 'bg-[#3b82f6]' },
                      ].map(bar => (
                        <div key={bar.label} className="flex items-center gap-2">
                          <span className="w-20 text-[11px] text-txt-tertiary shrink-0">{bar.label}</span>
                          <div className="flex-1 h-2 bg-surface-secondary rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${bar.color}`}
                              style={{ width: `${bar.max > 0 ? (bar.value / bar.max) * 100 : 0}%`, minWidth: bar.value > 0 ? '4px' : '0px' }} />
                          </div>
                          <span className="w-8 text-right text-[11px] font-medium text-txt-secondary tabular-nums">{bar.value}</span>
                        </div>
                      ))}
                    </div>

                    <div className="text-[13px] text-txt-secondary leading-relaxed space-y-1">
                      <p>담당 건수 {s.total}건 중 {s.done}건 완료, {s.active}건 진행 중. 전환율 {s.conversion}%{s.conversion >= 70 ? '로 안정적인 성과를 보이고 있습니다.' : s.conversion >= 50 ? '로 평균 수준입니다.' : '로, 완료율 개선이 필요합니다.'}</p>
                      {s.weekNew > 0 && <p>이번 주 신규 {s.weekNew}건 접수.</p>}
                      {s.weekSchedules > 0 ? (
                        <p>이번 주 일정 {s.weekSchedules}건 배정됨.</p>
                      ) : (
                        <p className="text-[#d97706]">※ 이번 주 배정 일정 없음. 업무 확인 필요.</p>
                      )}
                      {s.staleCount > 0 && (
                        <p className="text-[#dc2626]">※ 30일 이상 정체 {s.staleCount}건 보유 중.</p>
                      )}
                      <p className="text-txt-tertiary text-[11px] mt-2 tabular-nums">월 지출 {fmtW(s.monthExp)} | 연차 {s.usedLeave}일</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-surface rounded-[10px] border border-border-primary text-center py-16 text-txt-quaternary text-[13px]">등록된 직원이 없습니다</div>
          )}
        </div>
      )}

      {/* ===== 탭 4: 현장 현황 ===== */}
      {tab === 'sites' && (
        <div className="space-y-4">
          {/* 파이프라인 서술 */}
          <div className="bg-surface rounded-[10px] border border-border-primary p-5">
            <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-3">단계별 현황</h3>
            {(() => {
              const stages = ACTIVE.map(st => ({ st, c: projects.filter(p => p.status === st).length })).filter(x => x.c > 0)
              if (stages.length === 0) return <p className="text-[13px] text-txt-tertiary">진행 중인 건이 없습니다.</p>
              const bottleneck = stages.reduce((a, b) => a.c > b.c ? a : b)
              return (
                <div className="space-y-3">
                  <div className="flex gap-1.5 items-end">
                    {stages.map((x, i) => {
                      const mx = Math.max(...stages.map(s => s.c), 1)
                      const h = Math.max((x.c / mx) * 80, 16)
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[11px] font-semibold text-txt-secondary">{x.c}</span>
                          <div className={`w-full rounded-t ${x.st === bottleneck.st ? 'bg-[#dc2626]' : 'bg-[#5e6ad2]'}`} style={{ height: `${h}px`, opacity: 0.4 + ((i + 1) / stages.length) * 0.6 }} />
                          <span className="text-[9px] text-txt-tertiary text-center leading-tight">{x.st}</span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[13px] text-txt-secondary leading-relaxed">
                    현재 &apos;{bottleneck.st}&apos; 단계에 {bottleneck.c}건이 몰려있어 병목이 되고 있습니다. 이 단계의 처리 속도를 높이면 전체 흐름이 개선될 수 있습니다.
                  </p>
                </div>
              )
            })()}
          </div>

          {/* 정체 건 */}
          {data.stale30.length > 0 && (
            <div className="bg-surface rounded-[10px] border border-[#fef3c7] p-5">
              <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-3">정체 건 ({data.stale30.length}건)</h3>
              <p className="text-[13px] text-txt-secondary mb-3">
                아래 건들은 접수 후 30일 이상 경과했으나 아직 완료되지 않았습니다. 각 담당자에게 사유 확인이 필요합니다.
              </p>
              <div className="space-y-1.5">
                {data.stale30.sort((a, b) => daysSince(b.created_at) - daysSince(a.created_at)).map(p => {
                  const d = daysSince(p.created_at)
                  return (
                    <div key={p.id} className={`flex items-center justify-between rounded-lg px-4 py-2.5 ${d >= 60 ? 'bg-[#fee2e2]' : 'bg-[#fef3c7]'}`}>
                      <div>
                        <span className="text-[13px] font-medium text-txt-primary">{p.building_name || '-'}</span>
                        <span className="text-[11px] text-txt-tertiary ml-2">{p.status} · {sn(p.staff_id)}</span>
                      </div>
                      <span className={`text-[13px] font-semibold tabular-nums ${d >= 60 ? 'text-[#dc2626]' : 'text-[#d97706]'}`}>{d}일</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* A/S */}
          {data.openAs.length > 0 && (
            <div className="bg-surface rounded-[10px] border border-border-primary p-5">
              <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-2">A/S 미완료 ({data.openAs.length}건)</h3>
              <p className="text-[13px] text-txt-secondary mb-3">
                {data.openAs.length >= 3 ? '미완료 A/S가 3건 이상 누적되고 있습니다. 고객 불만으로 이어질 수 있으니 빠른 처리를 권장합니다.' : '현재 처리 대기 중인 A/S 건입니다.'}
              </p>
              {data.openAs.map(a => (
                <div key={a.id} className="flex items-center justify-between px-4 py-2 rounded bg-surface-secondary mb-1">
                  <span className="text-[13px] text-txt-secondary">{a.site_name || '-'} — {a.issue_type}</span>
                  <span className="text-[11px] text-txt-tertiary">{daysSince(a.reported_date)}일 전 접수</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== 탭 5: 매출/지출 ===== */}
      {tab === 'finance' && (
        <div className="space-y-4">
          {/* 서술형 재무 */}
          <div className="bg-surface rounded-[10px] border border-border-primary p-5">
            <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-3">재무 현황 요약</h3>
            <div className="text-[13px] text-txt-secondary leading-relaxed space-y-2">
              <p>올해 누적 수금 {fmtW(data.yearRevenue)}, 이번 달 지출 합계 {fmtW(data.totalSpend)} (결의 {fmtW(data.mExpTotal)} + 카드 {fmtW(data.mCardTotal)} + 고정 {fmtW(data.fixTotal)})입니다.</p>
              {data.yearRevenue > 0 && (
                <p>올해 수금 대비 이번 달 지출 비율은 {Math.round((data.totalSpend / data.yearRevenue) * 100)}%입니다.{Math.round((data.totalSpend / data.yearRevenue) * 100) > 30 ? ' 비율이 높은 편입니다.' : ''}</p>
              )}
              {data.totalOutstanding > 0 && (
                <p className="text-[#dc2626] font-medium">미수금 {data.outstanding.length}건 / {fmtW(data.totalOutstanding)}이 남아있어 현금 흐름에 영향을 줄 수 있습니다.</p>
              )}
            </div>
          </div>

          {/* 지출 구성 */}
          <div className="bg-surface rounded-[10px] border border-border-primary p-5">
            <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-3">이번 달 지출 구성</h3>
            <div className="space-y-2 mb-4">
              {[
                { l: '지출결의', v: data.mExpTotal, c: 'bg-[#5e6ad2]' },
                { l: '카드사용', v: data.mCardTotal, c: 'bg-[#7c3aed]' },
                { l: '고정지출', v: data.fixTotal, c: 'bg-[#9ca3af]' },
              ].map(x => (
                <div key={x.l} className="flex items-center gap-3">
                  <span className="w-16 text-[13px] text-txt-tertiary">{x.l}</span>
                  <div className="flex-1 h-3 bg-surface-secondary rounded-full overflow-hidden">
                    <div className={`h-full ${x.c} rounded-full`} style={{ width: data.totalSpend > 0 ? `${(x.v / data.totalSpend) * 100}%` : '0%' }} />
                  </div>
                  <span className="w-28 text-right text-[13px] font-medium tabular-nums">{fmtW(x.v)}</span>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-2 border-t border-border-tertiary">
                <span className="w-16 text-[13px] font-semibold text-txt-secondary">합계</span>
                <div className="flex-1" />
                <span className="w-28 text-right text-[13px] font-semibold text-txt-primary tabular-nums">{fmtW(data.totalSpend)}</span>
              </div>
            </div>
          </div>

          {/* 이상지출 */}
          {data.expFlags.length > 0 && (
            <div className="bg-[#fef3c7] border border-[#fef3c7] rounded-[10px] p-5">
              <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-[#d97706] mb-2">이상지출 감지 ({data.expFlags.length}건)</h3>
              <p className="text-[13px] text-[#d97706] mb-3">아래 항목들은 기준치를 초과하거나 패턴이 이상한 지출입니다. 확인이 필요합니다.</p>
              {data.expFlags.map((f, i) => (
                <p key={i} className="text-[13px] text-[#d97706] mb-1 pl-2">• {f.type}: {f.detail}</p>
              ))}
            </div>
          )}

          {/* 미수금 */}
          {data.outstanding.length > 0 && (
            <div className="bg-surface rounded-[10px] border border-[#fecaca] p-5">
              <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-2">미수금 ({fmtW(data.totalOutstanding)})</h3>
              <p className="text-[13px] text-txt-secondary mb-3">완료 후 지원금이 입금되지 않은 건입니다. 오래된 순으로 정렬됩니다.</p>
              <div className="space-y-1.5">
                {data.outstanding.map(p => (
                  <div key={p.id} className={`flex items-center justify-between px-4 py-2.5 rounded-lg ${p.age >= 60 ? 'bg-[#fee2e2]' : p.age >= 30 ? 'bg-[#fef3c7]' : 'bg-surface-secondary'}`}>
                    <div>
                      <span className="text-[13px] font-medium text-txt-primary">{p.building_name || '-'}</span>
                      <span className="text-[11px] text-txt-tertiary ml-2">{sn(p.staff_id)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[13px] font-semibold text-[#dc2626] tabular-nums">{fmtW(p.remaining)}</span>
                      <span className={`text-[11px] ml-2 tabular-nums ${p.age >= 60 ? 'text-[#dc2626] font-semibold' : p.age >= 30 ? 'text-[#d97706]' : 'text-txt-tertiary'}`}>{p.age}일</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 고정지출 */}
          {fixedExp.length > 0 && (
            <div className="bg-surface rounded-[10px] border border-border-primary p-5">
              <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-2">고정지출 (월 {fmtW(data.fixTotal)})</h3>
              <p className="text-[13px] text-txt-secondary mb-3">매월 고정적으로 나가는 비용입니다. 불필요한 항목이 없는지 정기적으로 점검해주세요.</p>
              <div className="grid grid-cols-2 gap-2">
                {fixedExp.map(f => (
                  <div key={f.id} className="flex justify-between px-4 py-2 rounded bg-surface-secondary text-[13px]">
                    <span className="text-txt-secondary">{f.title}</span>
                    <span className="font-medium tabular-nums">{fmtW(f.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
