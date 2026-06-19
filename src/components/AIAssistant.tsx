'use client'
// AI 비서 — 중앙 팝업 채팅 + 좌측 지난대화 레일(이어보기) + 작업 확인 카드 + 피드백 + 사진 첨부
// /api/chat (SSE 스트리밍) 호출. 쓰기 작업은 백엔드가 confirm 이벤트를 보내고,
// 사용자가 [등록] 누르면 /api/chat (executeAction) 으로 실제 실행.
// FIELDON AiBotFloat.jsx 패턴을 dawoo 디자인 토큰 + Lucide(이모지 금지)로 이식.
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles, X, Plus, Trash2, Send, Paperclip, ThumbsUp, ThumbsDown, Menu,
  ClipboardList, Calendar, FileText, CheckCircle2, AlertTriangle, Loader2,
} from 'lucide-react'

type Variant = 'create' | 'money' | 'delete'
type CardStatus = 'pending' | 'done' | 'error' | 'cancelled'

interface Message {
  role: 'user' | 'assistant'
  content: string
  type?: 'confirm'
  tool?: string
  input?: Record<string, unknown>
  variant?: Variant
  status?: CardStatus
  image?: string | null   // 이미지 첨부 미리보기(data URL)
  fileName?: string       // 비이미지(PDF) 첨부 파일명
}

interface Brief {
  name: string
  stats: { ongoingIntake: number; todaySchedules: number; monthIntake: number }
}

type PendingAttach = { kind: 'image' | 'file'; dataUrl?: string; base64: string; mediaType: string; name: string }

interface SessionItem {
  id: string
  title: string | null
  last_message_at: string
  flagged?: boolean
}

const GREETING: Message = {
  role: 'assistant',
  content:
    '안녕하세요. 다우건설 AI 비서입니다.\n접수대장(소규모·수도) 등록·조회, 일정·현장·지출·거래처 조회, 입금 매칭·기록, 보고서·실적 집계까지 도와드립니다.\n\n무엇을 도와드릴까요?',
}

// 다우 업무에 맞춘 추천 — 의도별 그룹 (FIELDON 카피가 아니라 다우 용어/흐름)
const SUGGESTION_GROUPS: { cat: string; items: { label: string; text: string }[] }[] = [
  { cat: '조회', items: [
    { label: '진행 접수', text: '진행중인 접수 현황 알려줘' },
    { label: '오늘 일정', text: '오늘 일정 알려줘' },
    { label: '진행 현장', text: '진행중인 현장 알려줘' },
  ] },
  { cat: '등록', items: [
    { label: '접수 등록', text: '새 접수를 등록할게요' },
    { label: '일정 잡기', text: '내일 오전 10시 권선동 실측 일정 김재호' },
    { label: '지출 등록', text: '지출을 등록할게요' },
  ] },
  { cat: '정산·보고', items: [
    { label: '입금 매칭', text: '입금 문자를 붙여넣어 주세요' },
    { label: '이번 달 실적', text: '이번 달 실적 통계 보여줘' },
    { label: '일일 보고서', text: '오늘 일일보고서 만들어줘' },
  ] },
]

function greetingByHour(): string {
  const h = new Date().getHours()
  if (h < 6) return '늦은 시간까지 고생 많으세요'
  if (h < 12) return '좋은 아침이에요'
  if (h < 18) return '좋은 오후예요'
  return '오늘도 수고 많으셨어요'
}

// 레일 상대시간 (오늘이면 HH:MM, 아니면 M/D)
function fmtWhen(iso: string): string {
  try {
    const d = new Date(iso), now = new Date()
    if (d.toDateString() === now.toDateString()) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return `${d.getMonth() + 1}/${d.getDate()}`
  } catch { return '' }
}

const ACTION_LABEL: Record<string, string> = {
  register_project: '접수 등록',
  update_project: '접수 정보 수정',
  update_status: '단계 변경',
  manage_schedule: '일정 등록',
  manage_expense: '지출 등록',
  record_deposit: '입금 기록',
  manage_memory: '기억 저장',
  manage_drive: '드라이브 폴더 생성',
  save_photo_to_drive: '사진 저장',
}

function cardLabel(tool: string, input: Record<string, unknown>): string {
  if (tool === 'manage_schedule' && input.action === 'delete') return '일정 삭제'
  return ACTION_LABEL[tool] || '등록'
}

function won(v: unknown): string {
  return (Number(v) || 0).toLocaleString('ko-KR') + '원'
}

function heroAmount(tool: string, input: Record<string, unknown>): number {
  if (tool === 'manage_expense' || tool === 'record_deposit') return Number(input.amount) || 0
  return 0
}

// 확인 카드 요약 행 (사람이 한눈에 검토)
function summarizeWrite(tool: string, input: Record<string, unknown>): [string, string][] {
  const s = (v: unknown) => (v === undefined || v === null || v === '' ? '' : String(v))
  const rows: [string, string][] = []
  if (tool === 'register_project') {
    rows.push(['구분', s(input.category) || '-'])
    rows.push(['빌라명', s(input.building_name) || '-'])
    rows.push(['소유주', s(input.owner_name) || '-'])
    rows.push(['연락처', s(input.owner_phone) || '-'])
    const addr = s(input.road_address) || s(input.jibun_address)
    if (addr) rows.push(['주소', addr])
    const dongho = [s(input.dong), s(input.ho)].filter(Boolean).join(' ')
    if (dongho) rows.push(['동/호', dongho])
    if (input.work_type_name) rows.push(['공사', s(input.work_type_name)])
  } else if (tool === 'update_project') {
    const fields: [string, unknown][] = [
      ['빌라명', input.building_name], ['소유주', input.owner_name], ['연락처', input.owner_phone],
      ['세입자연락처', input.tenant_phone], ['메모', input.note],
    ]
    fields.forEach(([k, v]) => { if (v) rows.push([k, s(v)]) })
    if (rows.length === 0) rows.push(['수정', '정보 변경'])
  } else if (tool === 'update_status') {
    rows.push(['변경 단계', s(input.new_status) || '-'])
    if (input.note) rows.push(['사유', s(input.note)])
  } else if (tool === 'manage_schedule') {
    if (input.action === 'delete') {
      rows.push(['삭제 일정', s(input.schedule_id) || '-'])
    } else {
      rows.push(['제목', s(input.title) || '-'])
      let d = s(input.start_date) || '-'
      if (input.end_date && input.end_date !== input.start_date) d += ' ~ ' + s(input.end_date)
      rows.push(['날짜', d])
      rows.push(['시간', s(input.start_time) || '미지정'])
      if (input.staff_name) rows.push(['담당', s(input.staff_name)])
      if (input.memo) rows.push(['메모', s(input.memo)])
    }
  } else if (tool === 'manage_expense') {
    rows.push(['분류', s(input.category) || '기타경비'])
    rows.push(['내용', s(input.title) || '-'])
    rows.push(['금액', won(input.amount)])
    rows.push(['날짜', s(input.expense_date) || '오늘'])
  } else if (tool === 'record_deposit') {
    rows.push(['입금자', s(input.payer_name) || '-'])
    rows.push(['금액', won(input.amount)])
    rows.push(['입금일', s(input.payment_date) || '오늘'])
  } else if (tool === 'manage_memory') {
    rows.push(['키', s(input.key) || '-'])
    rows.push(['값', s(input.value) || '-'])
  } else if (tool === 'manage_drive') {
    rows.push(['폴더', s(input.building_name) || s(input.site_name) || '-'])
  } else if (tool === 'save_photo_to_drive') {
    rows.push(['빌라명', s(input.building_name) || '-'])
    rows.push(['유형', s(input.photo_type) || '-'])
  }
  return rows
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [isStreaming, setIsStreaming] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const [feedback, setFeedback] = useState<Record<number, 'up' | 'down'>>({})
  const [writeBusy, setWriteBusy] = useState(false)
  const [pendingAttach, setPendingAttach] = useState<PendingAttach | null>(null)
  const [attachNote, setAttachNote] = useState('')
  const [brief, setBrief] = useState<Brief | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)

  const staffId = typeof window !== 'undefined' ? localStorage.getItem('dawoo_current_staff_id') : null

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])
  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100) }, [open])

  // 팝업 열릴 때 지난 대화 목록 + 오늘 브리핑 로드
  useEffect(() => {
    if (open && !sessionsLoaded) {
      setSessionsLoaded(true)
      loadSessions()
      loadBrief()
    }
  }, [open, sessionsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadBrief() {
    try {
      const res = await fetch(`/api/ai/brief${staffId ? `?staff_id=${staffId}` : ''}`)
      const data = await res.json()
      if (!data.error) setBrief(data as Brief)
    } catch { /* graceful */ }
  }

  // ── 세션 ─────────────────────────────────────────────
  async function loadSessions() {
    if (!staffId) return
    try {
      const res = await fetch(`/api/chat/sessions?staff_id=${staffId}`)
      const data = await res.json()
      setSessions((data.sessions as SessionItem[]) || [])
    } catch { /* graceful */ }
  }

  async function loadSession(id: string) {
    try {
      const res = await fetch(`/api/chat/sessions?session_id=${id}`)
      const data = await res.json()
      const msgs: Message[] = ((data.messages as { role: string; content: string }[]) || []).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant', content: m.content,
      }))
      setMessages(msgs.length ? msgs : [GREETING])
      setSessionId(id)
      setFeedback({})
      setRailOpen(false)
    } catch { /* graceful */ }
  }

  function startNewChat() {
    setMessages([GREETING])
    setSessionId(null)
    setFeedback({})
    setError(null)
    setRailOpen(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function deleteSession(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!window.confirm('이 대화를 목록에서 삭제할까요?')) return
    try {
      await fetch('/api/chat/sessions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: id, action: 'close' }),
      })
    } catch { /* graceful */ }
    setSessions(prev => prev.filter(s => s.id !== id))
    if (id === sessionId) startNewChat()
  }

  // AI 운영 신호 기록 (fire-and-forget) → 'AI 검토' 대시보드 소스
  function logAiEvent(kind: string, tool?: string) {
    try {
      fetch('/api/chat/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, tool, session_id: sessionId || undefined, staff_id: staffId || undefined }),
      })
    } catch { /* graceful */ }
  }

  // ── 피드백 (👍 시각 / 👎 세션 플래그) ──────────────────
  async function handleFeedback(i: number, type: 'up' | 'down') {
    if (feedback[i]) return
    setFeedback(prev => ({ ...prev, [i]: type }))
    logAiEvent(type === 'up' ? 'feedback_up' : 'feedback_down')
    if (type === 'down' && sessionId) {
      try {
        await fetch('/api/chat/sessions', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, action: 'flag', reason: `부정 피드백 (메시지 #${i})` }),
        })
      } catch { /* graceful */ }
    }
  }

  // ── 사진·PDF 첨부 ─────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    const isImage = /^image\//.test(file.type)
    const isPdf = file.type === 'application/pdf'
    if (!isImage && !isPdf) { setAttachNote('사진 또는 PDF만 첨부할 수 있어요'); setTimeout(() => setAttachNote(''), 3000); return }
    if (file.size > 15 * 1024 * 1024) { setAttachNote('15MB 이하 파일만 첨부할 수 있어요'); setTimeout(() => setAttachNote(''), 3000); return }
    setAttachNote('')
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const base64 = dataUrl.split(',')[1] || ''
      setPendingAttach({ kind: isImage ? 'image' : 'file', dataUrl: isImage ? dataUrl : undefined, base64, mediaType: file.type, name: file.name })
    }
    reader.readAsDataURL(file)
  }

  // ── 채팅 전송 ────────────────────────────────────────
  async function send(directText?: string) {
    const text = (directText ?? input).trim()
    const attach = pendingAttach
    if ((!text && !attach) || isStreaming || writeBusy) return

    setError(null)
    setProgress('')
    const placeholder = attach ? (attach.kind === 'image' ? '(사진 첨부)' : '(파일 첨부)') : ''
    const userMsg: Message = {
      role: 'user', content: text || placeholder,
      image: attach?.kind === 'image' ? attach.dataUrl : null,
      fileName: attach?.kind === 'file' ? attach.name : undefined,
    }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setPendingAttach(null)
    setIsStreaming(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    // 백엔드 전송용 메시지 구성 (Anthropic API: user로 시작 + user/assistant 교대 필요)
    const raw = next
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content && m.type !== 'confirm')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    // 선행 assistant(인사말 등) 제거 → 반드시 user로 시작
    while (raw.length && raw[0].role === 'assistant') raw.shift()
    // 연속 동일 역할 병합 (확인 안내 + 등록 완료 등)
    const merged: { role: 'user' | 'assistant'; content: string; images?: string[]; files?: { data: string; media_type: string; name: string }[] }[] = []
    for (const m of raw) {
      const prev = merged[merged.length - 1]
      if (prev && prev.role === m.role) prev.content += '\n' + m.content
      else merged.push({ role: m.role, content: m.content })
    }
    // 마지막 user에만 첨부(과거 첨부 재전송 방지)
    if (attach && merged.length && merged[merged.length - 1].role === 'user') {
      if (attach.kind === 'image') merged[merged.length - 1].images = [attach.base64]
      else merged[merged.length - 1].files = [{ data: attach.base64, media_type: attach.mediaType, name: attach.name }]
    }
    const apiMessages = merged

    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages.slice(-20), staffId: staffId || undefined, channel: 'web', sessionId: sessionId || undefined }),
      })
      if (!res.ok || !res.body) throw new Error('연결 실패')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let gotConfirm = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') continue
          let parsed: Record<string, unknown>
          try { parsed = JSON.parse(payload) } catch { continue }

          if (parsed.session && (parsed.session as { id?: string }).id) {
            const id = (parsed.session as { id: string }).id
            if (!sessionId) { setSessionId(id); loadSessions() }
          } else if (parsed.progress) {
            setProgress(String(parsed.progress))
          } else if (parsed.confirm) {
            gotConfirm = true
            setProgress('')
            const c = parsed.confirm as { tool: string; input: Record<string, unknown>; variant: Variant }
            setMessages(prev => {
              const u = [...prev]
              // 비어있는 assistant 버블 제거 후 확인 카드 추가
              if (u.length && u[u.length - 1].role === 'assistant' && !u[u.length - 1].content && !u[u.length - 1].type) u.pop()
              u.push({ role: 'assistant', type: 'confirm', tool: c.tool, input: c.input || {}, variant: c.variant || 'create', status: 'pending', content: '' })
              return u
            })
          } else if (parsed.text) {
            setProgress('')
            setMessages(prev => {
              const u = [...prev]
              const last = u[u.length - 1]
              if (last && last.role === 'assistant' && last.type !== 'confirm') {
                u[u.length - 1] = { ...last, content: last.content + String(parsed.text) }
              }
              return u
            })
          }
        }
      }

      // 텍스트도 확인카드도 없이 끝난 빈 버블 정리
      if (!gotConfirm) {
        setMessages(prev => {
          const u = [...prev]
          const last = u[u.length - 1]
          if (last && last.role === 'assistant' && last.type !== 'confirm' && !last.content) u.pop()
          return u
        })
      }
    } catch {
      setMessages(prev => {
        const u = [...prev]
        const last = u[u.length - 1]
        if (last && last.role === 'assistant' && !last.content && last.type !== 'confirm') u.pop()
        return u
      })
      setError('AI 연결에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsStreaming(false)
      setProgress('')
    }
  }

  // ── 확인 카드 실행/취소 ──────────────────────────────
  async function executeCard(i: number) {
    const card = messages[i]
    if (!card || card.type !== 'confirm' || !card.tool || writeBusy) return
    setWriteBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executeAction: { tool: card.tool, input: card.input || {} }, staffId: staffId || undefined, channel: 'web', sessionId: sessionId || undefined }),
      })
      const data = await res.json()
      const ok = data.ok !== false
      setMessages(prev => prev.map((m, idx) => idx === i ? { ...m, status: ok ? 'done' : 'error' } : m))
      setMessages(prev => [...prev, { role: 'assistant', content: data.message || (ok ? '완료되었습니다.' : '실패했습니다.') }])
    } catch {
      setMessages(prev => prev.map((m, idx) => idx === i ? { ...m, status: 'error' } : m))
      setMessages(prev => [...prev, { role: 'assistant', content: '실패: 네트워크 오류' }])
    } finally {
      setWriteBusy(false)
    }
  }

  function cancelCard(i: number) {
    logAiEvent('confirm_cancelled', messages[i]?.tool)
    setMessages(prev => prev.map((m, idx) => idx === i ? { ...m, status: 'cancelled' } : m))
    setMessages(prev => [...prev, { role: 'assistant', content: '취소했습니다.' }])
  }

  const showHero = messages.length <= 1

  // ── 렌더 ─────────────────────────────────────────────
  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-5 bottom-5 w-14 h-14 rounded-full bg-accent text-white flex flex-col items-center justify-center gap-0.5 z-[9998] hover:bg-accent-hover transition-colors cursor-pointer"
          style={{ boxShadow: '0 8px 28px rgba(201,100,66,0.32), 0 2px 6px rgba(0,0,0,0.12)' }}
          aria-label="AI 비서 열기"
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-[9px] font-bold tracking-wide">AI 비서</span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[9999] bg-black/40 flex md:items-center md:justify-center md:p-6"
          onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-surface w-full h-full md:w-[820px] md:max-w-full md:h-[min(86vh,760px)] md:rounded-2xl border border-border-primary flex flex-col overflow-hidden" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.24)' }}>
            {/* 헤더 */}
            <div className="px-4 md:px-5 py-3.5 border-b border-border-primary flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <button onClick={() => { const n = !railOpen; setRailOpen(n); if (n) loadSessions() }} className="md:hidden btn-icon" aria-label="지난 대화">
                  <Menu className="w-[18px] h-[18px]" />
                </button>
                <div className="w-2 h-2 rounded-full bg-[#16a34a] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-txt-primary tracking-[-0.01em]">AI 비서</div>
                  <div className="text-[11px] text-txt-tertiary truncate">접수·일정·현장·지출 조회 + 등록·입금 확인 처리</div>
                </div>
              </div>
              <button onClick={() => { setOpen(false); setRailOpen(false) }} className="btn-icon" aria-label="닫기">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 본문: 좌측 레일 + 우측 채팅 */}
            <div className="flex flex-1 min-h-0 relative">
              {/* 데스크톱 고정 레일 */}
              <div className="hidden md:flex w-[212px] shrink-0 border-r border-border-primary bg-page flex-col min-h-0">{renderRail()}</div>
              {/* 모바일 슬라이드 레일 */}
              {railOpen && (
                <>
                  <div className="md:hidden absolute inset-0 bg-black/25 z-[15]" onMouseDown={() => setRailOpen(false)} />
                  <div className="md:hidden absolute top-0 left-0 bottom-0 w-64 z-20 border-r border-border-primary bg-surface flex flex-col" style={{ boxShadow: '6px 0 28px rgba(0,0,0,0.16)' }}>{renderRail()}</div>
                </>
              )}

              {/* 채팅 메인 */}
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4">
                  {showHero ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                      <div className="w-12 h-12 rounded-full bg-accent-light flex items-center justify-center mb-3">
                        <Sparkles className="w-6 h-6 text-accent" />
                      </div>
                      <div className="text-[13px] text-txt-tertiary">{greetingByHour()}{brief?.name ? `, ${brief.name}님` : ''}</div>
                      <div className="text-[22px] font-extrabold text-txt-primary tracking-[-0.02em] mt-0.5">무엇을 도와드릴까요?</div>

                      {/* 오늘 브리핑 — 실시간 숫자 (클릭하면 바로 질문) */}
                      {brief && (
                        <div className="flex flex-wrap gap-2 justify-center mt-4">
                          {[
                            { icon: ClipboardList, label: '진행 접수', value: brief.stats.ongoingIntake, q: '진행중인 접수 현황 알려줘' },
                            { icon: Calendar, label: '오늘 일정', value: brief.stats.todaySchedules, q: '오늘 일정 알려줘' },
                            { icon: FileText, label: '이번 달 신규', value: brief.stats.monthIntake, q: '이번 달 접수 현황 알려줘' },
                          ].map(({ icon: Icon, label, value, q }) => (
                            <button key={label} onClick={() => send(q)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border-primary hover:border-border-accent transition-colors cursor-pointer">
                              <Icon className="w-4 h-4 text-accent shrink-0" />
                              <span className="text-[12px] text-txt-tertiary">{label}</span>
                              <span className="text-[16px] font-extrabold text-txt-primary tabular-nums">{value}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* 추천 — 의도별 그룹 */}
                      <div className="w-full max-w-[480px] mt-6 space-y-2.5">
                        {SUGGESTION_GROUPS.map(group => (
                          <div key={group.cat} className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-txt-quaternary w-12 shrink-0 text-right uppercase tracking-wide">{group.cat}</span>
                            <div className="flex flex-wrap gap-1.5">
                              {group.items.map(it => (
                                <button key={it.label} onClick={() => send(it.text)} className="px-3 py-1.5 rounded-full bg-surface-secondary hover:bg-accent-light border border-border-primary text-[12px] text-txt-primary font-medium transition-colors cursor-pointer">
                                  {it.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((msg, i) => {
                      if (msg.type === 'confirm') return renderConfirmCard(msg, i)
                      const isAI = msg.role === 'assistant'
                      return (
                        <div key={i} className="mb-3">
                          <div className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-[13.5px] leading-relaxed whitespace-pre-wrap break-words ${isAI ? 'bg-surface-secondary text-txt-primary rounded-bl-sm' : 'bg-accent text-white rounded-br-sm'}`}>
                              {msg.image && <img src={msg.image} alt="첨부" className="max-w-[180px] rounded-lg mb-1.5 border border-border-primary" />}
                              {msg.fileName && (
                                <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1.5 rounded-lg bg-black/10">
                                  <FileText className="w-3.5 h-3.5 shrink-0" />
                                  <span className="text-[12px] truncate max-w-[180px]">{msg.fileName}</span>
                                </div>
                              )}
                              {msg.content}
                              {isStreaming && i === messages.length - 1 && isAI && !msg.content && (
                                <span className="text-txt-tertiary text-[12px]">{progress || '생각 중...'}</span>
                              )}
                            </div>
                          </div>
                          {isAI && msg.content && !isStreaming && (
                            <div className="flex gap-1 mt-1 pl-1">
                              <button onClick={() => handleFeedback(i, 'up')} title="도움이 됐어요" className={`p-1 rounded-md border transition-colors cursor-pointer ${feedback[i] === 'up' ? 'bg-normal-bg border-[#86efac] text-[#15803d]' : 'border-border-primary text-txt-quaternary hover:text-txt-secondary'}`}>
                                <ThumbsUp className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleFeedback(i, 'down')} title="아닌 것 같아요" className={`p-1 rounded-md border transition-colors cursor-pointer ${feedback[i] === 'down' ? 'bg-danger-bg border-danger-border text-danger' : 'border-border-primary text-txt-quaternary hover:text-txt-secondary'}`}>
                                <ThumbsDown className="w-3.5 h-3.5" />
                              </button>
                              {feedback[i] === 'down' && <span className="text-[10px] text-txt-quaternary self-center ml-1">기록됐어요. 개선에 반영할게요.</span>}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}

                  {isStreaming && progress && messages[messages.length - 1]?.content && (
                    <div className="flex justify-start mb-3">
                      <div className="px-3.5 py-2 rounded-2xl bg-surface-secondary text-txt-tertiary text-[12px] flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {progress}
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="flex justify-start mb-3">
                      <div className="max-w-[88%] px-3.5 py-2.5 rounded-2xl text-[13px] bg-danger-bg text-danger">{error}</div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* 첨부 미리보기 (사진 썸네일 / PDF 파일칩) + 안내 */}
                {(pendingAttach || attachNote) && (
                  <div className="px-4 md:px-5 pb-1.5 flex items-center gap-2">
                    {pendingAttach ? (
                      <>
                        <div className="relative">
                          {pendingAttach.kind === 'image' ? (
                            <img src={pendingAttach.dataUrl} alt="첨부" className="w-11 h-11 rounded-lg object-cover border border-border-primary" />
                          ) : (
                            <div className="w-11 h-11 rounded-lg border border-border-primary bg-surface-secondary flex items-center justify-center">
                              <FileText className="w-5 h-5 text-accent" />
                            </div>
                          )}
                          <button onClick={() => setPendingAttach(null)} className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-danger text-white flex items-center justify-center cursor-pointer" aria-label="첨부 제거">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-[11px] text-txt-tertiary truncate max-w-[280px]">
                          {pendingAttach.kind === 'image' ? '사진 첨부됨 — 무엇을 처리할지 적어 보세요' : `${pendingAttach.name} 첨부됨`}
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] text-danger">{attachNote}</span>
                    )}
                  </div>
                )}

                {/* 입력창 */}
                <div className="px-4 md:px-5 py-3 border-t border-border-primary flex gap-2">
                  <button onClick={() => imgInputRef.current?.click()} disabled={isStreaming} title="사진·PDF 첨부" className="w-10 h-10 rounded-xl bg-surface-secondary text-txt-tertiary flex items-center justify-center shrink-0 hover:bg-surface-tertiary transition-colors cursor-pointer disabled:opacity-40">
                    <Paperclip className="w-[18px] h-[18px]" />
                  </button>
                  <input ref={imgInputRef} type="file" accept="image/*,application/pdf" onChange={handleFileSelect} className="hidden" />
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
                    placeholder="질문하거나 사진·PDF를 첨부해 보세요"
                    className="input-field flex-1"
                    disabled={isStreaming}
                  />
                  <button onClick={() => send()} disabled={isStreaming || (!input.trim() && !pendingAttach)} className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center shrink-0 hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-30">
                    {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )

  // ── 좌측 지난대화 레일 ───────────────────────────────
  function renderRail() {
    return (
      <>
        <button onClick={startNewChat} className="mx-2.5 mt-2.5 mb-1.5 px-3 py-2.5 rounded-lg border border-border-primary bg-surface flex items-center justify-center gap-1.5 text-[13px] font-bold text-txt-primary hover:bg-surface-secondary transition-colors cursor-pointer">
          <Plus className="w-3.5 h-3.5" /> 새 대화
        </button>
        <div className="px-3.5 pt-1 pb-1.5 text-[10px] font-bold text-txt-quaternary tracking-wider uppercase">지난 대화</div>
        <div className="flex-1 overflow-y-auto px-2 pb-2.5 min-h-0">
          {sessions.length === 0 ? (
            <div className="px-2.5 py-4 text-[12px] text-txt-quaternary text-center">이전 대화가 없습니다</div>
          ) : sessions.map(s => (
            <div key={s.id} onClick={() => loadSession(s.id)} className={`group flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer mb-0.5 ${s.id === sessionId ? 'bg-surface-tertiary' : 'hover:bg-surface-secondary'}`}>
              <div className="flex-1 min-w-0">
                <span className="block text-[12.5px] text-txt-secondary font-medium truncate">{s.title || '새 대화'}</span>
                <span className="block text-[10px] text-txt-quaternary mt-0.5">{fmtWhen(s.last_message_at)}</span>
              </div>
              <button onClick={e => deleteSession(e, s.id)} className="shrink-0 w-6 h-6 grid place-items-center rounded-md text-txt-quaternary opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger-bg cursor-pointer transition-opacity" title="대화 삭제" aria-label="대화 삭제">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </>
    )
  }

  // ── 작업 확인 카드 ───────────────────────────────────
  function renderConfirmCard(msg: Message, i: number) {
    const tool = msg.tool || ''
    const input = msg.input || {}
    const variant = msg.variant || 'create'
    const isDelete = variant === 'delete'
    const isMoney = variant === 'money'
    const pending = msg.status === 'pending'
    const rows = summarizeWrite(tool, input)
    const amt = isMoney ? heroAmount(tool, input) : 0

    return (
      <div key={i} className="mb-3 flex justify-start">
        <div className={`max-w-[92%] w-full px-4 py-3.5 rounded-2xl bg-surface border ${isDelete ? 'border-danger-border' : 'border-border-secondary'}`} style={{ boxShadow: isDelete ? '0 2px 10px rgba(181,51,51,0.08)' : '0 2px 10px rgba(201,100,66,0.08)' }}>
          <div className={`flex items-center gap-1.5 text-[13px] font-bold ${isDelete ? 'text-danger' : 'text-accent'}`}>
            {isDelete ? <Trash2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {cardLabel(tool, input)}
          </div>

          {isMoney && (
            <div className="mt-2.5 px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border-primary">
              <div className="text-[11px] text-txt-tertiary font-semibold">금액</div>
              <div className="text-[22px] font-extrabold text-txt-primary tabular-nums tracking-[-0.01em] mt-0.5">{amt.toLocaleString('ko-KR')}원</div>
            </div>
          )}

          <div className="mt-2">
            {rows.map((r, k) => (
              <div key={k} className="flex gap-2 text-[13px] leading-7">
                <span className="text-txt-tertiary w-[68px] shrink-0">{r[0]}</span>
                <span className="text-txt-primary flex-1 font-semibold break-words">{r[1]}</span>
              </div>
            ))}
          </div>

          {pending ? (
            <div className="flex gap-2 mt-3">
              <button onClick={() => executeCard(i)} disabled={writeBusy} className={`flex-1 py-2 rounded-lg text-[13px] font-bold text-white cursor-pointer disabled:opacity-50 ${isDelete ? 'bg-danger hover:bg-danger-hover' : 'bg-accent hover:bg-accent-hover'}`}>
                {writeBusy ? (isDelete ? '삭제 중...' : '등록 중...') : (isDelete ? '삭제' : '등록')}
              </button>
              <button onClick={() => cancelCard(i)} disabled={writeBusy} className="flex-1 py-2 rounded-lg text-[13px] font-semibold text-txt-secondary bg-surface border border-border-primary hover:bg-surface-secondary cursor-pointer disabled:opacity-50">취소</button>
            </div>
          ) : (
            <div className={`mt-2.5 flex items-center gap-1 text-[12px] font-bold ${msg.status === 'done' ? 'text-[#15803d]' : msg.status === 'error' ? 'text-danger' : 'text-txt-tertiary'}`}>
              {msg.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {msg.status === 'error' && <AlertTriangle className="w-3.5 h-3.5" />}
              {msg.status === 'done' ? (isDelete ? '삭제 완료' : '등록 완료') : msg.status === 'error' ? (isDelete ? '삭제 실패' : '등록 실패') : '취소됨'}
            </div>
          )}
        </div>
      </div>
    )
  }
}
