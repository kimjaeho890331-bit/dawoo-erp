'use client'

import { useState } from 'react'
import { Pin, Bell, FileText, ChevronDown, ChevronUp, Plus, X, AlertTriangle } from 'lucide-react'

// --- 타입 ---
interface Notice {
  id: string
  title: string
  content: string
  category: '공지' | '규율' | '규정' | '안내'
  pinned: boolean
  createdAt: string
  updatedAt: string
}

const CAT_STYLE: Record<string, { bg: string; text: string }> = {
  '공지': { bg: 'bg-[#e0e7ff]', text: 'text-[#3730a3]' },
  '규율': { bg: 'bg-[#fee2e2]', text: 'text-[#991b1b]' },
  '규정': { bg: 'bg-[#fef3c7]', text: 'text-[#92400e]' },
  '안내': { bg: 'bg-[#d1fae5]', text: 'text-[#065f46]' },
}

// 초기 데이터 (추후 DB 연동)
const INITIAL_NOTICES: Notice[] = [
  {
    id: '1', title: '근무 시간 안내', category: '규정', pinned: true,
    content: '근무시간: 08:30 ~ 17:30 (점심 12:00~13:00)\n지각/조퇴 시 사전 보고 필수.\n현장 출퇴근 시 업무 캘린더에 기록.',
    createdAt: '2026-01-02', updatedAt: '2026-01-02',
  },
  {
    id: '2', title: '안전장비 착용 규정', category: '규율', pinned: true,
    content: '현장 출입 시 안전모, 안전화, 조끼 필수 착용.\n미착용 시 현장 출입 불가.\n안전장비 파손 시 즉시 교체 요청.',
    createdAt: '2026-01-05', updatedAt: '2026-03-10',
  },
  {
    id: '3', title: '지출결의서 작성 기준', category: '규정', pinned: false,
    content: '5만원 이상 지출 시 반드시 사전 결재.\n영수증 미제출 시 정산 불가.\n법인카드 사적 사용 금지.',
    createdAt: '2026-02-01', updatedAt: '2026-02-01',
  },
  {
    id: '4', title: '4월 현장 안전점검 안내', category: '안내', pinned: false,
    content: '4월 셋째주 전 현장 안전점검 실시 예정.\n현장 소장은 점검표 사전 작성 바랍니다.',
    createdAt: '2026-04-01', updatedAt: '2026-04-01',
  },
]

export default function NoticePage() {
  const [notices, setNotices] = useState<Notice[]>(INITIAL_NOTICES)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState<string>('전체')

  // 폼 상태
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formCategory, setFormCategory] = useState<Notice['category']>('공지')
  const [formPinned, setFormPinned] = useState(false)

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

  const handleSave = () => {
    if (!formTitle.trim() || !formContent.trim()) return
    const today = new Date().toISOString().slice(0, 10)

    if (editId) {
      setNotices(prev => prev.map(n => n.id === editId ? {
        ...n, title: formTitle.trim(), content: formContent.trim(),
        category: formCategory, pinned: formPinned, updatedAt: today,
      } : n))
    } else {
      setNotices(prev => [{
        id: Date.now().toString(), title: formTitle.trim(), content: formContent.trim(),
        category: formCategory, pinned: formPinned, createdAt: today, updatedAt: today,
      }, ...prev])
    }
    setShowForm(false)
  }

  const handleDelete = (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    setNotices(prev => prev.filter(n => n.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const togglePin = (id: string) => {
    setNotices(prev => prev.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n))
  }

  // 필터 + 정렬 (고정 먼저, 최신순)
  const filtered = notices
    .filter(n => catFilter === '전체' || n.category === catFilter)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned ? 1 : -1
      return b.createdAt.localeCompare(a.createdAt)
    })

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

      {/* 목록 */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
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
                  <span className="text-[11px] text-txt-tertiary tabular-nums">{notice.createdAt}</span>
                  {isOpen ? <ChevronUp size={16} className="text-txt-tertiary" /> : <ChevronDown size={16} className="text-txt-tertiary" />}
                </div>

                {/* 내용 */}
                {isOpen && (
                  <div className="border-t border-border-tertiary">
                    <div className="px-5 py-4">
                      <pre className="text-[13px] text-txt-secondary leading-relaxed whitespace-pre-wrap font-[inherit]">{notice.content}</pre>
                      {notice.updatedAt !== notice.createdAt && (
                        <p className="text-[11px] text-txt-tertiary mt-3">수정일: {notice.updatedAt}</p>
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
              <button onClick={handleSave}
                className="h-[36px] px-5 bg-accent hover:bg-accent-hover text-white rounded-lg text-[13px] font-medium transition">
                {editId ? '수정' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
