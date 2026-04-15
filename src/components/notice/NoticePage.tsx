'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Pin, ChevronDown, ChevronUp, Plus, X } from 'lucide-react'

// --- 타입 ---
interface Notice {
  id: string
  title: string
  content: string
  category: '공지' | '규율' | '규정' | '안내'
  pinned: boolean
  created_at: string
  updated_at: string
}

const CAT_STYLE: Record<string, { bg: string; text: string }> = {
  '공지': { bg: 'bg-[#e0e7ff]', text: 'text-[#3730a3]' },
  '규율': { bg: 'bg-[#fee2e2]', text: 'text-[#991b1b]' },
  '규정': { bg: 'bg-[#fef3c7]', text: 'text-[#92400e]' },
  '안내': { bg: 'bg-[#d1fae5]', text: 'text-[#065f46]' },
}

export default function NoticePage() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState<string>('전체')
  const [saving, setSaving] = useState(false)

  // 폼 상태
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formCategory, setFormCategory] = useState<Notice['category']>('공지')
  const [formPinned, setFormPinned] = useState(false)

  // --- 데이터 로드 ---
  const loadData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('notices')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error && data) setNotices(data as Notice[])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const openNew = () => {
    setEditId(null)
    setFormTitle('')
    setFormContent('')
    setFormCategory('공지')
    setFormPinned(false)
    setShowForm(true)
  }

  const openEdit = (n: Notice) => {
    setEditId(n.id)
    setFormTitle(n.title)
    setFormContent(n.content)
    setFormCategory(n.category)
    setFormPinned(n.pinned)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formTitle.trim() || !formContent.trim()) return
    setSaving(true)

    const payload = {
      title: formTitle.trim(),
      content: formContent.trim(),
      category: formCategory,
      pinned: formPinned,
    }

    if (editId) {
      await supabase.from('notices').update({
        ...payload,
        updated_at: new Date().toISOString(),
      }).eq('id', editId)
    } else {
      await supabase.from('notices').insert(payload)
    }

    setSaving(false)
    setShowForm(false)
    loadData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    if (expandedId === id) setExpandedId(null)
    loadData()
  }

  const togglePin = async (id: string) => {
    const notice = notices.find(n => n.id === id)
    if (!notice) return
    await supabase.from('notices').update({ pinned: !notice.pinned }).eq('id', id)
    loadData()
  }

  // 날짜 포맷 (ISO → YYYY-MM-DD)
  const fmtDate = (d: string) => d ? d.slice(0, 10) : ''

  // 필터 (정렬은 DB에서 처리)
  const filtered = notices
    .filter(n => catFilter === '전체' || n.category === catFilter)

  const categories = ['전체', '공지', '규율', '규정', '안내']

  return (
    <div className="max-w-[900px] mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">공지사항</h1>
          <div className="flex bg-surface-secondary rounded-lg p-0.5">
            {categories.map(cat => (
              <button key={cat} onClick={() => setCatFilter(cat)}
                className={`px-3 py-1.5 text-[13px] rounded-md transition ${
                  catFilter === cat ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-tertiary'
                }`}>
                {cat}
              </button>
            ))}
          </div>
        </div>
        <button onClick={openNew} className="h-[36px] px-5 bg-accent hover:bg-accent-hover text-white rounded-lg text-[13px] font-medium transition flex items-center gap-1.5">
          <Plus size={14} /> 등록
        </button>
      </div>

      {/* 텔레그램 연결 가이드 (고정 박스) */}
      <TelegramGuideBox />

      {/* 목록 */}
      <div className="space-y-2">
        {loading ? (
          <div className="bg-surface rounded-[10px] border border-border-primary text-center py-16 text-txt-quaternary text-[13px]">
            불러오는 중...
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-surface rounded-[10px] border border-border-primary text-center py-16 text-txt-quaternary text-[13px]">
            등록된 공지사항이 없습니다
          </div>
        ) : (
          filtered.map(notice => {
            const isOpen = expandedId === notice.id
            const cs = CAT_STYLE[notice.category]
            return (
              <div key={notice.id} className={`bg-surface rounded-[10px] border transition ${
                notice.pinned ? 'border-[#d97706]/30' : 'border-border-primary'
              }`}>
                {/* 헤더 */}
                <div
                  className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-surface-secondary/50 transition"
                  onClick={() => setExpandedId(isOpen ? null : notice.id)}
                >
                  {notice.pinned && <Pin size={14} className="text-[#d97706] shrink-0" />}
                  <span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium ${cs.bg} ${cs.text}`}>{notice.category}</span>
                  <span className="text-[14px] font-semibold text-txt-primary flex-1 tracking-[-0.1px]">{notice.title}</span>
                  <span className="text-[11px] text-txt-tertiary tabular-nums">{fmtDate(notice.created_at)}</span>
                  {isOpen ? <ChevronUp size={16} className="text-txt-tertiary" /> : <ChevronDown size={16} className="text-txt-tertiary" />}
                </div>

                {/* 내용 */}
                {isOpen && (
                  <div className="border-t border-border-tertiary">
                    <div className="px-5 py-4">
                      <pre className="text-[13px] text-txt-secondary leading-relaxed whitespace-pre-wrap font-[inherit]">{notice.content}</pre>
                      {fmtDate(notice.updated_at) !== fmtDate(notice.created_at) && (
                        <p className="text-[11px] text-txt-tertiary mt-3">수정일: {fmtDate(notice.updated_at)}</p>
                      )}
                    </div>
                    <div className="px-5 py-2.5 border-t border-border-tertiary flex items-center gap-2 justify-end">
                      <button onClick={() => togglePin(notice.id)}
                        className="h-[32px] px-3 text-[12px] text-txt-secondary border border-border-primary rounded-lg hover:bg-surface-tertiary transition flex items-center gap-1">
                        <Pin size={12} /> {notice.pinned ? '고정 해제' : '상단 고정'}
                      </button>
                      <button onClick={() => openEdit(notice)}
                        className="h-[32px] px-3 text-[12px] text-txt-secondary border border-border-primary rounded-lg hover:bg-surface-tertiary transition">
                        수정
                      </button>
                      <button onClick={() => handleDelete(notice.id)}
                        className="h-[32px] px-3 text-[12px] text-[#dc2626] border border-[#fecaca] rounded-lg hover:bg-[#fee2e2] transition">
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 등록/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowForm(false)} />
          <div className="relative bg-surface rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-tertiary">
              <h3 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">
                {editId ? '공지 수정' : '공지 등록'}
              </h3>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-tertiary">
                <X size={16} className="text-txt-tertiary" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1 block">구분</label>
                <div className="flex gap-2">
                  {(['공지', '규율', '규정', '안내'] as const).map(cat => {
                    const cs = CAT_STYLE[cat]
                    return (
                      <button key={cat} onClick={() => setFormCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition ${
                          formCategory === cat ? `${cs.bg} ${cs.text} border-transparent` : 'border-border-primary text-txt-tertiary'
                        }`}>
                        {cat}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1 block">제목</label>
                <input value={formTitle} onChange={e => setFormTitle(e.target.value)}
                  className="w-full h-[36px] border border-border-primary rounded-lg px-3 text-[13px] text-txt-primary bg-surface focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
                  placeholder="공지 제목" />
              </div>
              <div>
                <label className="text-[11px] font-medium tracking-[0.3px] text-txt-tertiary mb-1 block">내용</label>
                <textarea value={formContent} onChange={e => setFormContent(e.target.value)} rows={6}
                  className="w-full border border-border-primary rounded-lg px-3 py-2.5 text-[13px] text-txt-primary bg-surface focus:border-accent focus:ring-2 focus:ring-accent-light outline-none resize-none leading-relaxed"
                  placeholder="공지 내용을 입력하세요" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formPinned} onChange={e => setFormPinned(e.target.checked)}
                  className="w-4 h-4 rounded border-border-secondary text-accent focus:ring-accent-light" />
                <span className="text-[13px] text-txt-secondary">상단 고정</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-border-tertiary flex justify-end gap-2">
              <button onClick={() => setShowForm(false)}
                className="h-[36px] px-4 border border-border-primary rounded-lg text-[13px] text-txt-secondary hover:bg-surface-tertiary transition">
                취소
              </button>
              <button onClick={handleSave} disabled={saving}
                className="h-[36px] px-5 bg-accent hover:bg-accent-hover text-white rounded-lg text-[13px] font-medium transition disabled:opacity-50">
                {saving ? '저장 중...' : editId ? '수정' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ================================================
// 텔레그램 연결 가이드 박스 (고정)
// ================================================
function TelegramGuideBox() {
  const [expanded, setExpanded] = useState(true)
  const [myCode, setMyCode] = useState<string | null>(null)
  const [connected, setConnected] = useState<boolean>(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const staffId = typeof window !== 'undefined'
      ? localStorage.getItem('dawoo_current_staff_id')
      : null
    if (!staffId) return

    // 현재 사용자 텔레그램 연결 상태 확인
    supabase.from('staff').select('telegram_chat_id').eq('id', staffId).maybeSingle().then(({ data }) => {
      if (data?.telegram_chat_id) setConnected(true)
    })

    // 해당 사용자의 미사용 초대 코드 조회 (최신 1개)
    supabase.from('staff_invitations')
      .select('code, expires_at')
      .eq('used_by_staff_id', staffId)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMyCode(data.code)
      })
  }, [])

  const inviteMessage = myCode
    ? `[다우건설 ERP 초대]
다우건설 ERP 텔레그램 알리미 연결 안내입니다.

1. 텔레그램 앱 설치
2. @다우건설알리미_bot 검색
3. 채팅창에 입력: /start ${myCode}

완료되면 업무 알림을 텔레그램으로 자동 수신합니다.`
    : ''

  const copyCode = () => {
    if (!myCode) return
    navigator.clipboard.writeText(myCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyMessage = () => {
    if (!inviteMessage) return
    navigator.clipboard.writeText(inviteMessage)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-surface rounded-[10px] border border-[#0891b2]/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-[#ecfeff] transition"
      >
        <span className="text-[11px] px-[10px] py-[2px] rounded-full font-medium bg-[#cffafe] text-[#0e7490]">📱 텔레그램</span>
        <span className="text-[14px] font-semibold text-txt-primary flex-1 text-left tracking-[-0.1px]">
          텔레그램 봇 연결 안내 (필수)
        </span>
        {connected && <span className="text-[11px] text-[#059669] font-medium">✓ 연결됨</span>}
        {expanded ? <ChevronUp size={16} className="text-txt-tertiary" /> : <ChevronDown size={16} className="text-txt-tertiary" />}
      </button>

      {expanded && (
        <div className="border-t border-[#0891b2]/20 px-5 py-4 bg-[#ecfeff]/30">
          <p className="text-[13px] text-txt-secondary mb-4 leading-relaxed">
            다우건설 ERP는 텔레그램 봇으로 자동 알림과 AI 비서 기능을 제공합니다.
            아래 4단계로 연결해주세요. (한 번만 설정하면 됩니다)
          </p>

          <div className="space-y-3">
            {/* 1단계 */}
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-[#0891b2] text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-txt-primary">텔레그램 앱 설치</div>
                <div className="text-[12px] text-txt-tertiary mt-0.5 space-y-0.5">
                  <div>• iOS: App Store에서 <span className="font-medium">&quot;Telegram&quot;</span> 검색</div>
                  <div>• Android: Play Store에서 <span className="font-medium">&quot;Telegram&quot;</span> 검색</div>
                  <div>• PC: <a href="https://desktop.telegram.org" target="_blank" rel="noreferrer" className="text-[#0891b2] underline">desktop.telegram.org</a></div>
                </div>
              </div>
            </div>

            {/* 2단계 */}
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-[#0891b2] text-white text-[11px] font-bold flex items-center justify-center shrink-0">2</div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-txt-primary">다우건설 봇 검색</div>
                <div className="text-[12px] text-txt-tertiary mt-0.5">
                  텔레그램 상단 돋보기 → <span className="font-medium text-txt-primary">@다우건설알리미_bot</span> 검색 → 대화 시작
                </div>
              </div>
            </div>

            {/* 3단계 */}
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-[#0891b2] text-white text-[11px] font-bold flex items-center justify-center shrink-0">3</div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-txt-primary">초대 코드 입력</div>
                <div className="text-[12px] text-txt-tertiary mt-0.5">
                  봇 채팅창에 입력: <code className="px-1.5 py-0.5 bg-white rounded text-[11px] border border-border-tertiary">/start 초대코드</code>
                </div>
                {myCode ? (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="text-[11px] text-txt-tertiary">내 초대 코드:</div>
                    <code className="px-2 py-1 bg-white rounded font-mono text-[13px] font-bold text-[#0891b2] border border-[#0891b2]/30">{myCode}</code>
                    <button onClick={copyCode} className="h-[28px] px-2.5 text-[11px] text-[#0891b2] border border-[#0891b2]/30 rounded hover:bg-[#ecfeff]">
                      {copied ? '✓ 복사됨' : '복사'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-txt-quaternary italic">
                    관리자에게 초대 코드를 받아주세요.
                  </div>
                )}
                {inviteMessage && (
                  <button onClick={copyMessage} className="mt-2 h-[28px] px-2.5 text-[11px] bg-[#0891b2] text-white rounded hover:bg-[#0e7490]">
                    📋 전체 안내 메시지 복사 (카톡 전달용)
                  </button>
                )}
              </div>
            </div>

            {/* 4단계 */}
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-[#0891b2] text-white text-[11px] font-bold flex items-center justify-center shrink-0">4</div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-txt-primary">명령어 확인</div>
                <div className="text-[12px] text-txt-tertiary mt-0.5 space-y-0.5">
                  <div>• <code className="text-[11px]">/help</code> — 전체 명령어</div>
                  <div>• <code className="text-[11px]">/오늘</code> — 오늘 일정</div>
                  <div>• <code className="text-[11px]">/브리핑</code> — AI 긴급 체크</div>
                  <div>• 자연어: <span className="italic">&quot;오늘 내 일정 뭐야?&quot;</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#0891b2]/20 text-[11px] text-txt-tertiary">
            자동 알림 시각: <span className="font-medium text-txt-secondary">매일 08:30 / 15:00 / 18:00</span> · 조용한 시간(22:00~07:00)·주말 OFF
          </div>
        </div>
      )}
    </div>
  )
}
