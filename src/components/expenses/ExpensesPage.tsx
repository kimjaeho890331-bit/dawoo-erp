'use client'

import { useState, useEffect, useCallback, useMemo, useRef, DragEvent } from 'react'
import { CreditCard, AlertTriangle, X, FileText, CheckCircle, Circle, Upload, Table } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatMoney, parseMoney } from '@/lib/utils/format'

// --- 타입 ---
interface Expense {
  id: string
  site_id: string | null
  staff_id: string | null
  category: string
  title: string
  amount: number
  expense_date: string
  receipt_url: string | null
  memo: string | null
  created_at: string
  vendor_id?: string | null
  approver?: string | null
  status?: string | null
}

interface FixedExpense {
  id: string
  title: string
  category: string
  amount: number
  pay_day: number
  auto_pay: boolean
  memo: string | null
  created_at: string
}

interface CardTransaction {
  id: string
  card_name: string
  merchant: string
  amount: number
  category: string
  transaction_date: string
  memo: string | null
  flagged: boolean
  flag_reason: string | null
  staff_id: string | null
  created_at: string
}

interface CardMapping {
  id: string
  card_name: string
  card_last4: string | null
  staff_id: string | null
}

interface Staff { id: string; name: string; role?: string }
interface Site { id: string; name: string }
interface Vendor { id: string; name: string; vendor_type: string; phone: string | null; representative: string | null; business_number: string | null; bank_name: string | null; account_number: string | null; specialty: string | null }

// 이상 탐지 규칙
interface Anomaly {
  type: 'daily_repeat' | 'over_limit' | 'unidentified' | 'weekend' | 'late_night' | 'round_amount'
  severity: 'high' | 'medium' | 'low'
  message: string
  transactions: CardTransaction[]
}

const EXPENSE_CATS = ['노무비', '업체지출', '기타경비'] as const
const FIXED_CATS = ['임대료', '보험료', '통신비', '차량유지', '급여', '세금', '구독료', '기타'] as const
const CARD_CATS = ['노무비', '업체지출', '기타경비'] as const

const CAT_COLOR: Record<string, string> = {
  '노무비': 'bg-blue-100 text-blue-700',
  '업체지출': 'bg-emerald-100 text-emerald-700',
  '기타경비': 'bg-amber-100 text-amber-700',
  '임대료': 'bg-red-100 text-red-700', '보험료': 'bg-teal-100 text-teal-700', '통신비': 'bg-cyan-100 text-cyan-700',
  '차량유지': 'bg-indigo-100 text-indigo-700', '급여': 'bg-emerald-100 text-emerald-700', '세금': 'bg-rose-100 text-rose-700',
  '구독료': 'bg-violet-100 text-violet-700',
  '기타': 'bg-surface-secondary text-txt-secondary',
}

const SEVERITY_COLOR = { high: 'bg-red-50 border-red-200 text-red-700', medium: 'bg-yellow-50 border-yellow-200 text-yellow-700', low: 'bg-blue-50 border-blue-200 text-blue-700' }
const SEVERITY_LABEL = { high: '주의', medium: '확인', low: '참고' }

type Tab = 'expense' | 'fixed' | 'card'

// ===== 이상 탐지 엔진 =====
function detectAnomalies(txns: CardTransaction[], staffList: Staff[]): Anomaly[] {
  const anomalies: Anomaly[] = []
  const ym = new Date().toISOString().slice(0, 7)
  const thisMonth = txns.filter(t => t.transaction_date?.startsWith(ym))

  // 1) 식대 1인 15,000원 초과 (월 기준)
  const mealTxns = thisMonth.filter(t => t.category === '식대')
  const staffIds = [...new Set(txns.map(t => t.staff_id).filter(Boolean))]
  const staffCount = Math.max(staffIds.length, 1)
  const mealTotal = mealTxns.reduce((s, t) => s + t.amount, 0)
  const workDays = 22
  const mealPerPerson = mealTotal / staffCount
  if (mealPerPerson > 15000 * workDays) {
    anomalies.push({
      type: 'over_limit',
      severity: 'high',
      message: `이번 달 식대 1인당 ${Math.round(mealPerPerson / workDays).toLocaleString()}원/일 (기준: 15,000원)`,
      transactions: mealTxns,
    })
  }

  // 2) 매일 반복 결제 (같은 가맹점, 비슷한 금액, 3일 이상 연속)
  const merchantGroups: Record<string, CardTransaction[]> = {}
  thisMonth.forEach(t => {
    const key = `${t.merchant}_${t.card_name}`
    if (!merchantGroups[key]) merchantGroups[key] = []
    merchantGroups[key].push(t)
  })
  Object.entries(merchantGroups).forEach(([, group]) => {
    if (group.length >= 3) {
      const avgAmt = group.reduce((s, t) => s + t.amount, 0) / group.length
      const similar = group.filter(t => Math.abs(t.amount - avgAmt) < avgAmt * 0.2)
      if (similar.length >= 3) {
        anomalies.push({
          type: 'daily_repeat',
          severity: 'medium',
          message: `${group[0].merchant} 반복결제 ${group.length}회 (평균 ${Math.round(avgAmt).toLocaleString()}원) — 지출 내용 확인 필요`,
          transactions: group,
        })
      }
    }
  })

  // 3) 편의점 소액 반복 (월 5회 이상)
  const convTxns = thisMonth.filter(t =>
    t.merchant.includes('편의점') || t.merchant.includes('CU') || t.merchant.includes('GS25') ||
    t.merchant.includes('세븐일레븐') || t.merchant.includes('이마트24') || t.category === '편의점'
  )
  if (convTxns.length >= 5) {
    const total = convTxns.reduce((s, t) => s + t.amount, 0)
    anomalies.push({
      type: 'daily_repeat',
      severity: 'medium',
      message: `편의점 결제 ${convTxns.length}회 / ${total.toLocaleString()}원 — 용도 불분명`,
      transactions: convTxns,
    })
  }

  // 4) 10만원 이상 단건 (카테고리 기타)
  const bigUnknown = thisMonth.filter(t => t.amount >= 100000 && t.category === '기타')
  bigUnknown.forEach(t => {
    anomalies.push({
      type: 'unidentified',
      severity: 'high',
      message: `${t.merchant} ${t.amount.toLocaleString()}원 — 분류 미지정 고액 결제`,
      transactions: [t],
    })
  })

  // 5) 주말 결제
  const weekendTxns = thisMonth.filter(t => {
    const d = new Date(t.transaction_date).getDay()
    return d === 0 || d === 6
  })
  if (weekendTxns.length >= 3) {
    anomalies.push({
      type: 'weekend',
      severity: 'low',
      message: `주말 결제 ${weekendTxns.length}건 / ${weekendTxns.reduce((s, t) => s + t.amount, 0).toLocaleString()}원`,
      transactions: weekendTxns,
    })
  }

  // 6) 딱 떨어지는 금액 (만원 단위, 5만원 이상)
  const roundTxns = thisMonth.filter(t => t.amount >= 50000 && t.amount % 10000 === 0 && t.category !== '주유')
  if (roundTxns.length >= 2) {
    anomalies.push({
      type: 'round_amount',
      severity: 'low',
      message: `만원 단위 결제 ${roundTxns.length}건 — 영수증 확인 권장`,
      transactions: roundTxns,
    })
  }

  return anomalies.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.severity] - order[b.severity]
  })
}

// ===== 메인 =====
export default function ExpensesPage() {
  const [tab, setTab] = useState<Tab>('expense')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([])
  const [cardTxns, setCardTxns] = useState<CardTransaction[]>([])
  const [cardMappings, setCardMappings] = useState<CardMapping[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [siteList, setSiteList] = useState<Site[]>([])
  const [vendorList, setVendorList] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [filterCat, setFilterCat] = useState('전체')
  const [showMapping, setShowMapping] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [expR, fixR, cardR, mapR, stfR, sitR, venR] = await Promise.all([
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('fixed_expenses').select('*').order('pay_day'),
      supabase.from('card_transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('card_mappings').select('*'),
      supabase.from('staff').select('id, name, role'),
      supabase.from('sites').select('id, name'),
      supabase.from('vendors').select('id, name, vendor_type, phone, representative, business_number, bank_name, account_number, specialty').order('name'),
    ])
    if (!expR.error) setExpenses(expR.data || [])
    if (!fixR.error) setFixedExpenses(fixR.data || [])
    if (!cardR.error) setCardTxns(cardR.data || [])
    if (!mapR.error) setCardMappings(mapR.data || [])
    if (!stfR.error) setStaffList(stfR.data || [])
    if (!sitR.error) setSiteList(sitR.data || [])
    if (!venR.error) setVendorList(venR.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const currentStaffId = typeof window !== 'undefined' ? localStorage.getItem('dawoo_current_staff_id') : null
  const currentStaffName = staffList.find(s => s.id === currentStaffId)?.name || ''

  const staffName = (id: string | null) => !id ? '-' : staffList.find(s => s.id === id)?.name || '-'
  const siteName = (id: string | null) => !id ? '-' : siteList.find(s => s.id === id)?.name || '-'
  const vendorName = (id: string | null) => !id ? '' : vendorList.find(v => v.id === id)?.name || ''
  const getCardStaff = (cardName: string) => {
    const m = cardMappings.find(cm => cm.card_name === cardName)
    return m?.staff_id ? staffName(m.staff_id) : null
  }

  const monthStats = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7)
    const mExp = expenses.filter(e => e.expense_date?.startsWith(ym))
    const mCard = cardTxns.filter(c => c.transaction_date?.startsWith(ym))
    const fixTotal = fixedExpenses.reduce((s, f) => s + (f.amount || 0), 0)
    return {
      expTotal: mExp.reduce((s, e) => s + (e.amount || 0), 0), expCount: mExp.length,
      fixTotal, fixCount: fixedExpenses.length,
      cardTotal: mCard.reduce((s, c) => s + (c.amount || 0), 0), cardCount: mCard.length,
    }
  }, [expenses, fixedExpenses, cardTxns])

  const anomalies = useMemo(() => detectAnomalies(cardTxns, staffList), [cardTxns, staffList])

  const handleDelete = async (table: string, id: string, label: string) => {
    if (!confirm(`"${label}" 삭제하시겠습니까?`)) return
    await supabase.from(table).delete().eq('id', id)
    loadData()
  }

  const openCreate = () => { setEditItem(null); setShowModal(true) }
  const openEdit = (item: any) => { setEditItem(item); setShowModal(true) }

  const filteredExpenses = filterCat === '전체' ? expenses : expenses.filter(e => e.category === filterCat)
  const filteredCards = filterCat === '전체' ? cardTxns : cardTxns.filter(c => c.category === filterCat)

  if (loading) return <div className="p-6 max-w-[1200px] mx-auto"><div className="text-center py-20 text-txt-tertiary">불러오는 중...</div></div>

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-[18px] md:text-[22px] font-semibold tracking-[-0.4px] text-txt-primary whitespace-nowrap">지출관리</h1>
          <div className="flex bg-surface-secondary rounded-lg p-0.5">
            {[
              { key: 'expense' as Tab, label: '지출결의서' },
              { key: 'fixed' as Tab, label: '고정지출' },
              { key: 'card' as Tab, label: '카드분석' },
            ].map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setFilterCat('전체') }}
                className={`px-4 py-1.5 text-sm rounded-md transition ${tab === t.key ? 'bg-surface shadow-sm font-semibold text-txt-primary' : 'text-txt-secondary'}`}>
                {t.label}
                {t.key === 'card' && anomalies.filter(a => a.severity === 'high').length > 0 && (
                  <span className="ml-1 w-2 h-2 bg-red-500 rounded-full inline-block" />
                )}
              </button>
            ))}
          </div>
        </div>
        {tab !== 'card' && (
          <button onClick={openCreate}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover">
            + {tab === 'expense' ? '결의서 작성' : '고정지출 등록'}
          </button>
        )}
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`rounded-[10px] border p-4 ${tab === 'expense' ? 'bg-blue-50 border-blue-200' : 'bg-surface border-border-primary'}`}>
          <p className="text-xs text-txt-secondary">이번 달 지출결의</p>
          <p className="text-xl font-semibold text-txt-primary tabular-nums">{monthStats.expTotal.toLocaleString()}원</p>
          <p className="text-xs text-txt-tertiary tabular-nums">{monthStats.expCount}건</p>
        </div>
        <div className={`rounded-[10px] border p-4 ${tab === 'fixed' ? 'bg-blue-50 border-blue-200' : 'bg-surface border-border-primary'}`}>
          <p className="text-xs text-txt-secondary">월 고정지출</p>
          <p className="text-xl font-semibold text-txt-primary tabular-nums">{monthStats.fixTotal.toLocaleString()}원</p>
          <p className="text-xs text-txt-tertiary tabular-nums">{monthStats.fixCount}건</p>
        </div>
        <div className={`rounded-[10px] border p-4 ${tab === 'card' ? 'bg-blue-50 border-blue-200' : 'bg-surface border-border-primary'}`}>
          <p className="text-xs text-txt-secondary">이번 달 카드사용</p>
          <p className="text-xl font-semibold text-txt-primary tabular-nums">{monthStats.cardTotal.toLocaleString()}원</p>
          <p className="text-xs text-txt-tertiary tabular-nums">{monthStats.cardCount}건</p>
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
            {filteredExpenses.length === 0 ? <div className="text-center py-12 text-txt-quaternary text-sm">등록된 결의서가 없습니다</div> : (
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-secondary border-b border-border-primary">
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">날짜</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">카테고리</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">내용</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">거래처</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">금액</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">현장</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">상태</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">작성자</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">관리</th>
                </tr></thead>
                <tbody className="divide-y divide-surface-secondary">
                  {filteredExpenses.map(e => {
                    const statusBadge = e.status === '승인'
                      ? 'bg-emerald-100 text-emerald-700'
                      : e.status === '반려'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    return (
                      <tr key={e.id} className="hover:bg-surface-tertiary">
                        <td className="px-4 py-2.5 text-txt-secondary text-[13px]">{e.expense_date}</td>
                        <td className="px-4 py-2.5"><span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium ${CAT_COLOR[e.category] || CAT_COLOR['기타']}`}>{e.category}</span></td>
                        <td className="px-4 py-2.5 text-txt-primary text-[13px]">{e.title}{e.memo && <span className="text-txt-tertiary ml-1 text-[11px]">{e.memo}</span>}</td>
                        <td className="px-4 py-2.5 text-txt-secondary text-[13px]">{vendorName(e.vendor_id ?? null)  || '-'}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-txt-primary text-[13px] tabular-nums">{e.amount.toLocaleString()}원</td>
                        <td className="px-4 py-2.5 text-txt-secondary text-[13px]">{siteName(e.site_id)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium ${statusBadge}`}>{e.status || '대기'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-txt-secondary text-[13px]">{staffName(e.staff_id)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={() => openEdit(e)} className="text-[11px] px-2 py-1 text-txt-tertiary hover:text-accent-text hover:bg-blue-50 rounded">수정</button>
                          <button onClick={() => handleDelete('expenses', e.id, e.title)} className="text-[11px] px-2 py-1 text-txt-quaternary hover:text-red-500 hover:bg-red-50 rounded">삭제</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* === 고정지출 === */}
      {tab === 'fixed' && (
        <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
          {fixedExpenses.length === 0 ? <div className="text-center py-12 text-txt-quaternary text-sm">등록된 고정지출이 없습니다</div> : (
            <div className="divide-y divide-surface-secondary">
              {fixedExpenses.map(f => (
                <div key={f.id} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-tertiary">
                  <div className="w-10 h-10 rounded-lg bg-surface-secondary flex items-center justify-center text-sm font-semibold text-txt-secondary">{f.pay_day}일</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-txt-primary">{f.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium ${CAT_COLOR[f.category] || CAT_COLOR['기타']}`}>{f.category}</span>
                      {f.auto_pay && <span className="text-[10px] text-green-600">자동이체</span>}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-txt-primary tabular-nums">{f.amount.toLocaleString()}원</span>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(f)} className="text-[11px] px-2 py-1 text-txt-tertiary hover:text-accent-text hover:bg-blue-50 rounded">수정</button>
                    <button onClick={() => handleDelete('fixed_expenses', f.id, f.title)} className="text-[11px] px-2 py-1 text-txt-quaternary hover:text-red-500 hover:bg-red-50 rounded">삭제</button>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 bg-surface-secondary flex justify-between text-sm">
                <span className="font-medium text-txt-secondary">월 합계</span>
                <span className="font-semibold text-txt-primary tabular-nums">{fixedExpenses.reduce((s, f) => s + f.amount, 0).toLocaleString()}원</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* === 카드분석 === */}
      {tab === 'card' && (
        <CardAnalysisTab
          cardTxns={cardTxns}
          cardMappings={cardMappings}
          staffList={staffList}
          anomalies={anomalies}
          filteredCards={filteredCards}
          filterCat={filterCat}
          setFilterCat={setFilterCat}
          staffName={staffName}
          getCardStaff={getCardStaff}
          openEdit={openEdit}
          handleDelete={handleDelete}
          showMapping={showMapping}
          setShowMapping={setShowMapping}
          onReload={loadData}
        />
      )}

      {/* 모달 */}
      {showModal && (
        <UnifiedModal tab={tab} item={editItem} staffList={staffList} siteList={siteList} vendorList={vendorList}
          currentStaffId={currentStaffId} currentStaffName={currentStaffName}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSaved={() => { setShowModal(false); setEditItem(null); loadData() }} />
      )}
    </div>
  )
}

// ===== CSV 파서 =====
interface CsvParsedRow {
  transaction_date: string
  card_name: string
  merchant: string
  amount: number
  category: string
}

function parseCsvField(field: string): string {
  let f = field.trim()
  if ((f.startsWith('"') && f.endsWith('"')) || (f.startsWith("'") && f.endsWith("'"))) {
    f = f.slice(1, -1)
  }
  return f.replace(/""/g, '"').trim()
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'; i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current); current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields.map(parseCsvField)
}

function guessCategory(merchant: string): string {
  const m = merchant.toLowerCase()
  if (['주유', 'gs칼텍스', 'sk에너지', 's-oil', '현대오일뱅크'].some(k => m.includes(k))) return '주유'
  if (['편의점', 'cu ', 'gs25', '세븐일레븐', '이마트24', 'ministop'].some(k => m.includes(k))) return '편의점'
  if (['식당', '음식', '밥', '치킨', '피자', '맥도날드', '버거킹', '김밥', '국밥', '카페', '커피', '스타벅스', '배달'].some(k => m.includes(k))) return '식대'
  if (['택시', '버스', '지하철', '철도', 'ktx', '교통', '톨게이트', '하이패스'].some(k => m.includes(k))) return '교통'
  if (['철물', '자재', '건자재', '레미콘', '시멘트', '목재'].some(k => m.includes(k))) return '자재'
  if (['문구', '사무', '다이소', '오피스'].some(k => m.includes(k))) return '사무용품'
  return '기타'
}

function parseCsv(text: string): CsvParsedRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const header = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''))
  // Map common Korean card CSV column names
  const colMap: Record<string, number> = {}
  const dateAliases = ['거래일시', '거래일', '이용일시', '이용일', '승인일시', '승인일', '일시', '날짜', 'date']
  const cardAliases = ['카드번호', '카드명', '카드', 'card']
  const merchantAliases = ['가맹점명', '가맹점', '이용가맹점', '이용처', '사용처', '상호', 'merchant']
  const amountAliases = ['금액', '이용금액', '결제금액', '승인금액', '사용금액', 'amount']
  const categoryAliases = ['카테고리', '업종', '분류', 'category']

  header.forEach((h, i) => {
    if (dateAliases.some(a => h.includes(a))) colMap['date'] = i
    if (cardAliases.some(a => h.includes(a))) colMap['card'] = i
    if (merchantAliases.some(a => h.includes(a))) colMap['merchant'] = i
    if (amountAliases.some(a => h.includes(a))) colMap['amount'] = i
    if (categoryAliases.some(a => h.includes(a))) colMap['category'] = i
  })

  // Must have at least date, merchant, amount
  if (colMap['date'] === undefined || colMap['merchant'] === undefined || colMap['amount'] === undefined) {
    return []
  }

  const rows: CsvParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i])
    if (fields.length < 3) continue

    const rawDate = fields[colMap['date']] || ''
    const rawAmount = fields[colMap['amount']] || '0'
    const merchant = fields[colMap['merchant']] || ''
    const cardName = colMap['card'] !== undefined ? (fields[colMap['card']] || '') : ''
    const category = colMap['category'] !== undefined ? (fields[colMap['category']] || '') : ''

    if (!merchant.trim() || !rawDate.trim()) continue

    // Parse date: handle "2024-01-15", "2024.01.15", "2024/01/15", "20240115"
    let dateStr = rawDate.replace(/[./]/g, '-').replace(/\s.*$/, '') // strip time portion
    if (/^\d{8}$/.test(dateStr)) dateStr = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) continue
    dateStr = dateStr.slice(0, 10)

    // Parse amount: remove commas, 원, spaces; handle negative
    const amt = Math.abs(parseInt(rawAmount.replace(/[,\s원]/g, ''), 10))
    if (isNaN(amt) || amt === 0) continue

    rows.push({
      transaction_date: dateStr,
      card_name: cardName || '카드',
      merchant: merchant.trim(),
      amount: amt,
      category: category.trim() || guessCategory(merchant),
    })
  }
  return rows
}

// ===== 카드분석 탭 =====
function CardAnalysisTab({ cardTxns, cardMappings, staffList, anomalies, filteredCards, filterCat, setFilterCat, staffName, getCardStaff, openEdit, handleDelete, showMapping, setShowMapping, onReload }: any) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const csvFileRef = useRef<HTMLInputElement>(null)
  const [csvPreview, setCsvPreview] = useState<CsvParsedRow[] | null>(null)
  const [csvSaving, setCsvSaving] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)

  // 카드 매핑 관리
  const [newCardName, setNewCardName] = useState('')
  const [newCardLast4, setNewCardLast4] = useState('')
  const [newCardStaff, setNewCardStaff] = useState('')

  const handlePdfUpload = async (file: File) => {
    if (!file.name.endsWith('.pdf')) { alert('PDF 파일만 업로드 가능합니다'); return }
    setUploading(true); setUploadResult(null)
    try {
      const path = `card-statements/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('attachments').upload(path, file)
      if (error) throw error
      // TODO: AI 파싱 → card_transactions 자동 등록
      // 현재는 파일 저장만 하고 수동 등록 안내
      setUploadResult(`"${file.name}" 업로드 완료. AI 분석 후 카드내역이 자동 등록됩니다.`)
    } catch (err) {
      setUploadResult('업로드 실패. 다시 시도해주세요.')
    }
    setUploading(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.toLowerCase().endsWith('.pdf')) handlePdfUpload(file)
    else if (file && file.name.toLowerCase().endsWith('.csv')) handleCsvUpload(file)
  }

  const addMapping = async () => {
    if (!newCardName.trim()) return
    await supabase.from('card_mappings').insert({
      card_name: newCardName.trim(), card_last4: newCardLast4 || null, staff_id: newCardStaff || null,
    })
    setNewCardName(''); setNewCardLast4(''); setNewCardStaff('')
    onReload()
  }

  const deleteMapping = async (id: string) => {
    await supabase.from('card_mappings').delete().eq('id', id)
    onReload()
  }

  const handleCsvUpload = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvError('CSV 파일만 업로드 가능합니다'); return
    }
    setCsvError(null); setCsvPreview(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (!text) { setCsvError('파일을 읽을 수 없습니다'); return }
      const rows = parseCsv(text)
      if (rows.length === 0) {
        setCsvError('파싱된 데이터가 없습니다. CSV 헤더에 거래일시, 가맹점명, 금액 컬럼이 있는지 확인하세요.')
        return
      }
      setCsvPreview(rows)
    }
    reader.onerror = () => setCsvError('파일 읽기 실패')
    reader.readAsText(file, 'UTF-8')
  }

  const handleCsvConfirm = async () => {
    if (!csvPreview || csvPreview.length === 0) return
    setCsvSaving(true)
    try {
      const inserts = csvPreview.map(row => ({
        card_name: row.card_name,
        merchant: row.merchant,
        amount: row.amount,
        category: row.category,
        transaction_date: row.transaction_date,
        memo: null,
        flagged: false,
        flag_reason: null,
        staff_id: null,
      }))
      // Insert in batches of 50
      for (let i = 0; i < inserts.length; i += 50) {
        const batch = inserts.slice(i, i + 50)
        const { error } = await supabase.from('card_transactions').insert(batch)
        if (error) throw error
      }
      setUploadResult(`CSV ${csvPreview.length}건 등록 완료`)
      setCsvPreview(null)
      onReload()
    } catch {
      setCsvError('저장 중 오류가 발생했습니다. 다시 시도해주세요.')
    }
    setCsvSaving(false)
  }

  const handleCsvDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.toLowerCase().endsWith('.csv')) {
      handleCsvUpload(file)
    } else if (file && file.name.toLowerCase().endsWith('.pdf')) {
      handlePdfUpload(file)
    } else if (file) {
      setCsvError('PDF 또는 CSV 파일만 업로드 가능합니다')
    }
  }

  // 월별 카드별 요약
  const ym = new Date().toISOString().slice(0, 7)
  const thisMonth = cardTxns.filter((c: CardTransaction) => c.transaction_date?.startsWith(ym))
  const cardSummary = Object.entries(
    (thisMonth as CardTransaction[]).reduce((acc: Record<string, { total: number; count: number }>, c: CardTransaction) => {
      if (!acc[c.card_name]) acc[c.card_name] = { total: 0, count: 0 }
      acc[c.card_name].total += c.amount; acc[c.card_name].count++
      return acc
    }, {})
  ).sort((a, b) => b[1].total - a[1].total)

  const totalCard = thisMonth.reduce((s: number, c: CardTransaction) => s + c.amount, 0)

  return (
    <div className="space-y-4">
      {/* 파일 업로드 영역 (PDF + CSV) */}
      <div className="grid grid-cols-2 gap-4">
        {/* PDF 업로드 */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`rounded-[10px] border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${
            dragging ? 'border-accent bg-blue-50' : 'border-border-primary hover:border-border-secondary hover:bg-surface-secondary'
          }`}>
          {uploading ? (
            <div className="text-sm text-txt-secondary">업로드 중...</div>
          ) : (
            <>
              <div className="flex justify-center mb-2"><FileText size={24} className="text-txt-tertiary" /></div>
              <div className="text-sm font-medium text-txt-secondary">PDF 업로드</div>
              <div className="text-xs text-txt-tertiary mt-1">카드사 월별 이용내역 PDF</div>
            </>
          )}
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f) }} />
        </div>

        {/* CSV 업로드 */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleCsvDrop}
          onClick={() => csvFileRef.current?.click()}
          className={`rounded-[10px] border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${
            dragging ? 'border-accent bg-blue-50' : 'border-border-primary hover:border-border-secondary hover:bg-surface-secondary'
          }`}>
          <div className="flex justify-center mb-2"><Table size={24} className="text-txt-tertiary" /></div>
          <div className="text-sm font-medium text-txt-secondary">CSV 업로드</div>
          <div className="text-xs text-txt-tertiary mt-1">거래일시, 가맹점명, 금액 컬럼 포함 CSV</div>
          <input ref={csvFileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvUpload(f) }} />
        </div>
      </div>

      {uploadResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700 flex items-center justify-between">
          <span>{uploadResult}</span>
          <button onClick={() => setUploadResult(null)} className="text-green-500 hover:text-green-700"><X size={14} /></button>
        </div>
      )}
      {csvError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 flex items-center justify-between">
          <span>{csvError}</span>
          <button onClick={() => setCsvError(null)} className="text-red-500 hover:text-red-700"><X size={14} /></button>
        </div>
      )}

      {/* CSV 미리보기 */}
      {csvPreview && (
        <div className="bg-surface rounded-[10px] border border-accent overflow-hidden">
          <div className="px-4 py-3 border-b border-border-tertiary flex items-center justify-between bg-blue-50">
            <h3 className="text-[14px] font-semibold text-txt-primary flex items-center gap-1.5">
              <Upload size={16} className="text-txt-tertiary" /> CSV 미리보기 ({csvPreview.length}건)
            </h3>
            <div className="flex gap-2">
              <button onClick={() => setCsvPreview(null)}
                className="px-3 py-1.5 text-xs text-txt-secondary border border-border-primary rounded-lg hover:bg-surface-tertiary">취소</button>
              <button onClick={handleCsvConfirm} disabled={csvSaving}
                className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 font-medium">
                {csvSaving ? '저장 중...' : `${csvPreview.length}건 등록`}
              </button>
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-secondary border-b border-border-primary">
                <th className="px-4 py-2 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">날짜</th>
                <th className="px-4 py-2 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">카드</th>
                <th className="px-4 py-2 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">가맹점</th>
                <th className="px-4 py-2 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">분류</th>
                <th className="px-4 py-2 text-right text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">금액</th>
              </tr></thead>
              <tbody className="divide-y divide-surface-secondary">
                {csvPreview.slice(0, 100).map((row, i) => (
                  <tr key={i} className="hover:bg-surface-tertiary">
                    <td className="px-4 py-2 text-txt-secondary text-[13px]">{row.transaction_date}</td>
                    <td className="px-4 py-2 text-txt-secondary text-[13px]">{row.card_name}</td>
                    <td className="px-4 py-2 text-txt-primary text-[13px]">{row.merchant}</td>
                    <td className="px-4 py-2"><span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium ${CAT_COLOR[row.category] || CAT_COLOR['기타']}`}>{row.category}</span></td>
                    <td className="px-4 py-2 text-right font-medium text-txt-primary text-[13px] tabular-nums">{row.amount.toLocaleString()}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {csvPreview.length > 100 && (
              <div className="text-center py-2 text-xs text-txt-tertiary">외 {csvPreview.length - 100}건 더 있음</div>
            )}
          </div>
          <div className="px-4 py-2 bg-surface-secondary border-t border-border-tertiary flex justify-between text-sm">
            <span className="text-txt-secondary">합계</span>
            <span className="font-semibold text-txt-primary tabular-nums">{csvPreview.reduce((s, r) => s + r.amount, 0).toLocaleString()}원</span>
          </div>
        </div>
      )}

      {/* 카드 매핑 + 이상탐지 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 카드-직원 매핑 */}
        <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
          <div className="px-4 py-3 border-b border-border-tertiary flex items-center justify-between">
            <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary flex items-center gap-1.5"><CreditCard size={16} className="text-txt-tertiary" /> 카드별 담당자</h3>
            <button onClick={() => setShowMapping(!showMapping)} className="text-[11px] text-accent-text hover:text-accent-hover">
              {showMapping ? '닫기' : '관리'}
            </button>
          </div>
          <div className="p-3">
            {cardMappings.length === 0 && !showMapping ? (
              <div className="text-center py-4 text-txt-quaternary text-sm">카드 등록이 없습니다</div>
            ) : (
              <div className="space-y-1.5">
                {cardMappings.map((m: CardMapping) => (
                  <div key={m.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-surface-secondary">
                    <span className="text-sm font-medium text-txt-primary flex-1">{m.card_name}</span>
                    {m.card_last4 && <span className="text-xs text-txt-tertiary">****{m.card_last4}</span>}
                    <span className="text-xs text-accent-text">{staffName(m.staff_id)}</span>
                    {showMapping && (
                      <button onClick={() => deleteMapping(m.id)} className="text-[10px] text-red-400 hover:text-red-600"><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {showMapping && (
              <div className="mt-3 pt-3 border-t border-border-tertiary space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  <input value={newCardName} onChange={e => setNewCardName(e.target.value)} placeholder="카드명"
                    className="text-xs h-[36px] bg-surface border border-border-primary rounded-lg px-2 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none" />
                  <input value={newCardLast4} onChange={e => setNewCardLast4(e.target.value)} placeholder="끝4자리"
                    className="text-xs h-[36px] bg-surface border border-border-primary rounded-lg px-2 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none" />
                  <select value={newCardStaff} onChange={e => setNewCardStaff(e.target.value)}
                    className="text-xs h-[36px] bg-surface border border-border-primary rounded-lg px-2 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none">
                    <option value="">담당자</option>
                    {staffList.map((s: Staff) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button onClick={addMapping} disabled={!newCardName.trim()}
                  className="w-full py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50">추가</button>
              </div>
            )}
          </div>
        </div>

        {/* 이상 탐지 */}
        <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
          <div className="px-4 py-3 border-b border-border-tertiary flex items-center gap-2">
            <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary flex items-center gap-1.5"><AlertTriangle size={16} className="text-txt-tertiary" /> 이상 탐지</h3>
            {anomalies.filter((a: Anomaly) => a.severity === 'high').length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-red-500 text-white rounded-full font-semibold">
                {anomalies.filter((a: Anomaly) => a.severity === 'high').length}
              </span>
            )}
          </div>
          <div className="p-3">
            {anomalies.length === 0 ? (
              <div className="text-center py-4 text-txt-quaternary text-sm">
                {cardTxns.length === 0 ? '카드 내역을 등록하면 자동 분석합니다' : <span className="flex items-center gap-1 justify-center"><CheckCircle size={14} className="text-[#059669]" /> 이상 항목 없음</span>}
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {anomalies.map((a: Anomaly, i: number) => (
                  <div key={i} className={`rounded-lg border px-3 py-2 ${SEVERITY_COLOR[a.severity]}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold flex items-center gap-1"><Circle size={8} className={a.severity === 'high' ? 'fill-red-500 text-red-500' : a.severity === 'medium' ? 'fill-yellow-500 text-yellow-500' : 'fill-blue-500 text-blue-500'} />{SEVERITY_LABEL[a.severity]}</span>
                      <span className="text-[12px] flex-1">{a.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 카드별 사용현황 */}
      {cardSummary.length > 0 && (
        <div className="bg-surface rounded-[10px] border border-border-primary p-4">
          <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-3">이번 달 카드별 사용현황</h3>
          <div className="space-y-2">
            {cardSummary.map(([card, info]: [string, any]) => {
              const pct = totalCard > 0 ? (info.total / totalCard * 100) : 0
              const owner = getCardStaff(card)
              return (
                <div key={card} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <span className="text-sm font-medium text-txt-secondary">{card}</span>
                    {owner && <span className="text-[10px] text-blue-500 ml-1">({owner})</span>}
                  </div>
                  <div className="flex-1 h-2 bg-surface-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-txt-primary w-28 text-right tabular-nums">{info.total.toLocaleString()}원</span>
                  <span className="text-xs text-txt-tertiary w-10 tabular-nums">{info.count}건</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 카테고리 필터 + 내역 */}
      <div className="flex gap-2 flex-wrap">
        {['전체', ...CARD_CATS].map(c => (
          <button key={c} onClick={() => setFilterCat(c)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${filterCat === c ? 'bg-accent text-white border-accent' : 'bg-surface text-txt-secondary border-border-primary'}`}>{c}</button>
        ))}
      </div>

      <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
        {filteredCards.length === 0 ? <div className="text-center py-12 text-txt-quaternary text-sm">카드 내역이 없습니다</div> : (
          <table className="w-full text-sm">
            <thead><tr className="bg-surface-secondary border-b border-border-primary">
              <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">날짜</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">카드 (담당)</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">가맹점</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">분류</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">금액</th>
              <th className="px-4 py-2.5 text-center text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">관리</th>
            </tr></thead>
            <tbody className="divide-y divide-surface-secondary">
              {filteredCards.map((c: CardTransaction) => {
                const owner = getCardStaff(c.card_name)
                return (
                  <tr key={c.id} className={`hover:bg-surface-tertiary ${c.flagged ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-2.5 text-txt-secondary text-[13px]">{c.transaction_date}</td>
                    <td className="px-4 py-2.5 text-[13px]">
                      <span className="font-medium text-txt-secondary">{c.card_name}</span>
                      {owner && <span className="text-[10px] text-blue-500 ml-1">({owner})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-txt-primary text-[13px]">{c.merchant}</td>
                    <td className="px-4 py-2.5"><span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium ${CAT_COLOR[c.category] || CAT_COLOR['기타']}`}>{c.category}</span></td>
                    <td className="px-4 py-2.5 text-right font-medium text-txt-primary text-[13px] tabular-nums">{c.amount.toLocaleString()}원</td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => openEdit(c)} className="text-[11px] px-2 py-1 text-txt-tertiary hover:text-accent-text hover:bg-blue-50 rounded">수정</button>
                      <button onClick={() => handleDelete('card_transactions', c.id, c.merchant)} className="text-[11px] px-2 py-1 text-txt-quaternary hover:text-red-500 hover:bg-red-50 rounded">삭제</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ===== 통합 모달 =====
function UnifiedModal({ tab, item, staffList, siteList, vendorList, currentStaffId, currentStaffName, onClose, onSaved }: {
  tab: Tab; item: any; staffList: Staff[]; siteList: Site[]; vendorList: Vendor[];
  currentStaffId: string | null; currentStaffName: string;
  onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!item
  const [title, setTitle] = useState(item?.title || item?.merchant || '')
  const [amount, setAmount] = useState(item?.amount?.toString() || '')
  const [category, setCategory] = useState(item?.category || '')
  const [memo, setMemo] = useState(item?.memo || '')
  const [expDate, setExpDate] = useState(item?.expense_date || new Date().toISOString().slice(0, 10))
  const [siteId, setSiteId] = useState(item?.site_id || '')
  const [staffId, setStaffId] = useState(item?.staff_id || '')
  const [vendorId, setVendorId] = useState(item?.vendor_id || '')
  const [vendorSearch, setVendorSearch] = useState('')
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)
  const [workDates, setWorkDates] = useState<string[]>([])
  const [newWorkDate, setNewWorkDate] = useState('')
  const [dailyWage, setDailyWage] = useState(item?.daily_wage?.toString() || '')
  const [approver, setApprover] = useState(item?.approver || '관리자')
  const [payDay, setPayDay] = useState(item?.pay_day?.toString() || '1')
  const [autoPay, setAutoPay] = useState(item?.auto_pay ?? false)
  const [saving, setSaving] = useState(false)

  const cats = tab === 'expense' ? EXPENSE_CATS : FIXED_CATS
  if (!category && cats.length) setTimeout(() => setCategory(cats[0]), 0)

  // 분류별 거래처 필터
  const filteredVendors = useMemo(() => {
    if (category === '노무비') return vendorList.filter(v => v.vendor_type === '일용직')
    if (category === '업체지출') return vendorList.filter(v => v.vendor_type === '협력업체')
    return []
  }, [category, vendorList])

  // 결재자 후보 (대표/이사)
  const approverList = useMemo(() => {
    return staffList.filter(s => s.role === '대표' || s.role === '이사')
  }, [staffList])

  const handleSave = async () => {
    if (!title.trim() || !amount) return
    setSaving(true)
    if (tab === 'expense') {
      const basePayload: Record<string, unknown> = {
        category,
        title: title.trim(),
        amount: parseInt(amount),
        expense_date: expDate,
        site_id: siteId || null,
        staff_id: currentStaffId || staffId || null,
        receipt_url: null,
        memo: memo || null,
        project_id: null,
      }
      // New fields (may not exist in DB yet, gracefully handled)
      try {
        const extPayload = {
          ...basePayload,
          vendor_id: vendorId || null,
          approver: approver || '관리자',
          status: '대기',
        }
        if (isEdit) await supabase.from('expenses').update(extPayload).eq('id', item.id)
        else await supabase.from('expenses').insert(extPayload)
      } catch {
        // Fallback: save without new columns if DB doesn't have them
        if (isEdit) await supabase.from('expenses').update(basePayload).eq('id', item.id)
        else await supabase.from('expenses').insert(basePayload)
      }
    } else if (tab === 'fixed') {
      const p = { category, title: title.trim(), amount: parseInt(amount), pay_day: parseInt(payDay) || 1, auto_pay: autoPay, memo: memo || null }
      if (isEdit) await supabase.from('fixed_expenses').update(p).eq('id', item.id)
      else await supabase.from('fixed_expenses').insert(p)
    }
    setSaving(false); onSaved()
  }

  const INPUT_CLS = 'w-full h-[36px] bg-surface border border-border-primary rounded-lg px-3 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none'
  const LABEL_CLS = 'block text-[11px] font-medium text-txt-tertiary mb-1'
  const LABEL_ACCENT_CLS = 'block text-[11px] font-medium text-accent mb-1'

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-[10px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border-tertiary flex items-center justify-between">
          <h3 className="font-semibold text-txt-primary">{isEdit ? '수정' : tab === 'expense' ? '지출 등록' : '고정지출 등록'}</h3>
          <button onClick={onClose} className="text-txt-tertiary hover:text-txt-secondary text-lg">&times;</button>
        </div>
        <div className="p-5 space-y-4">

          {/* === 지출결의서 폼 === */}
          {tab === 'expense' && (
            <>
              {/* 1행: 분류 */}
              <div>
                <label className={LABEL_CLS}>분류 *</label>
                <div className="flex gap-2">
                  {EXPENSE_CATS.map(c => (
                    <button key={c} type="button" onClick={() => { setCategory(c); setVendorId('') }}
                      className={`flex-1 h-[36px] rounded-lg text-[13px] font-medium transition-all ${
                        category === c
                          ? `${CAT_COLOR[c] || 'bg-accent text-white'} shadow-sm`
                          : 'bg-surface-secondary text-txt-secondary border border-border-primary hover:border-accent'
                      }`}>{c}</button>
                  ))}
                </div>
              </div>

              {/* 2행: 작성자 + 결재자 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_ACCENT_CLS}>작성자</label>
                  <input value={currentStaffName || '미지정'} readOnly
                    className={`${INPUT_CLS} bg-surface-secondary text-txt-secondary cursor-default`} />
                </div>
                <div>
                  <label className={LABEL_ACCENT_CLS}>결재자</label>
                  <select value={approver} onChange={e => setApprover(e.target.value)} className={INPUT_CLS}>
                    <option value="관리자">관리자</option>
                    {approverList.map(s => <option key={s.id} value={s.name}>{s.name} ({s.role})</option>)}
                  </select>
                </div>
              </div>

              {/* (분류는 상단 버튼으로 이동, 날짜는 현장 옆으로 이동) */}

              {/* 거래처 검색 (분류에 따라 노출) */}
              {category !== '기타경비' && (
                <div className="relative">
                  <label className={LABEL_CLS}>
                    {category === '노무비' ? '노무자 *' : '거래처 *'}
                  </label>
                  <input
                    type="text"
                    value={vendorSearch}
                    onChange={e => { setVendorSearch(e.target.value); setShowVendorDropdown(true); if (!e.target.value) setVendorId('') }}
                    onFocus={() => setShowVendorDropdown(true)}
                    placeholder={category === '노무비' ? '이름 검색...' : '업체명 검색...'}
                    className={INPUT_CLS}
                  />
                  {showVendorDropdown && vendorSearch && (() => {
                    const results = filteredVendors.filter(v =>
                      v.name.includes(vendorSearch) || (v.phone && v.phone.includes(vendorSearch))
                    ).slice(0, 8)
                    if (results.length === 0) return (
                      <div className="absolute z-10 w-full mt-1 bg-surface border border-border-primary rounded-lg shadow-lg p-3 text-[12px] text-txt-quaternary">
                        검색 결과 없음
                      </div>
                    )
                    return (
                      <div className="absolute z-10 w-full mt-1 bg-surface border border-border-primary rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                        {results.map(v => (
                          <button key={v.id} type="button"
                            onClick={() => { setVendorId(v.id); setVendorSearch(v.name); setShowVendorDropdown(false) }}
                            className="w-full text-left px-3 py-2 hover:bg-surface-secondary transition text-[12px] border-b border-border-tertiary last:border-0">
                            <div className="font-medium text-txt-primary">{v.name}</div>
                            <div className="text-txt-quaternary text-[11px]">{v.phone || ''} {v.specialty || ''}</div>
                          </button>
                        ))}
                      </div>
                    )
                  })()}

                  {/* 거래처 상세 정보 */}
                  {vendorId && (() => {
                    const v = filteredVendors.find(x => x.id === vendorId)
                    if (!v) return null
                    return (
                      <div className="mt-2 p-3 bg-surface-secondary rounded-lg text-[12px] space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-txt-primary">{v.name}</span>
                          <button type="button" onClick={() => { setVendorId(''); setVendorSearch('') }}
                            className="text-[10px] text-txt-quaternary hover:text-red-500">변경</button>
                        </div>
                        {v.business_number && <div className="text-txt-secondary">사업자: {v.business_number}</div>}
                        <div className="grid grid-cols-2 gap-1">
                          {v.representative && <div className="text-txt-secondary">담당: {v.representative}</div>}
                          {v.phone && <div className="text-txt-secondary">연락처: {v.phone}</div>}
                        </div>
                        {(v.bank_name || v.account_number) && (
                          <div className="pt-1.5 border-t border-border-tertiary text-txt-tertiary">
                            {v.bank_name && <span>{v.bank_name} </span>}
                            {v.account_number && <span>{v.account_number}</span>}
                            {v.representative && <span className="ml-1 text-txt-quaternary">({v.representative})</span>}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* 노무비: 근무일 선택 + 일당 = 금액 */}
              {category === '노무비' && (
                <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200/50">
                  <label className="block text-[11px] font-medium text-blue-700 mb-2">근무 계산</label>

                  {/* 근무일 태그 */}
                  <div className="mb-2">
                    <label className="block text-[10px] text-txt-tertiary mb-1">근무일 (날짜 추가)</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {workDates.sort().map(d => (
                        <span key={d} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-[11px] font-medium">
                          {d.slice(5).replace('-', '/')}
                          <button type="button" onClick={() => {
                            const next = workDates.filter(x => x !== d)
                            setWorkDates(next)
                            if (dailyWage) setAmount(String(next.length * parseInt(dailyWage)))
                          }} className="text-blue-400 hover:text-red-500 ml-0.5">×</button>
                        </span>
                      ))}
                      {workDates.length === 0 && <span className="text-[11px] text-txt-quaternary">날짜를 추가하세요</span>}
                    </div>
                    <div className="flex gap-2">
                      <input type="date" value={newWorkDate} onChange={e => setNewWorkDate(e.target.value)}
                        className={`${INPUT_CLS} flex-1`} />
                      <button type="button" onClick={() => {
                        if (newWorkDate && !workDates.includes(newWorkDate)) {
                          const next = [...workDates, newWorkDate]
                          setWorkDates(next)
                          setNewWorkDate('')
                          if (dailyWage) setAmount(String(next.length * parseInt(dailyWage)))
                        }
                      }} className="px-3 h-[36px] bg-blue-600 text-white text-[12px] font-medium rounded-lg hover:bg-blue-700 shrink-0">
                        추가
                      </button>
                    </div>
                  </div>

                  {/* 일당 + 합계 */}
                  <div className="grid grid-cols-2 gap-2 items-end pt-2 border-t border-blue-200/50">
                    <div>
                      <label className="block text-[10px] text-txt-tertiary mb-0.5">일당 (원)</label>
                      <input type="text" value={dailyWage ? formatMoney(dailyWage) : ''} onChange={e => {
                        const raw = parseMoney(e.target.value).toString()
                        setDailyWage(raw)
                        if (workDates.length && raw) setAmount(String(workDates.length * parseInt(raw)))
                      }} placeholder="0" className={`${INPUT_CLS} text-right`} />
                    </div>
                    <div className="text-right">
                      <label className="block text-[10px] text-txt-tertiary mb-0.5">합계</label>
                      <div className="h-[36px] flex items-center justify-end text-[16px] font-bold text-blue-700 tabular-nums">
                        {workDates.length && dailyWage ? (workDates.length * parseInt(dailyWage)).toLocaleString() : '0'}원
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-blue-500 mt-1">
                    {workDates.length}일 x {dailyWage ? parseInt(dailyWage).toLocaleString() : '0'}원 = {workDates.length && dailyWage ? (workDates.length * parseInt(dailyWage)).toLocaleString() : '0'}원
                  </div>
                </div>
              )}

              {/* 현장 + 날짜 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>현장 (선택)</label>
                  <select value={siteId} onChange={e => setSiteId(e.target.value)} className={INPUT_CLS}>
                    <option value="">현장 선택</option>
                    {siteList.map((s: Site) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>작성일 *</label>
                  <input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} className={INPUT_CLS} />
                </div>
              </div>

              {/* 지출 내용 */}
              <div>
                <label className={LABEL_CLS}>지출 내용 *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 배관자재 납품" className={INPUT_CLS} />
              </div>

              {/* 합계 금액 */}
              <div>
                <label className={LABEL_CLS}>합계 금액 (부가세 포함) *</label>
                <input type="text" inputMode="numeric"
                  value={amount ? formatMoney(amount) : ''} onChange={e => setAmount(String(parseMoney(e.target.value)))}
                  placeholder="0"
                  className={`${INPUT_CLS} text-right tabular-nums`} />
              </div>

              {/* 첨부서류 */}
              <div>
                <label className={LABEL_CLS}>첨부서류 (세금계산서, 거래명세서 등)</label>
                <div className="border-2 border-dashed border-border-primary rounded-lg p-6 text-center cursor-pointer hover:border-accent transition">
                  <Upload size={20} className="mx-auto mb-2 text-txt-quaternary" />
                  <p className="text-[12px] text-txt-tertiary">파일을 드래그하거나 클릭하여 첨부</p>
                  <p className="text-[10px] text-txt-quaternary mt-1">최대 10MB / 5개</p>
                </div>
              </div>

              {/* 비고 */}
              <div>
                <label className={LABEL_CLS}>비고</label>
                <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} placeholder="메모"
                  className="w-full bg-surface border border-border-primary rounded-lg px-3 py-2 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none resize-none" />
              </div>
            </>
          )}

          {/* === 고정지출 폼 (기존 유지) === */}
          {tab === 'fixed' && (
            <>
              <div>
                <label className={LABEL_CLS}>카테고리</label>
                <div className="flex gap-1.5 flex-wrap">
                  {FIXED_CATS.map(c => (
                    <button key={c} type="button" onClick={() => setCategory(c)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${category === c ? 'bg-accent text-white border-accent' : 'bg-surface text-txt-secondary border-border-primary'}`}>{c}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>내용 *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="지출 내용" className={INPUT_CLS} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>금액 *</label>
                  <input type="text" inputMode="numeric" value={amount ? formatMoney(amount) : ''} onChange={e => setAmount(String(parseMoney(e.target.value)))} placeholder="0"
                    className={`${INPUT_CLS} text-right tabular-nums`} />
                </div>
                <div>
                  <label className={LABEL_CLS}>매월 납부일</label>
                  <input type="number" value={payDay} onChange={e => setPayDay(e.target.value)} min="1" max="31" className={INPUT_CLS} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={autoPay} onChange={e => setAutoPay(e.target.checked)} className="w-4 h-4 rounded border-border-secondary text-accent" />
                <span className="text-sm text-txt-secondary">자동이체</span>
              </label>
              <div>
                <label className={LABEL_CLS}>메모</label>
                <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} placeholder="메모"
                  className="w-full bg-surface border border-border-primary rounded-lg px-3 py-2 text-[13px] focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none resize-none" />
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border-tertiary flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-txt-secondary border border-border-primary rounded-lg hover:bg-surface-tertiary">취소</button>
          <button onClick={handleSave} disabled={saving || !title.trim() || !amount}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 font-medium">
            {saving ? '저장 중...' : isEdit ? '수정' : tab === 'expense' ? '승인 요청' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
