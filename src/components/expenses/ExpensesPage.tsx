'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { formatMoney, parseMoney } from '@/lib/utils/format'
import WorkTargetPicker from '@/components/common/WorkTargetPicker'
import SettlementTab from '@/components/expenses/SettlementTab'
import { projectLabel, workKindFromIds, workTargetLabel, type WorkKind } from '@/lib/workTarget'
import {
  EXPENSE_CATEGORIES,
  LABOR_CATEGORY,
  suggestedLaborCategory,
  validateLaborExpense,
} from '@/lib/expenseCategory'

// --- 타입 ---
interface Expense {
  id: string
  site_id: string | null
  project_id: string | null
  staff_id: string | null
  category: string
  title: string
  amount: number
  expense_date: string
  receipt_url: string | null
  memo: string | null
  created_at: string
}

interface Staff { id: string; name: string }
interface Site { id: string; name: string; contract_type?: string | null; status?: string | null; budget?: number | null }
interface Project { id: string; building_name: string | null; ho: string | null; dong: string | null; total_cost?: number | null }

const EXPENSE_CATS = EXPENSE_CATEGORIES

const CAT_COLOR: Record<string, string> = {
  '식대': 'bg-orange-100 text-orange-700', '교통비': 'bg-blue-100 text-blue-700', '자재비': 'bg-green-100 text-green-700',
  '현장경비': 'bg-purple-100 text-purple-700', '노무비': 'bg-sky-100 text-sky-700', '사무용품': 'bg-yellow-100 text-yellow-700',
  '기타': 'bg-surface-secondary text-txt-secondary',
}


// 고정지출은 지웠고 카드분석은 경리(/ledger)로 옮겼다 (2026-10-08 대표)
type Tab = 'expense' | 'settle'

// ===== 메인 =====
export default function ExpensesPage() {
  const [tab, setTab] = useState<Tab>('expense')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [siteList, setSiteList] = useState<Site[]>([])
  const [projectList, setProjectList] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [filterCat, setFilterCat] = useState('전체')

  const loadData = useCallback(async () => {
    setLoading(true)
    const [expR, stfR, sitR, projR] = await Promise.all([
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('staff').select('id, name'),
      supabase.from('sites').select('id, name, contract_type, status, budget'),
      supabase.from('projects').select('id, building_name, ho, dong, total_cost').order('created_at', { ascending: false }),
    ])
    if (!expR.error) setExpenses(expR.data || [])
    if (!stfR.error) setStaffList(stfR.data || [])
    if (!sitR.error) setSiteList(sitR.data || [])
    if (!projR.error) setProjectList((projR.data || []) as Project[])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const staffName = (id: string | null) => !id ? '-' : staffList.find(s => s.id === id)?.name || '-'
  const targetOf = (e: Expense) => workTargetLabel({
    siteId: e.site_id,
    projectId: e.project_id,
    siteName: e.site_id ? siteList.find(s => s.id === e.site_id)?.name : null,
    projectName: e.project_id ? projectLabel(projectList.find(p => p.id === e.project_id) || {}) : null,
  })

  const monthStats = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7)
    const mExp = expenses.filter(e => e.expense_date?.startsWith(ym))
    return { expTotal: mExp.reduce((s, e) => s + (e.amount || 0), 0), expCount: mExp.length }
  }, [expenses])

  const handleDelete = async (table: string, id: string, label: string) => {
    if (!confirm(`"${label}" 삭제하시겠습니까?`)) return
    await supabase.from(table).delete().eq('id', id)
    loadData()
  }

  const openCreate = () => { setEditItem(null); setShowModal(true) }
  const openEdit = (item: any) => { setEditItem(item); setShowModal(true) }

  const filteredExpenses = filterCat === '전체' ? expenses : expenses.filter(e => e.category === filterCat)

  if (loading) return <div className="p-6 max-w-[1200px] mx-auto"><div className="text-center py-20 text-txt-tertiary">불러오는 중...</div></div>

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">지출관리</h1>
          <div className="flex bg-surface-secondary rounded-lg p-0.5">
            {[
              { key: 'expense' as Tab, label: '지출결의서' },
              { key: 'settle' as Tab, label: '정산' },
            ].map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setFilterCat('전체') }}
                className={`px-4 py-1.5 text-sm rounded-md transition ${tab === t.key ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-secondary'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {tab === 'expense' && (
          <button onClick={openCreate}
            className="btn-primary">
            + 결의서 작성
          </button>
        )}
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`stat-card ${tab === 'expense' ? 'stat-card-active' : ''}`}>
          <p className="text-xs text-txt-secondary">이번 달 지출결의</p>
          <p className="text-xl font-semibold text-txt-primary tabular-nums">{monthStats.expTotal.toLocaleString()}원</p>
          <p className="text-xs text-txt-tertiary tabular-nums">{monthStats.expCount}건</p>
        </div>
      </div>

      {/* === 지출결의서 === */}
      {tab === 'expense' && (
        <>
          <div className="flex gap-2 flex-wrap">
            {['전체', ...EXPENSE_CATS].map(c => (
              <button key={c} onClick={() => setFilterCat(c)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${filterCat === c ? 'bg-accent text-white border-accent' : 'bg-surface text-txt-secondary border-border-primary'}`}>{c}</button>
            ))}
          </div>
          <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
            {/* 칸 너비를 내용에 맞춰 고정한다. 자동 배분에 맡기면 날짜·카테고리·작성자처럼
                짧은 값이 두세 줄로 접힌다.
                폭은 퍼센트가 아니라 픽셀이다 — 퍼센트로 두면 화면이 좁아질 때 칸이 같이
                줄고, 한 줄로 고정한 값들은 접히지도 못해 잘려 나간다. 1024px 노트북에서
                날짜·카테고리·관리가 실제로 잘렸다. 남는 폭은 제목이 받고, 그래도 모자라면
                잘리는 대신 표가 가로로 밀린다. */}
            {filteredExpenses.length === 0 ? <div className="text-center py-12 text-txt-quaternary text-sm">등록된 결의서가 없습니다</div> : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] table-fixed text-sm">
                <thead><tr className="bg-surface-secondary border-b border-border-primary">
                  <th className="w-[104px] px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">날짜</th>
                  <th className="w-[92px] px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">카테고리</th>
                  {/* 폭을 주지 않는 유일한 칸 — 남는 자리를 전부 받는다 */}
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">내용</th>
                  {/* 1,000,000,000원이 한 줄에 들어가는 폭 */}
                  <th className="w-[148px] px-4 py-2.5 text-right text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">금액</th>
                  <th className="w-[224px] px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">현장</th>
                  <th className="w-[76px] px-2 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">작성자</th>
                  <th className="w-[100px] px-2 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">관리</th>
                </tr></thead>
                <tbody className="divide-y divide-surface-secondary">
                  {filteredExpenses.map(e => (
                    <tr key={e.id} className="hover:bg-surface-tertiary">
                      <td className="px-4 py-2.5 text-txt-secondary text-[13px] whitespace-nowrap">{e.expense_date}</td>
                      <td className="px-3 py-2.5"><span className={`inline-block whitespace-nowrap text-[11px] px-[10px] py-[2px] rounded-full font-medium ${CAT_COLOR[e.category] || CAT_COLOR['기타']}`}>{e.category}</span></td>
                      {/* 제목과 문서번호·계좌를 한 줄에 이어 붙이면 어디까지가 제목인지 읽히지 않는다. 줄을 나눈다. */}
                      <td className="px-4 py-2.5 text-txt-primary text-[13px]">
                        <div className="line-clamp-2">{e.title}</div>
                        {e.memo && <div className="mt-0.5 text-txt-tertiary text-[11px] line-clamp-2">{e.memo}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-txt-primary text-[13px] tabular-nums whitespace-nowrap">{e.amount.toLocaleString()}원</td>
                      <td className={`px-4 py-2.5 text-[13px] ${targetOf(e).missing ? 'text-[#b53333] font-medium' : 'text-txt-secondary'}`}><div className="line-clamp-2">{targetOf(e).text}</div></td>
                      <td className="px-2 py-2.5 text-txt-secondary text-[13px] whitespace-nowrap">{staffName(e.staff_id)}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-center">
                        <button onClick={() => openEdit(e)} className="btn-inline">수정</button>
                        <button onClick={() => handleDelete('expenses', e.id, e.title)} className="btn-inline-danger">삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* === 정산 — 현장·지원사업별 실지출 합계. 사이드바 메뉴가 아니라 이 페이지 탭이다. === */}
      {tab === 'settle' && (
        <SettlementTab
          expenses={expenses}
          sites={siteList}
          projects={projectList}
          staffName={staffName}
        />
      )}

      {/* 모달 */}
      {showModal && (
        <UnifiedModal item={editItem} staffList={staffList} siteList={siteList} projectList={projectList}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSaved={() => { setShowModal(false); setEditItem(null); loadData() }} />
      )}
    </div>
  )
}

// ===== 통합 모달 =====
function UnifiedModal({ item, staffList, siteList, projectList, onClose, onSaved }: {
  item: any; staffList: Staff[]; siteList: Site[]; projectList: Project[]; onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!item
  const [title, setTitle] = useState(item?.title || '')
  const [amount, setAmount] = useState(item?.amount?.toString() || '')
  const [category, setCategory] = useState(item?.category || '')
  const [memo, setMemo] = useState(item?.memo || '')
  const [expDate, setExpDate] = useState(item?.expense_date || new Date().toISOString().slice(0, 10))
  const [workKind, setWorkKind] = useState<WorkKind>(workKindFromIds(item?.site_id, item?.project_id))
  const [siteId, setSiteId] = useState(item?.site_id || '')
  const [projectId, setProjectId] = useState(item?.project_id || '')
  const [staffId, setStaffId] = useState(item?.staff_id || '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const cats = EXPENSE_CATS
  if (!category && cats.length) setTimeout(() => setCategory(cats[0]), 0)

  const laborForm = category === LABOR_CATEGORY || Boolean(suggestedLaborCategory(title))

  const handleSave = async () => {
    if (!title.trim() || !amount) return
    setFormError(null)
    const nextCategory = suggestedLaborCategory(title) ?? category
    const laborErr = validateLaborExpense({
      category: nextCategory,
      title: title.trim(),
      amount: parseInt(amount),
      expense_date: expDate,
      site_id: siteId || null,
      project_id: projectId || null,
    })
    if (laborErr) { setFormError(laborErr); return }
    setSaving(true)
    const res = await fetch('/api/expenses', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: isEdit ? item.id : undefined,
        category: nextCategory,
        title: title.trim(),
        amount: parseInt(amount),
        expense_date: expDate,
        site_id: siteId || null,
        staff_id: staffId || null,
        receipt_url: null,
        memo: memo || null,
        project_id: projectId || null,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setFormError(json.error || '저장에 실패했습니다'); return }
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? '수정' : '결의서 작성'}</h3>
          <button onClick={onClose} className="text-txt-tertiary hover:text-txt-secondary text-lg">&times;</button>
        </div>
        <div className="modal-body space-y-4">
          <div>
            <label className="label-field">카테고리</label>
            <div className="flex gap-1.5 flex-wrap">
              {cats.map(c => (
                <button key={c} type="button" onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${category === c ? 'bg-accent text-white border-accent' : 'bg-surface text-txt-secondary border-border-primary'}`}>{c}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label-required">내용 *</label>
            <input value={title} onChange={e => {
              const next = e.target.value
              setTitle(next)
              const suggested = suggestedLaborCategory(next)
              if (suggested) setCategory(suggested)
            }} placeholder="지출 내용"
              className="input-field w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-required">금액 *</label>
              <input type="text" inputMode="numeric" value={amount ? formatMoney(amount) : ''} onChange={e => setAmount(String(parseMoney(e.target.value)))} placeholder="0"
                className="input-field w-full text-right tabular-nums" />
            </div>
            <div>
              <label className={laborForm ? 'label-required' : 'label-field'}>지출일 {laborForm ? '*' : ''}</label>
              <input type="date" value={expDate}
                onChange={e => setExpDate(e.target.value)}
                className="input-field w-full" />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className={laborForm ? 'label-required' : 'label-field'}>
                현장 {laborForm ? '*' : ''}
              </label>
              <WorkTargetPicker
                kind={workKind}
                siteId={siteId}
                projectId={projectId}
                sites={siteList}
                projects={projectList}
                onChange={next => { setWorkKind(next.kind); setSiteId(next.siteId); setProjectId(next.projectId) }}
              />
              {laborForm && (
                <p className="mt-1.5 text-[11px] text-txt-tertiary">
                  노무비는 현장 또는 지원사업을 연결해야 준공 가정산에 반영됩니다.
                </p>
              )}
            </div>
            <div>
              <label className="label-field">작성자</label>
              <select value={staffId} onChange={e => setStaffId(e.target.value)}
                className="input-field w-full">
                <option value="">선택 안함</option>
                {staffList.map((s: Staff) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label-field">메모</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} placeholder="메모"
              className="textarea-field w-full" />
          </div>
        </div>
        {formError && <div className="px-6 pb-2 text-sm text-danger">{formError}</div>}
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">취소</button>
          <button onClick={handleSave} disabled={saving || !title.trim() || !amount}
            className="btn-primary disabled:opacity-50">
            {saving ? '저장 중...' : isEdit ? '수정' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
