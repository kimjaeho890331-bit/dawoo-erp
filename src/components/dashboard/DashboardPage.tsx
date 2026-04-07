'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Mail, AlertTriangle, Route, Pin, X, ClipboardList, Loader, CheckCircle2, Banknote } from 'lucide-react'

// --- 타입 ---
interface Schedule {
  id: string
  site_id: string | null
  project_id: string | null
  staff_id: string | null
  schedule_type: string
  title: string
  start_date: string
  end_date: string
  contractor: string | null
  confirmed: boolean
  color: string
  memo: string | null
}

interface Site {
  id: string
  name: string
  status: string
  progress: number
  site_manager: string | null
}

interface Staff {
  id: string
  name: string
  role: string
}

interface Task {
  id: string
  content: string
  assigned_to: string | null
  assigned_by: string | null
  deadline: string | null
  done: boolean
}

interface Memo {
  id: string
  content: string
  pinned: boolean
}

interface ProjectRow {
  id: string
  staff_id: string | null
  status: string
  outstanding: number
  updated_at: string
}

const MEMO_STORAGE_KEY = 'dawoo_dashboard_memos'

function loadMemosFromStorage(): Memo[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(MEMO_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Memo[]
  } catch { /* ignore corrupt data */ }
  return null
}

function saveMemosToStorage(memos: Memo[]) {
  try {
    localStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify(memos))
  } catch { /* storage full etc */ }
}

const TYPE_COLORS: Record<string, string> = {
  project: '#3B82F6', personal: '#8B5CF6', promo: '#F59E0B', ai: '#06B6D4',
}
const TYPE_LABELS: Record<string, string> = {
  project: '지원사업', personal: '개인', promo: '홍보', ai: 'AI제안',
}

function addDays(d: string, n: number) {
  const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10)
}
function getDday(deadline: string | null) {
  if (!deadline) return null
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const d = new Date(deadline); d.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  return diff === 0 ? 'D-DAY' : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`
}
function getDdayColor(dday: string | null) {
  if (!dday) return 'text-txt-tertiary'
  if (dday === 'D-DAY' || dday.startsWith('D+')) return 'text-[#dc2626] font-semibold'
  const n = parseInt(dday.replace('D-', ''))
  return n <= 3 ? 'text-[#9a3412] font-medium' : 'text-txt-secondary'
}

export default function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10)
  const weekEnd = addDays(today, 6)
  const [todaySchedules, setTodaySchedules] = useState<Schedule[]>([])
  const [weekSchedules, setWeekSchedules] = useState<Schedule[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)

  // 업무 (추후 DB)
  const [receivedTasks, setReceivedTasks] = useState<Task[]>([
    { id: '1', content: '화성시 소규모 서류 제출', assigned_to: null, assigned_by: '김재호', deadline: addDays(today, 2), done: false },
    { id: '2', content: '안양시 수도공사 현장 실측', assigned_to: null, assigned_by: '김재호', deadline: addDays(today, 1), done: false },
    { id: '3', content: '견적서 3건 작성', assigned_to: null, assigned_by: '김재호', deadline: today, done: true },
  ])
  const [givenTasks] = useState<Task[]>([
    { id: '4', content: '성남시 실측 보고서 작성', assigned_to: 'staff1', assigned_by: null, deadline: addDays(today, 3), done: false },
    { id: '5', content: '수원시 홍보 전단지 배포', assigned_to: 'staff2', assigned_by: null, deadline: addDays(today, 1), done: false },
  ])

  // 메모장 (localStorage 연동)
  const [memos, setMemos] = useState<Memo[]>(() => {
    const stored = loadMemosFromStorage()
    return stored ?? [
      { id: '1', content: '이번 주 금요일 회의 - 상반기 실적 리뷰', pinned: true },
      { id: '2', content: '광명시 담당자 연락처 확인', pinned: false },
    ]
  })
  const [newMemo, setNewMemo] = useState('')

  // 메모 변경 시 localStorage 동기화
  useEffect(() => {
    saveMemosToStorage(memos)
  }, [memos])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [todayRes, weekRes, sitesRes, staffRes, projectsRes] = await Promise.all([
        supabase.from('schedules').select('*')
          .neq('schedule_type', 'site')
          .lte('start_date', today).gte('end_date', today)
          .order('start_date'),
        supabase.from('schedules').select('*')
          .neq('schedule_type', 'site')
          .lte('start_date', weekEnd).gte('end_date', today)
          .order('start_date'),
        supabase.from('sites').select('*')
          .in('status', ['착공', '공사중', '계약'])
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('staff').select('*').order('name'),
        supabase.from('projects').select('id, staff_id, status, outstanding, updated_at'),
      ])
      if (!todayRes.error) setTodaySchedules((todayRes.data as Schedule[]) || [])
      if (!weekRes.error) setWeekSchedules((weekRes.data as Schedule[]) || [])
      if (!sitesRes.error) setSites((sitesRes.data as Site[]) || [])
      if (!staffRes.error) setStaffList((staffRes.data as Staff[]) || [])
      if (!projectsRes.error) setProjects((projectsRes.data as ProjectRow[]) || [])
    } catch { /* */ }
    setLoading(false)
  }, [today, weekEnd])

  useEffect(() => { loadData() }, [loadData])

  const getStaffName = (id: string | null) => !id ? '' : staffList.find(s => s.id === id)?.name || ''
  const toggleTask = (id: string) => setReceivedTasks(p => p.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const addMemo = () => { if (!newMemo.trim()) return; setMemos(p => [{ id: Date.now().toString(), content: newMemo.trim(), pinned: false }, ...p]); setNewMemo('') }
  const togglePin = (id: string) => setMemos(p => p.map(m => m.id === id ? { ...m, pinned: !m.pinned } : m))
  const deleteMemo = (id: string) => setMemos(p => p.filter(m => m.id !== id))

  const now = new Date()
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']
  const todayLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 (${dayNames[now.getDay()]})`
  const sortedMemos = [...memos].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))

  // 나의 현황 통계 계산
  const COMPLETED_STATUSES = ['입금']
  const ACTIVE_STATUSES = ['실사', '견적전달', '동의서', '신청서제출', '승인', '착공계', '공사', '완료서류제출']
  const thisMonthStart = `${today.slice(0, 7)}-01`

  const totalProjects = projects.length
  const activeProjects = projects.filter(p => ACTIVE_STATUSES.includes(p.status)).length
  const completedThisMonth = projects.filter(
    p => COMPLETED_STATUSES.includes(p.status) && p.updated_at >= thisMonthStart
  ).length
  const totalOutstanding = projects.reduce((sum, p) => sum + (p.outstanding || 0), 0)

  if (loading) return <div className="p-6 max-w-[1200px] mx-auto"><div className="text-center py-20 text-txt-tertiary text-[13px]">불러오는 중...</div></div>

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-4 bg-page min-h-screen">

      {/* 헤더 */}
      <div className="bg-surface rounded-[10px] border border-border-primary px-6 py-5 border-l-4 border-l-accent">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">{todayLabel}</h1>
        <p className="text-[13px] text-txt-secondary mt-0.5">
          오늘 일정 {todaySchedules.length}건 · 진행 현장 {sites.length}개 · 미완료 업무 {receivedTasks.filter(t => !t.done).length}건
        </p>
      </div>

      {/* 나의 현황 */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { icon: <ClipboardList size={18} className="text-txt-tertiary" />, label: '담당 건수', value: `${totalProjects}건`, color: 'text-txt-primary' },
          { icon: <Loader size={18} className="text-txt-tertiary" />, label: '진행 중', value: `${activeProjects}건`, color: 'text-[#2563eb]' },
          { icon: <CheckCircle2 size={18} className="text-txt-tertiary" />, label: '이번 달 완료', value: `${completedThisMonth}건`, color: 'text-[#065f46]' },
          { icon: <Banknote size={18} className="text-txt-tertiary" />, label: '미수금', value: totalOutstanding > 0 ? `${totalOutstanding.toLocaleString()}원` : '0원', color: totalOutstanding > 0 ? 'text-[#dc2626]' : 'text-txt-primary' },
        ].map((card) => (
          <div key={card.label} className="bg-surface rounded-[10px] border border-border-primary px-5 py-4 flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-surface-tertiary flex items-center justify-center shrink-0">
              {card.icon}
            </div>
            <div>
              <div className="text-[11px] font-medium text-txt-tertiary tracking-[0.3px]">{card.label}</div>
              <div className={`text-[18px] font-semibold tracking-[-0.3px] ${card.color}`}>{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 1행: 받은업무 | 지시한업무 | AI 제안 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 받은 업무 */}
        <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center gap-2">
            <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">받은 업무</h2>
            {receivedTasks.filter(t => !t.done).length > 0 && (
              <span className="text-[11px] min-w-[18px] h-[18px] flex items-center justify-center bg-[#dc2626] text-white rounded-full font-medium">
                {receivedTasks.filter(t => !t.done).length}
              </span>
            )}
          </div>
          <div className="px-4 py-3">
            {receivedTasks.map(t => {
              const dday = getDday(t.deadline)
              return (
                <div key={t.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-tertiary ${t.done ? 'opacity-40' : ''}`}>
                  <button onClick={() => toggleTask(t.id)}
                    className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${t.done ? 'bg-[#065f46] border-[#065f46] text-white' : 'border-border-primary hover:border-accent'}`}>
                    {t.done && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] truncate ${t.done ? 'line-through text-txt-tertiary' : 'text-txt-primary'}`}>{t.content}</div>
                    <div className="text-[11px] font-medium text-txt-tertiary tracking-[0.3px]">지시: {t.assigned_by}</div>
                  </div>
                  {dday && <span className={`text-[11px] shrink-0 ${getDdayColor(dday)}`}>{dday}</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* 지시한 업무 */}
        <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center gap-2">
            <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">지시한 업무</h2>
            <span className="text-[11px] min-w-[18px] h-[18px] flex items-center justify-center bg-accent text-white rounded-full font-medium">
              {givenTasks.filter(t => !t.done).length}
            </span>
          </div>
          <div className="px-4 py-3">
            {givenTasks.map(t => {
              const dday = getDday(t.deadline)
              const name = getStaffName(t.assigned_to) || '미지정'
              return (
                <div key={t.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-tertiary">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.done ? 'bg-[#065f46]' : 'bg-[#9a3412]'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-txt-primary truncate">{t.content}</div>
                    <div className="text-[11px] font-medium text-txt-tertiary tracking-[0.3px]">담당: {name}</div>
                  </div>
                  {dday && <span className={`text-[11px] shrink-0 ${getDdayColor(dday)}`}>{dday}</span>}
                  <span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium ${t.done ? 'bg-[#d1fae5] text-[#065f46]' : 'bg-[#ffedd5] text-[#9a3412]'}`}>
                    {t.done ? '완료' : '진행중'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* AI 제안 */}
        <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center gap-2">
            <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">AI 제안</h2>
            <span className="text-[11px] px-[10px] py-[2px] bg-[#ffedd5] text-[#9a3412] rounded-full font-medium">Beta</span>
          </div>
          <div className="px-4 py-3 space-y-1">
            <AiRow icon={<Mail size={16} className="text-txt-tertiary" />} text="수원시 권선동 90일 미방문 → 홍보 추천" action="추가" />
            <AiRow icon={<AlertTriangle size={16} className="text-txt-tertiary" />} text="화성시 소규모 서류 D-3 지연 위험" action="확인" />
            <AiRow icon={<Route size={16} className="text-txt-tertiary" />} text="내일 안양+군포 실측 동선 묶기 가능" action="최적화" />
          </div>
        </div>
      </div>

      {/* 2행: 오늘일정 | 이번주일정 | 메모장 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 오늘 일정 */}
        <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">오늘 일정</h2>
              <span className="text-[11px] min-w-[18px] h-[18px] flex items-center justify-center bg-surface-tertiary text-txt-secondary rounded-full font-medium">{todaySchedules.length}</span>
            </div>
            <Link href="/calendar/work" className="text-[11px] text-link hover:underline">캘린더 →</Link>
          </div>
          <div className="px-4 py-3">
            {todaySchedules.length === 0 ? (
              <div className="text-center py-8 text-txt-quaternary text-[13px]">일정 없음</div>
            ) : (
              todaySchedules.map(s => (
                <div key={s.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-tertiary">
                  <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[s.schedule_type] || '#3B82F6' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-txt-primary truncate">
                      {getStaffName(s.staff_id) ? <span className="text-link">{getStaffName(s.staff_id)} </span> : ''}{s.title}
                    </div>
                    <span className="text-[11px] px-1 py-0.5 rounded font-medium"
                      style={{ backgroundColor: (TYPE_COLORS[s.schedule_type] || '#3B82F6') + '15', color: TYPE_COLORS[s.schedule_type] || '#3B82F6' }}>
                      {TYPE_LABELS[s.schedule_type] || s.schedule_type}
                    </span>
                  </div>
                  <div className={`w-1.5 h-1.5 rounded-full ${s.confirmed ? 'bg-[#065f46]' : 'bg-txt-quaternary'}`} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* 이번 주 */}
        <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center justify-between">
            <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">이번 주</h2>
            <span className="text-[11px] font-medium text-txt-tertiary tracking-[0.3px]">{today} ~ {weekEnd}</span>
          </div>
          <div className="px-4 py-3">
            {weekSchedules.filter(s => s.start_date > today).length === 0 ? (
              <div className="text-center py-8 text-txt-quaternary text-[13px]">추가 일정 없음</div>
            ) : (
              weekSchedules.filter(s => s.start_date > today).slice(0, 6).map(s => {
                const d = new Date(s.start_date)
                const dl = `${d.getMonth() + 1}/${d.getDate()}(${dayNames[d.getDay()]})`
                return (
                  <div key={s.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-tertiary">
                    <span className="text-[11px] font-medium text-txt-tertiary tracking-[0.3px] w-16 shrink-0">{dl}</span>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[s.schedule_type] || '#3B82F6' }} />
                    <span className="text-[13px] text-txt-primary truncate">{getStaffName(s.staff_id) ? `${getStaffName(s.staff_id)} ` : ''}{s.title}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 메모장 */}
        <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-tertiary">
            <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">메모장</h2>
          </div>
          <div className="px-4 py-3">
            <div className="flex gap-1.5 mb-2 px-1">
              <input value={newMemo} onChange={e => setNewMemo(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMemo()}
                placeholder="메모 입력..." className="flex-1 text-[13px] border border-border-primary rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-accent focus:outline-none bg-surface text-txt-primary placeholder:text-txt-tertiary" />
              <button onClick={addMemo} className="px-2.5 py-1.5 text-[13px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover shrink-0">추가</button>
            </div>
            {sortedMemos.length === 0 ? (
              <div className="text-center py-6 text-txt-quaternary text-[13px]">메모 없음</div>
            ) : (
              sortedMemos.map(m => (
                <div key={m.id} className={`flex items-start gap-1.5 px-2.5 py-2 rounded-lg group ${m.pinned ? 'bg-[#ffedd5]/30' : 'hover:bg-surface-tertiary'}`}>
                  <button onClick={() => togglePin(m.id)} className={`mt-0.5 shrink-0 ${m.pinned ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                    <Pin size={16} className={m.pinned ? 'text-[#d97706]' : 'text-txt-quaternary'} />
                  </button>
                  <span className="text-[13px] text-txt-secondary flex-1 leading-snug">{m.content}</span>
                  <button onClick={() => deleteMemo(m.id)} className="opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 text-txt-quaternary hover:text-[#dc2626]">
                    <X size={14} className="text-txt-tertiary" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 3행: 진행 현장 */}
      <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border-tertiary flex items-center justify-between">
          <h2 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary">진행 현장</h2>
          <Link href="/sites" className="text-[11px] text-link hover:underline">전체 보기 →</Link>
        </div>
        {sites.length === 0 ? (
          <div className="text-center py-6 text-txt-quaternary text-[13px]">진행 중인 현장 없음</div>
        ) : (
          <div className="grid grid-cols-3 gap-0 divide-x divide-border-tertiary">
            {sites.map(s => (
              <div key={s.id} className="px-5 py-4 hover:bg-surface-tertiary transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] font-medium text-txt-primary truncate">{s.name}</span>
                  <span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium ${
                    s.status === '공사중' ? 'bg-[#d1fae5] text-[#065f46]' :
                    s.status === '착공' ? 'bg-[#ffedd5] text-[#9a3412]' :
                    'bg-surface-tertiary text-txt-secondary'
                  }`}>{s.status}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${s.progress}%` }} />
                  </div>
                  <span className="text-[11px] font-medium text-txt-tertiary tracking-[0.3px] w-8 text-right tabular-nums">{s.progress}%</span>
                </div>
                {s.site_manager && <div className="text-[11px] font-medium text-txt-tertiary tracking-[0.3px] mt-1">소장: {s.site_manager}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AiRow({ icon, text, action }: { icon: ReactNode; text: string; action: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-tertiary">
      <span className="shrink-0 flex items-center">{icon}</span>
      <span className="text-[13px] text-txt-secondary flex-1 truncate">{text}</span>
      <button className="text-[13px] font-medium px-[10px] py-[2px] text-link border border-border-primary rounded-lg hover:bg-surface-tertiary shrink-0">{action}</button>
    </div>
  )
}
