'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import AsTargetPicker from './AsTargetPicker'
import AsVendorPicker from './AsVendorPicker'
import AsDetailPanel from './AsDetailPanel'
import {
  AS_CATEGORY_OPTIONS,
  AS_ISSUE_TYPES,
  AS_STATUS_LIST,
  normalizeAsRecord,
  type AsIssueType,
  type AsRecord,
  type AsStatus,
} from '@/lib/as/record'
import type { AsCategory, AsTargetPick } from '@/lib/as/target'

// --- 타입 ---
type TopTab = '입찰수의계약' | '지원사업'
type SubTab = '수도' | '소규모'
type FilterTab = '전체' | AsStatus

// --- 상수 ---
const FILTER_TABS: FilterTab[] = ['전체', '접수', '진행중', '완료']

const TOP_TABS: { key: TopTab; label: string }[] = [
  { key: '입찰수의계약', label: '입찰 및 수의계약' },
  { key: '지원사업', label: '지원사업' },
]
const SUB_TABS: SubTab[] = ['수도', '소규모']

const STATUS_STYLE: Record<AsStatus, string> = {
  '접수': 'bg-[#fee2e2] text-[#991b1b]',
  '진행중': 'bg-[#ffedd5] text-[#9a3412]',
  '완료': 'bg-[#d1fae5] text-[#065f46]',
}

// 종류(상태가 아님)는 회색 한 가지로 — 색은 진행 상태에만 쓴다 (대표 원칙)
const ISSUE_CHIP = 'bg-surface-secondary text-txt-secondary'

type AsForm = Omit<AsRecord, 'id' | 'created_at' | 'photos' | 'photos_before' | 'photos_after'>

const EMPTY_FORM: AsForm = {
  project_id: null,
  site_id: null,
  vendor_id: null,
  site_name: '',
  address: '',
  category: '입찰수의계약',
  issue_type: '누수',
  description: '',
  status: '접수',
  reported_date: new Date().toISOString().slice(0, 10),
  resolved_date: null,
  assigned_vendor_id: null,
  cost: null,
  resolution: null,
  memo: null,
}

// --- 컴포넌트 ---
export default function AsPage() {
  const [records, setRecords] = useState<AsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [topTab, setTopTab] = useState<TopTab>('입찰수의계약')
  const [subTab, setSubTab] = useState<SubTab>('수도')
  const [activeTab, setActiveTab] = useState<FilterTab>('전체')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<AsForm>(EMPTY_FORM)
  const [customIssueType, setCustomIssueType] = useState('')
  const [saving, setSaving] = useState(false)

  // --- 데이터 로드 ---
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('as_records')
      .select('*')
      .order('reported_date', { ascending: false })
    if (!error && data) setRecords((data as AsRecord[]).map(normalizeAsRecord))
    setLoading(false)
  }, [])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  // --- 필터링 ---
  // 선택된 탭의 카테고리 (지원사업이면 하위 탭 값)
  const activeCategory: AsCategory = topTab === '지원사업' ? subTab : '입찰수의계약'
  const categoryRecords = records.filter(r => r.category === activeCategory)
  const filtered = activeTab === '전체' ? categoryRecords : categoryRecords.filter(r => r.status === activeTab)

  const selected = useMemo(() => records.find(r => r.id === selectedId) ?? null, [records, selectedId])

  // --- 카테고리별 건수 (탭 뱃지용) ---
  const countByCategory = (cat: AsCategory) => records.filter(r => r.category === cat).length
  const topTabCount = (tab: TopTab) =>
    tab === '지원사업' ? countByCategory('수도') + countByCategory('소규모') : countByCategory('입찰수의계약')

  // --- 요약 (선택한 탭 기준) ---
  const summary = {
    total: categoryRecords.length,
    접수: categoryRecords.filter(r => r.status === '접수').length,
    진행중: categoryRecords.filter(r => r.status === '진행중').length,
    완료: categoryRecords.filter(r => r.status === '완료').length,
  }

  // --- 모달 열기 ---
  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, category: activeCategory, reported_date: new Date().toISOString().slice(0, 10) })
    setCustomIssueType('')
    setModalOpen(true)
  }

  const openEdit = (record: AsRecord) => {
    setEditingId(record.id)
    const isPresetIssue = (AS_ISSUE_TYPES as readonly string[]).includes(record.issue_type)
    setCustomIssueType(isPresetIssue ? '' : record.issue_type)
    setForm({
      project_id: record.project_id,
      site_id: record.site_id,
      vendor_id: record.vendor_id,
      site_name: record.site_name,
      address: record.address,
      category: record.category || '입찰수의계약',
      issue_type: isPresetIssue ? record.issue_type : '기타',
      description: record.description,
      status: record.status,
      reported_date: record.reported_date,
      resolved_date: record.resolved_date,
      assigned_vendor_id: record.assigned_vendor_id,
      cost: record.cost,
      resolution: record.resolution,
      memo: record.memo,
    })
    setModalOpen(true)
  }

  // 구분을 바꾸면 고른 현장은 떼어 낸다 — 수도 접수를 골라 둔 채 입찰로 바꾸면 짝이 안 맞는다
  const changeCategory = (category: AsCategory) => {
    setForm(f => (f.category === category ? f : { ...f, category, site_id: null, project_id: null }))
  }

  const applyTarget = (pick: AsTargetPick) => {
    setForm(f => ({
      ...f,
      site_id: pick.site_id,
      project_id: pick.project_id,
      site_name: pick.site_name || f.site_name,
      address: pick.address || f.address,
    }))
  }

  // --- 저장 ---
  const handleSave = async () => {
    if (!form.site_name.trim() || !form.address.trim() || !form.description.trim()) {
      toast.info('현장명, 주소, 하자접수 내용은 필수입니다.')
      return
    }
    setSaving(true)
    const payload = {
      ...form,
      issue_type: form.issue_type === '기타' && customIssueType.trim() ? customIssueType.trim() : form.issue_type,
      resolved_date: form.status === '완료' && !form.resolved_date
        ? new Date().toISOString().slice(0, 10)
        : form.resolved_date,
    }

    const { error } = editingId
      ? await supabase.from('as_records').update(payload).eq('id', editingId)
      : await supabase.from('as_records').insert(payload)
    setSaving(false)
    if (error) {
      toast.error(`저장 실패: ${error.message}`)
      return
    }
    setModalOpen(false)
    fetchRecords()
  }

  // --- 상태 변경 ---
  const handleStatusChange = async (id: string, newStatus: AsStatus) => {
    const update: Record<string, unknown> = { status: newStatus }
    if (newStatus === '완료') update.resolved_date = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('as_records').update(update).eq('id', id)
    if (error) toast.error(`상태를 바꾸지 못했습니다: ${error.message}`)
    fetchRecords()
  }

  // --- 삭제 ---
  const handleDelete = async (id: string) => {
    if (!confirm('이 A/S 기록을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('as_records').delete().eq('id', id)
    if (error) { toast.error(`삭제하지 못했습니다: ${error.message}`); return }
    if (selectedId === id) setSelectedId(null)
    fetchRecords()
  }

  // --- 렌더 ---
  return (
    <div className="md:p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="whitespace-nowrap text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">A/S 관리</h1>
        <button
          onClick={openCreate}
          className="btn-primary whitespace-nowrap"
        >
          + A/S 접수
        </button>
      </div>

      {/* 카테고리 탭 */}
      <div className="tabs-container">
        {TOP_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setTopTab(tab.key); setActiveTab('전체') }}
            className={`tab-item ${topTab === tab.key ? 'tab-active' : ''}`}
          >
            {tab.label}
            <span className={`ml-2 text-xs px-[10px] py-[2px] rounded-full font-medium ${
              topTab === tab.key ? 'bg-accent-light text-accent-text' : 'bg-surface-tertiary text-txt-secondary'
            }`}>{topTabCount(tab.key)}</span>
          </button>
        ))}
      </div>

      {/* 지원사업 하위 탭 (수도/소규모) */}
      {topTab === '지원사업' && (
        <div className="flex gap-1 bg-surface-secondary rounded-lg p-1 w-fit max-w-full overflow-x-auto *:whitespace-nowrap *:shrink-0">
          {SUB_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => { setSubTab(tab); setActiveTab('전체') }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                subTab === tab
                  ? 'bg-surface text-txt-primary shadow-sm'
                  : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              {tab}
              <span className="ml-1 text-xs">({countByCategory(tab)})</span>
            </button>
          ))}
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[
          { label: '총 건수', value: summary.total, color: 'text-txt-primary', bg: 'bg-surface' },
          { label: '접수(대기)', value: summary.접수, color: 'text-[#991b1b]', bg: 'bg-[#fff5f5]' },
          { label: '진행중', value: summary.진행중, color: 'text-[#9a3412]', bg: 'bg-[#fff8f1]' },
          { label: '완료', value: summary.완료, color: 'text-[#065f46]', bg: 'bg-[#f0fdf4]' },
        ].map(card => (
          <div key={card.label} className={`${card.bg} border border-border-primary rounded-[10px] p-4`}>
            <p className="text-sm text-txt-tertiary">{card.label}</p>
            <p className={`text-2xl font-semibold mt-1 tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-1 bg-surface-secondary rounded-lg p-1 w-fit max-w-full overflow-x-auto *:whitespace-nowrap *:shrink-0">
        {FILTER_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              activeTab === tab
                ? 'bg-surface text-txt-primary shadow-sm'
                : 'text-txt-secondary hover:text-txt-primary'
            }`}
          >
            {tab}
            {tab !== '전체' && (
              <span className="ml-1 text-xs">({summary[tab as AsStatus]})</span>
            )}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-surface border border-border-primary rounded-[10px] overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-txt-tertiary">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-txt-tertiary">A/S 기록이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-primary bg-surface-secondary">
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">접수일</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">현장/주소</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">하자유형</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">하자접수 내용</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">해결내용</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">담당업체</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">상태</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">처리일</th>
                  <th className="text-right px-4 py-3 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">비용</th>
                  <th className="text-center px-4 py-3 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(record => (
                  <tr key={record.id} className="border-b border-border-tertiary hover:bg-surface-tertiary transition">
                    <td className="px-4 py-3 text-txt-secondary whitespace-nowrap">{record.reported_date}</td>
                    <td className="px-4 py-3">
                      {/* 현장명을 누르면 상세가 오른쪽에서 열린다 — 사진은 거기서 올린다 */}
                      <button
                        onClick={() => setSelectedId(record.id)}
                        className="text-left font-medium text-txt-primary hover:text-accent-text hover:underline"
                      >
                        {record.site_name || '(이름없음)'}
                      </button>
                      <div className="text-xs text-txt-tertiary mt-0.5">{record.address}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-[10px] py-[2px] rounded-full text-[11px] font-medium ${ISSUE_CHIP}`}>
                        {record.issue_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-txt-secondary max-w-[200px] truncate" title={record.description || ''}>
                      {record.description}
                    </td>
                    <td className="px-4 py-3 text-txt-secondary max-w-[200px] truncate" title={record.resolution || ''}>
                      {record.resolution || '-'}
                    </td>
                    <td className="px-4 py-3 text-txt-secondary">{record.assigned_vendor_id || '-'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={record.status}
                        onChange={e => handleStatusChange(record.id, e.target.value as AsStatus)}
                        className={`px-[10px] py-[2px] rounded-full text-[11px] font-medium border-0 cursor-pointer ${STATUS_STYLE[record.status]}`}
                      >
                        {AS_STATUS_LIST.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-txt-secondary whitespace-nowrap">
                      {record.resolved_date || '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-txt-secondary whitespace-nowrap tabular-nums">
                      {record.cost != null ? record.cost.toLocaleString() + '원' : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(record)}
                          className="px-2 py-1 text-xs text-accent-text hover:bg-accent-light rounded transition"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDelete(record.id)}
                          className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 상세 패널 */}
      {selected && (
        <AsDetailPanel
          record={selected}
          onClose={() => setSelectedId(null)}
          onEdit={() => openEdit(selected)}
          onDelete={() => handleDelete(selected.id)}
          onStatusChange={status => handleStatusChange(selected.id, status)}
          onPhotosSaved={next =>
            setRecords(prev => prev.map(r => (r.id === selected.id ? { ...r, ...next } : r)))
          }
        />
      )}

      {/* 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-surface rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary">
              <h2 className="text-lg font-semibold text-txt-primary">
                {editingId ? 'A/S 수정' : 'A/S 접수'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-txt-tertiary hover:text-txt-secondary text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* 구분 */}
              <div>
                <label className="block text-sm font-medium text-txt-secondary mb-1">구분 *</label>
                <select
                  value={form.category}
                  onChange={e => changeCategory(e.target.value as AsCategory)}
                  className="w-full border border-border-primary rounded-lg px-3 h-[36px] text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
                >
                  {AS_CATEGORY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* 현장 고르기 — 구분에 따라 현장관리 / 접수대장에서 찾는다 */}
              <AsTargetPicker
                category={form.category}
                siteId={form.site_id}
                projectId={form.project_id}
                siteName={form.site_name}
                onPick={applyTarget}
                onClear={() => setForm(f => ({ ...f, site_id: null, project_id: null }))}
              />

              {/* 현장명 */}
              <div>
                <label className="block text-sm font-medium text-txt-secondary mb-1">현장명 *</label>
                <input
                  type="text"
                  value={form.site_name}
                  onChange={e => setForm(f => ({ ...f, site_name: e.target.value }))}
                  className="w-full border border-border-primary rounded-lg px-3 h-[36px] text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
                  placeholder="현장명 입력"
                />
              </div>

              {/* 주소 */}
              <div>
                <label className="block text-sm font-medium text-txt-secondary mb-1">주소 *</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full border border-border-primary rounded-lg px-3 h-[36px] text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
                  placeholder="주소 입력"
                />
              </div>

              {/* 하자유형 + 상태 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-txt-secondary mb-1">하자유형</label>
                  <select
                    value={form.issue_type}
                    onChange={e => setForm(f => ({ ...f, issue_type: e.target.value as AsIssueType }))}
                    className="w-full border border-border-primary rounded-lg px-3 h-[36px] text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
                  >
                    {AS_ISSUE_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {form.issue_type === '기타' && (
                    <input
                      type="text"
                      value={customIssueType}
                      onChange={e => setCustomIssueType(e.target.value)}
                      className="w-full mt-2 border border-border-primary rounded-lg px-3 h-[36px] text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
                      placeholder="하자유형 직접 입력"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-txt-secondary mb-1">상태</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as AsStatus }))}
                    className="w-full border border-border-primary rounded-lg px-3 h-[36px] text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
                  >
                    {AS_STATUS_LIST.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 접수일 + 처리일 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-txt-secondary mb-1">접수일</label>
                  <input
                    type="date"
                    value={form.reported_date}
                    onChange={e => setForm(f => ({ ...f, reported_date: e.target.value }))}
                    className="w-full border border-border-primary rounded-lg px-3 h-[36px] text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-txt-secondary mb-1">처리일</label>
                  <input
                    type="date"
                    value={form.resolved_date || ''}
                    onChange={e => setForm(f => ({ ...f, resolved_date: e.target.value || null }))}
                    className="w-full border border-border-primary rounded-lg px-3 h-[36px] text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
                  />
                </div>
              </div>

              {/* 하자접수 내용 */}
              <div>
                <label className="block text-sm font-medium text-txt-secondary mb-1">하자접수 내용 *</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-border-primary rounded-lg px-3 py-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none resize-none"
                  placeholder="접수된 하자 내용을 입력하세요"
                />
              </div>

              {/* 해결내용 (진행중/완료일 때만 표시) */}
              {(form.status === '진행중' || form.status === '완료') && (
                <div>
                  <label className="block text-sm font-medium text-txt-secondary mb-1">해결내용</label>
                  <textarea
                    value={form.resolution || ''}
                    onChange={e => setForm(f => ({ ...f, resolution: e.target.value || null }))}
                    rows={3}
                    className="w-full border border-border-primary rounded-lg px-3 py-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none resize-none"
                    placeholder="해결 내용을 입력하세요"
                  />
                </div>
              )}

              {/* 담당업체 */}
              <AsVendorPicker
                name={form.assigned_vendor_id || ''}
                onChange={({ name, vendorId }) =>
                  setForm(f => ({ ...f, assigned_vendor_id: name || null, vendor_id: vendorId }))
                }
              />

              {/* 비용 */}
              <div>
                <label className="block text-sm font-medium text-txt-secondary mb-1">비용 (원)</label>
                <input
                  type="number"
                  value={form.cost ?? ''}
                  onChange={e => setForm(f => ({ ...f, cost: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full border border-border-primary rounded-lg px-3 h-[36px] text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none tabular-nums"
                  placeholder="0"
                />
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-sm font-medium text-txt-secondary mb-1">메모</label>
                <textarea
                  value={form.memo || ''}
                  onChange={e => setForm(f => ({ ...f, memo: e.target.value || null }))}
                  rows={2}
                  className="w-full border border-border-primary rounded-lg px-3 py-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none resize-none"
                  placeholder="메모 (선택)"
                />
              </div>

              {!editingId && (
                <p className="text-[11px] text-txt-tertiary">
                  A/S 전·후 사진은 접수한 뒤 목록에서 현장명을 눌러 올립니다.
                </p>
              )}
            </div>

            {/* 하단 버튼 */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border-primary">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-txt-secondary bg-surface-secondary rounded-lg hover:bg-surface-tertiary transition"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-accent rounded-lg hover:bg-accent-hover transition disabled:opacity-50"
              >
                {saving ? '저장 중...' : editingId ? '수정' : '접수'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
