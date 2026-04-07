'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// --- 타입 ---
interface CompanyDoc {
  id: string
  name: string
  expiryDate: string | null
  hasFile: boolean
  fileName?: string
}

interface TemplateDoc {
  id: string
  name: string
  category: TabKey
  cityName?: string
  hasFile: boolean
  fileName?: string
}

type TabKey = '회사' | '수도' | '소규모' | '입찰'

// --- 상수 ---
const TABS: { key: TabKey; label: string }[] = [
  { key: '회사', label: '회사 기본서류' },
  { key: '수도', label: '수도' },
  { key: '소규모', label: '소규모' },
  { key: '입찰', label: '입찰/현장' },
]

const INITIAL_COMPANY_DOCS: CompanyDoc[] = [
  { id: '1', name: '사업자등록증', expiryDate: null, hasFile: true },
  { id: '2', name: '법인등기부등본', expiryDate: '2026-09-15', hasFile: true },
  { id: '3', name: '인감증명서', expiryDate: '2026-06-30', hasFile: false },
  { id: '4', name: '건설업면허', expiryDate: '2027-03-01', hasFile: true },
  { id: '5', name: '납세증명서(국세)', expiryDate: '2026-05-10', hasFile: true },
  { id: '6', name: '납세증명서(지방세)', expiryDate: '2026-05-10', hasFile: true },
  { id: '7', name: '4대보험 가입자명부', expiryDate: '2026-12-31', hasFile: false },
  { id: '8', name: '산재보험 가입증명서', expiryDate: '2026-08-20', hasFile: true },
  { id: '9', name: '고용보험 가입증명원', expiryDate: '2026-08-20', hasFile: true },
  { id: '10', name: '통장사본', expiryDate: null, hasFile: true },
]

const CITIES = [
  '수원', '성남', '안양', '부천', '광명', '시흥', '안산',
  '군포', '의왕', '과천', '용인', '화성', '오산', '평택', '하남',
]

const WORK_TEMPLATE_NAMES = ['신청서', '견적서 기본폼', '완료보고서 양식', '사진대장 양식']

// 입찰/현장 5개 분류
interface BidGroup {
  key: string
  label: string
  items: TemplateDoc[]
}

const INITIAL_BID_GROUPS: BidGroup[] = [
  {
    key: '계약서류', label: '계약서류',
    items: [
      { id: 'bid-계약-1', name: '공사계약서', category: '입찰', hasFile: false },
      { id: 'bid-계약-2', name: '하도급계약서', category: '입찰', hasFile: false },
    ],
  },
  {
    key: '착공서류', label: '착공서류',
    items: [
      { id: 'bid-착공-1', name: '착공계', category: '입찰', hasFile: false },
      { id: 'bid-착공-2', name: '안전관리계획서', category: '입찰', hasFile: false },
      { id: 'bid-착공-3', name: '폐기물처리계획', category: '입찰', hasFile: false },
    ],
  },
  {
    key: '준공서류', label: '준공서류',
    items: [
      { id: 'bid-준공-1', name: '준공신고서', category: '입찰', hasFile: false },
      { id: 'bid-준공-2', name: '완료보고서', category: '입찰', hasFile: false },
      { id: 'bid-준공-3', name: '사진대장', category: '입찰', hasFile: false },
    ],
  },
  {
    key: '정산서류', label: '정산서류',
    items: [
      { id: 'bid-정산-1', name: '정산서', category: '입찰', hasFile: false },
      { id: 'bid-정산-2', name: '하자보수확인서', category: '입찰', hasFile: false },
    ],
  },
  {
    key: '설계변경', label: '설계변경',
    items: [
      { id: 'bid-설계-1', name: '설계변경 신청서', category: '입찰', hasFile: false },
      { id: 'bid-설계-2', name: '변경 도면', category: '입찰', hasFile: false },
    ],
  },
]

// --- 유틸 ---
function calcDday(expiryDate: string | null): number | null {
  if (!expiryDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  expiry.setHours(0, 0, 0, 0)
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function getDdayColor(dday: number | null): string {
  if (dday === null) return ''
  if (dday <= 30) return 'bg-[#fee2e2] text-[#991b1b]'
  if (dday <= 60) return 'bg-[#ffedd5] text-[#9a3412]'
  return 'bg-[#d1fae5] text-[#065f46]'
}

function getDdayText(dday: number | null): string {
  if (dday === null) return ''
  if (dday < 0) return `D+${Math.abs(dday)} (만료)`
  if (dday === 0) return 'D-Day'
  return `D-${dday}`
}

// --- 케밥 메뉴 ---
function KebabMenu({ onEdit, onReplace, onDelete }: { onEdit: () => void; onReplace: () => void; onDelete: () => void }) {
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
        <div className="absolute right-0 top-8 w-32 bg-surface rounded-lg shadow-lg border border-border-primary py-1 z-20">
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onEdit() }}
            className="w-full text-left px-4 py-2 text-sm text-txt-secondary hover:bg-surface-tertiary transition-colors"
          >
            수정
          </button>
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onReplace() }}
            className="w-full text-left px-4 py-2 text-sm text-txt-secondary hover:bg-surface-tertiary transition-colors"
          >
            파일 교체
          </button>
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onDelete() }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
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
  docName,
  onConfirm,
  onCancel,
}: {
  docName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-surface rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-sm mx-4 p-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#fee2e2] flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-txt-primary mb-2">서류 삭제</h3>
          <p className="text-sm text-txt-secondary mb-1">
            <span className="font-semibold">{docName}</span>
          </p>
          <p className="text-sm text-txt-tertiary mb-6">
            정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-txt-secondary border border-border-secondary rounded-lg hover:bg-surface-tertiary transition-colors"
            >
              취소
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
            >
              삭제
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- PDF 아이콘 ---
function PdfIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-10 h-10'} viewBox="0 0 40 40" fill="none">
      <rect x="4" y="2" width="26" height="36" rx="3" fill="#E5E7EB" stroke="#9CA3AF" strokeWidth="1.5" />
      <rect x="10" y="2" width="20" height="10" rx="2" fill="#EF4444" />
      <text x="20" y="10" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold">PDF</text>
      <line x1="10" y1="18" x2="26" y2="18" stroke="#D1D5DB" strokeWidth="1.5" />
      <line x1="10" y1="23" x2="26" y2="23" stroke="#D1D5DB" strokeWidth="1.5" />
      <line x1="10" y1="28" x2="20" y2="28" stroke="#D1D5DB" strokeWidth="1.5" />
    </svg>
  )
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-10 h-10'} viewBox="0 0 40 40" fill="none">
      <rect x="4" y="2" width="26" height="36" rx="3" fill="#E5E7EB" stroke="#9CA3AF" strokeWidth="1.5" />
      <path d="M22 2v8a2 2 0 002 2h6" stroke="#9CA3AF" strokeWidth="1.5" fill="none" />
      <line x1="10" y1="18" x2="26" y2="18" stroke="#D1D5DB" strokeWidth="1.5" />
      <line x1="10" y1="23" x2="26" y2="23" stroke="#D1D5DB" strokeWidth="1.5" />
      <line x1="10" y1="28" x2="20" y2="28" stroke="#D1D5DB" strokeWidth="1.5" />
    </svg>
  )
}

function EmptyFileIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-10 h-10'} viewBox="0 0 40 40" fill="none">
      <rect x="4" y="2" width="26" height="36" rx="3" fill="#F9FAFB" stroke="#D1D5DB" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d="M16 18v6m-3-3h6" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// --- 드래그앤드롭 영역 ---
function DropZone({ onFileDrop }: { onFileDrop: (file: File) => void }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }
  const handleDragLeave = () => setDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFileDrop(file)
  }
  const handleClick = () => inputRef.current?.click()
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFileDrop(file)
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`border-[1.5px] border-dashed rounded-[10px] px-6 py-6 text-center cursor-pointer transition-colors ${
        dragging
          ? 'border-accent bg-accent-light text-accent-text'
          : 'border-[#d1d5db] hover:border-accent hover:bg-accent-light hover:text-accent-text'
      }`}
    >
      <input ref={inputRef} type="file" className="hidden" onChange={handleChange} />
      <svg className="w-10 h-10 mx-auto mb-3 text-txt-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
      <p className="text-sm text-txt-secondary mb-1">파일을 드래그하거나 클릭하여 업로드</p>
      <p className="text-xs text-txt-tertiary">PDF, 이미지 파일 지원</p>
    </div>
  )
}

// --- 서류 업로드 모달 ---
function UploadModal({
  onClose,
  activeTab,
}: {
  onClose: () => void
  activeTab: TabKey
}) {
  const [tab, setTab] = useState<TabKey>(activeTab)
  const [docName, setDocName] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleFileDrop = (file: File) => {
    setSelectedFile(file)
  }

  const handleSubmit = () => {
    if (!docName.trim()) {
      alert('서류명을 입력해주세요.')
      return
    }
    // placeholder - 실제 업로드 구현 시 Supabase Storage 연동
    alert(`서류 업로드 (placeholder)\n분류: ${tab}\n서류명: ${docName}\n${selectedFile ? `파일: ${selectedFile.name}` : '파일 미선택'}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-surface rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary">
          <h2 className="text-lg font-semibold text-txt-primary">서류 업로드</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-secondary text-txt-tertiary hover:text-txt-secondary"
          >
            &#x2715;
          </button>
        </div>

        {/* 본문 */}
        <div className="px-6 py-4 space-y-4">
          {/* 분류 선택 */}
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1">분류 *</label>
            <div className="flex gap-2">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    tab === t.key
                      ? 'bg-accent text-white'
                      : 'bg-surface-secondary text-txt-secondary hover:bg-surface-tertiary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 서류명 */}
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1">서류명 *</label>
            <input
              type="text"
              value={docName}
              onChange={e => setDocName(e.target.value)}
              placeholder="예: 사업자등록증"
              className="w-full px-3 h-[36px] border border-border-primary rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </div>

          {/* 유효기간 (회사 기본서류인 경우) */}
          {tab === '회사' && (
            <div>
              <label className="block text-xs font-medium text-txt-secondary mb-1">유효기간</label>
              <input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                className="w-full px-3 h-[36px] border border-border-primary rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              />
            </div>
          )}

          {/* 시 선택 (수도/소규모인 경우) */}
          {(tab === '수도' || tab === '소규모') && (
            <div>
              <label className="block text-xs font-medium text-txt-secondary mb-1">시 *</label>
              <select
                value={selectedCity}
                onChange={e => setSelectedCity(e.target.value)}
                className="w-full px-3 h-[36px] border border-border-primary rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              >
                <option value="">시 선택</option>
                {CITIES.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          )}

          {/* 드래그앤드롭 */}
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1">파일</label>
            {selectedFile ? (
              <div className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg border border-border-primary">
                <PdfIcon className="w-8 h-8 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-txt-primary truncate">{selectedFile.name}</p>
                  <p className="text-xs text-txt-tertiary">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-txt-tertiary hover:text-red-500 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <DropZone onFileDrop={handleFileDrop} />
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border-primary">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-txt-secondary border border-border-secondary rounded-lg hover:bg-surface-tertiary transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors font-medium"
          >
            업로드
          </button>
        </div>
      </div>
    </div>
  )
}

// --- 수정 모달 ---
function EditDocModal({
  doc,
  onClose,
  onSave,
}: {
  doc: { id: string; name: string; expiryDate?: string | null }
  onClose: () => void
  onSave: (id: string, name: string, expiryDate: string | null) => void
}) {
  const [name, setName] = useState(doc.name)
  const [expiryDate, setExpiryDate] = useState(doc.expiryDate || '')

  const handleSubmit = () => {
    if (!name.trim()) {
      alert('서류명을 입력해주세요.')
      return
    }
    onSave(doc.id, name, expiryDate || null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-surface rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary">
          <h2 className="text-lg font-semibold text-txt-primary">서류 수정</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-secondary text-txt-tertiary hover:text-txt-secondary"
          >
            &#x2715;
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1">서류명</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 h-[36px] border border-border-primary rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1">유효기간</label>
            <input
              type="date"
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
              className="w-full px-3 h-[36px] border border-border-primary rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border-primary">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-txt-secondary border border-border-secondary rounded-lg hover:bg-surface-tertiary transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors font-medium"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

// --- 이미지 뷰어 ---
function ImageViewer({
  onClose,
}: {
  onClose: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="relative max-w-4xl max-h-[90vh] mx-4" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="bg-surface rounded-lg p-8 text-center">
          <FileIcon className="w-24 h-24 mx-auto mb-4" />
          <p className="text-txt-tertiary">미리보기를 사용할 수 없습니다</p>
          <p className="text-xs text-txt-tertiary mt-1">Supabase Storage 연동 후 지원 예정</p>
        </div>
      </div>
    </div>
  )
}

// --- 회사 기본서류 카드 ---
function CompanyDocCard({
  doc,
  onEdit,
  onReplace,
  onDelete,
  onClick,
}: {
  doc: CompanyDoc
  onEdit: () => void
  onReplace: () => void
  onDelete: () => void
  onClick: () => void
}) {
  const dday = calcDday(doc.expiryDate)

  return (
    <div
      onClick={onClick}
      className="bg-surface rounded-[10px] border border-border-primary p-4 hover:shadow-md transition cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {doc.hasFile ? <PdfIcon className="w-10 h-10" /> : <EmptyFileIcon className="w-10 h-10" />}
          <div>
            <h3 className="text-sm font-semibold text-txt-primary">{doc.name}</h3>
            {doc.hasFile ? (
              <p className="text-xs text-txt-tertiary mt-0.5">등록됨</p>
            ) : (
              <p className="text-xs text-orange-500 mt-0.5">미등록</p>
            )}
          </div>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <KebabMenu onEdit={onEdit} onReplace={onReplace} onDelete={onDelete} />
        </div>
      </div>

      {/* 유효기간 */}
      {doc.expiryDate && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-tertiary">
          <span className="text-xs text-txt-tertiary">만료: {doc.expiryDate}</span>
          {dday !== null && (
            <span className={`text-[11px] font-medium px-[10px] py-[2px] rounded-full ${getDdayColor(dday)}`}>
              {getDdayText(dday)}
            </span>
          )}
        </div>
      )}
      {!doc.expiryDate && doc.hasFile && (
        <div className="mt-2 pt-2 border-t border-border-tertiary">
          <span className="text-xs text-txt-tertiary">유효기간 없음</span>
        </div>
      )}
    </div>
  )
}

// --- 템플릿 카드 ---
function TemplateDocCard({
  doc,
  onEdit,
  onReplace,
  onDelete,
  onClick,
}: {
  doc: TemplateDoc
  onEdit: () => void
  onReplace: () => void
  onDelete: () => void
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="bg-surface rounded-[10px] border border-border-primary p-4 hover:shadow-md transition cursor-pointer group"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {doc.hasFile ? <PdfIcon className="w-10 h-10" /> : <EmptyFileIcon className="w-10 h-10" />}
          <div>
            <h3 className="text-sm font-semibold text-txt-primary">{doc.name}</h3>
            {doc.hasFile ? (
              <p className="text-xs text-txt-tertiary mt-0.5">등록됨</p>
            ) : (
              <p className="text-xs text-orange-500 mt-0.5">미등록</p>
            )}
          </div>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <KebabMenu onEdit={onEdit} onReplace={onReplace} onDelete={onDelete} />
        </div>
      </div>
    </div>
  )
}

// --- 시별 아코디언 ---
function CityAccordion({
  cityName,
  templates,
  onEdit,
  onReplace,
  onDelete,
  onPreview,
}: {
  cityName: string
  templates: TemplateDoc[]
  onEdit: (doc: TemplateDoc) => void
  onReplace: (doc: TemplateDoc) => void
  onDelete: (doc: TemplateDoc) => void
  onPreview: (doc: TemplateDoc) => void
}) {
  const [open, setOpen] = useState(false)
  const fileCount = templates.filter(t => t.hasFile).length

  return (
    <div className="border border-border-primary rounded-[10px] overflow-hidden">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-secondary hover:bg-surface-tertiary transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-txt-tertiary transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-txt-primary">{cityName}</span>
        </div>
        <span className="text-xs text-txt-tertiary">{fileCount}/{templates.length}개 등록</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
          {templates.map(doc => (
            <TemplateDocCard
              key={doc.id}
              doc={doc}
              onEdit={() => onEdit(doc)}
              onReplace={() => onReplace(doc)}
              onDelete={() => onDelete(doc)}
              onClick={() => onPreview(doc)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// --- 입찰/현장 분류 아코디언 ---
function BidGroupAccordion({
  group,
  onEdit,
  onReplace,
  onDelete,
  onPreview,
  onAddDoc,
}: {
  group: BidGroup
  onEdit: (doc: TemplateDoc) => void
  onReplace: (doc: TemplateDoc) => void
  onDelete: (doc: TemplateDoc) => void
  onPreview: (doc: TemplateDoc) => void
  onAddDoc: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const fileCount = group.items.filter(t => t.hasFile).length

  const handleAdd = () => {
    if (!newName.trim()) return
    onAddDoc(newName.trim())
    setNewName('')
    setAdding(false)
  }

  return (
    <div className="border border-border-primary rounded-[10px] overflow-hidden">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-secondary hover:bg-surface-tertiary transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-txt-tertiary transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-txt-primary">{group.label}</span>
        </div>
        <span className="text-xs text-txt-tertiary">{fileCount}/{group.items.length}개 등록</span>
      </button>
      {open && (
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.items.map(doc => (
              <TemplateDocCard
                key={doc.id}
                doc={doc}
                onEdit={() => onEdit(doc)}
                onReplace={() => onReplace(doc)}
                onDelete={() => onDelete(doc)}
                onClick={() => onPreview(doc)}
              />
            ))}
          </div>

          {/* 서류 추가 */}
          <div className="mt-3 pt-3 border-t border-border-tertiary">
            {adding ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="서류명 입력"
                  autoFocus
                  className="flex-1 px-3 h-[36px] border border-border-primary rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                />
                <button
                  onClick={handleAdd}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors"
                >
                  추가
                </button>
                <button
                  onClick={() => { setAdding(false); setNewName('') }}
                  className="px-3 py-1.5 text-xs font-medium text-txt-tertiary border border-border-secondary rounded-lg hover:bg-surface-tertiary transition-colors"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="text-xs text-accent-text hover:text-accent font-medium transition-colors"
              >
                + 서류 추가
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// --- 메인 컴포넌트 ---
export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('회사')
  const [companyDocs, setCompanyDocs] = useState<CompanyDoc[]>(INITIAL_COMPANY_DOCS)
  const [bidGroups, setBidGroups] = useState<BidGroup[]>(INITIAL_BID_GROUPS)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState<{ id: string; name: string; expiryDate?: string | null } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: 'company' | 'bid' } | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // 수도/소규모 템플릿 생성 (시 x 양식)
  const generateCityTemplates = useCallback((category: '수도' | '소규모'): Record<string, TemplateDoc[]> => {
    const result: Record<string, TemplateDoc[]> = {}
    CITIES.forEach(city => {
      result[city] = WORK_TEMPLATE_NAMES.map((name, idx) => ({
        id: `${category}-${city}-${idx}`,
        name,
        category: category === '수도' ? '수도' as TabKey : '소규모' as TabKey,
        cityName: city,
        hasFile: false,
      }))
    })
    return result
  }, [])

  const waterTemplates = generateCityTemplates('수도')
  const smallTemplates = generateCityTemplates('소규모')

  // 회사 서류 수정
  const handleEditCompanyDoc = (id: string, name: string, expiryDate: string | null) => {
    setCompanyDocs(prev => prev.map(d => d.id === id ? { ...d, name, expiryDate } : d))
    setShowEditModal(null)
  }

  // 회사 서류 삭제
  const handleDeleteCompanyDoc = () => {
    if (!deleteTarget) return
    setCompanyDocs(prev => prev.map(d => d.id === deleteTarget.id ? { ...d, hasFile: false } : d))
    setDeleteTarget(null)
  }

  // 입찰 서류 삭제 (목록에서 완전 제거)
  const handleDeleteBidDoc = () => {
    if (!deleteTarget) return
    setBidGroups(prev => prev.map(g => ({
      ...g,
      items: g.items.filter(d => d.id !== deleteTarget.id),
    })))
    setDeleteTarget(null)
  }

  // 입찰 서류 추가
  const handleAddBidDoc = (groupKey: string, docName: string) => {
    setBidGroups(prev => prev.map(g => {
      if (g.key !== groupKey) return g
      return {
        ...g,
        items: [...g.items, {
          id: `bid-${groupKey}-${Date.now()}`,
          name: docName,
          category: '입찰' as TabKey,
          hasFile: false,
        }],
      }
    }))
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === 'company') handleDeleteCompanyDoc()
    else handleDeleteBidDoc()
  }

  // 탭 카운트
  const companyCount = companyDocs.filter(d => d.hasFile).length
  const expiringSoonCount = companyDocs.filter(d => {
    const dd = calcDday(d.expiryDate)
    return dd !== null && dd <= 30
  }).length

  return (
    <div className="max-w-full">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">서류함</h1>
          <p className="text-sm text-txt-tertiary mt-1">빈 양식 및 회사 기본서류 보관소</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          + 서류 업로드
        </button>
      </div>

      {/* 만료 임박 알림 */}
      {expiringSoonCount > 0 && (
        <div className="mb-4 px-4 py-3 bg-[#fff5f5] border border-[#fecaca] rounded-[10px] flex items-center gap-2">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-sm text-[#991b1b]">
            만료 임박 서류 {expiringSoonCount}건 - 30일 이내 만료되는 서류가 있습니다.
          </span>
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 mb-6 border-b border-border-primary">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-accent text-accent-text'
                : 'border-transparent text-txt-tertiary hover:text-txt-secondary'
            }`}
          >
            {tab.label}
            {tab.key === '회사' && (
              <span className={`ml-1.5 px-[10px] py-[2px] rounded-full text-[11px] font-medium ${
                activeTab === '회사' ? 'bg-accent-light text-accent-text' : 'bg-surface-secondary text-txt-tertiary'
              }`}>
                {companyCount}/{companyDocs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 회사 기본서류 탭 */}
      {activeTab === '회사' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companyDocs.map(doc => (
            <CompanyDocCard
              key={doc.id}
              doc={doc}
              onEdit={() => setShowEditModal({ id: doc.id, name: doc.name, expiryDate: doc.expiryDate })}
              onReplace={() => {
                // placeholder: 파일 교체
                alert('파일 교체 기능은 Supabase Storage 연동 후 지원 예정입니다.')
              }}
              onDelete={() => setDeleteTarget({ id: doc.id, name: doc.name, type: 'company' })}
              onClick={() => {
                if (doc.hasFile) setShowPreview(true)
              }}
            />
          ))}
        </div>
      )}

      {/* 수도 탭 */}
      {activeTab === '수도' && (
        <div className="space-y-3">
          <p className="text-sm text-txt-tertiary mb-2">시별 수도공사 서류 템플릿</p>
          {CITIES.map(city => (
            <CityAccordion
              key={city}
              cityName={city}
              templates={waterTemplates[city]}
              onEdit={(doc) => setShowEditModal({ id: doc.id, name: doc.name })}
              onReplace={() => alert('파일 교체 기능은 Supabase Storage 연동 후 지원 예정입니다.')}
              onDelete={(doc) => setDeleteTarget({ id: doc.id, name: doc.name, type: 'bid' })}
              onPreview={(doc) => { if (doc.hasFile) setShowPreview(true) }}
            />
          ))}
        </div>
      )}

      {/* 소규모 탭 */}
      {activeTab === '소규모' && (
        <div className="space-y-3">
          <p className="text-sm text-txt-tertiary mb-2">시별 소규모 주택수선 서류 템플릿</p>
          {CITIES.map(city => (
            <CityAccordion
              key={city}
              cityName={city}
              templates={smallTemplates[city]}
              onEdit={(doc) => setShowEditModal({ id: doc.id, name: doc.name })}
              onReplace={() => alert('파일 교체 기능은 Supabase Storage 연동 후 지원 예정입니다.')}
              onDelete={(doc) => setDeleteTarget({ id: doc.id, name: doc.name, type: 'bid' })}
              onPreview={(doc) => { if (doc.hasFile) setShowPreview(true) }}
            />
          ))}
        </div>
      )}

      {/* 입찰/현장 탭 */}
      {activeTab === '입찰' && (
        <div className="space-y-3">
          <p className="text-sm text-txt-tertiary mb-2">
            서류 양식을 업로드하면 접수대장/현장관리 데이터로 자동 채워집니다
          </p>
          {bidGroups.map(group => (
            <BidGroupAccordion
              key={group.key}
              group={group}
              onEdit={(doc) => setShowEditModal({ id: doc.id, name: doc.name })}
              onReplace={() => alert('파일 교체 기능은 Supabase Storage 연동 후 지원 예정입니다.')}
              onDelete={(doc) => setDeleteTarget({ id: doc.id, name: doc.name, type: 'bid' })}
              onPreview={(doc) => { if (doc.hasFile) setShowPreview(true) }}
              onAddDoc={(docName) => handleAddBidDoc(group.key, docName)}
            />
          ))}
        </div>
      )}

      {/* 서류 업로드 모달 */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          activeTab={activeTab}
        />
      )}

      {/* 수정 모달 */}
      {showEditModal && (
        <EditDocModal
          doc={showEditModal}
          onClose={() => setShowEditModal(null)}
          onSave={handleEditCompanyDoc}
        />
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <DeleteConfirmModal
          docName={deleteTarget.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* 미리보기 */}
      {showPreview && (
        <ImageViewer onClose={() => setShowPreview(false)} />
      )}
    </div>
  )
}
