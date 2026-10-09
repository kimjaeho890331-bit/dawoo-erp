'use client'

// 카드분석 — 지출관리 탭에 있던 것을 경리로 옮겼다 (2026-10-08 대표: 「경리와 하나로」).
// 카드 내역 업로드(PDF·CSV), 카드별 담당, 이상 탐지, 카드 내역 목록을 한 화면에서 본다.

import { useState, useEffect, useCallback, useMemo, useRef, DragEvent } from 'react'
import { toast } from '@/lib/toast'
import { CreditCard, AlertTriangle, X, FileText, CheckCircle, Circle, Upload, Table } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchAllPagesResult } from '@/lib/fetchAllPages'
import { inMonth, monthLabel, monthOptions } from '@/lib/monthFilter'
import { todayKST } from '@/lib/utils/date'
import { cardDateRange, splitNewCardRows, type CardRowKeyFields } from '@/lib/cardImport'

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

interface Staff { id: string; name: string; resign_date?: string | null }

interface Anomaly {
  type: 'daily_repeat' | 'over_limit' | 'unidentified' | 'weekend' | 'late_night' | 'round_amount'
  severity: 'high' | 'medium' | 'low'
  message: string
  transactions: CardTransaction[]
}

const CARD_CATS = ['식대', '주유', '자재', '사무용품', '접대', '교통', '편의점', '기타'] as const

// 종류(상태가 아님)는 회색 한 가지로 — 색은 진행 상태에만 쓴다 (대표 원칙)
const CAT_COLOR: Record<string, string> = {
  '식대': 'bg-surface-secondary text-txt-secondary', '주유': 'bg-surface-secondary text-txt-secondary', '자재': 'bg-surface-secondary text-txt-secondary',
  '사무용품': 'bg-surface-secondary text-txt-secondary', '접대': 'bg-surface-secondary text-txt-secondary', '교통': 'bg-surface-secondary text-txt-secondary',
  '편의점': 'bg-surface-secondary text-txt-secondary', '기타': 'bg-surface-secondary text-txt-secondary',
}

const SEVERITY_COLOR = { high: 'bg-red-50 border-red-200 text-red-700', medium: 'bg-yellow-50 border-yellow-200 text-yellow-700', low: 'bg-accent-light border-accent/30 text-accent-text' }
const SEVERITY_LABEL = { high: '주의', medium: '확인', low: '참고' }

// ===== 이상 탐지 엔진 =====
// 화면에서 고른 한 달 치만 받는다(기준이 월 단위). 예전에는 늘 이번 달만 따로 골라 봤다.
// monthText는 문구용('이번 달' / '2026년 9월').
function detectAnomalies(thisMonth: CardTransaction[], staffList: Staff[], monthText: string): Anomaly[] {
  const anomalies: Anomaly[] = []

  // 1) 식대 1인 15,000원 초과 (월 기준)
  const mealTxns = thisMonth.filter(t => t.category === '식대')
  // 1인당은 재직 직원 수로 나눈다. 예전에는 카드내역의 staff_id 개수로 나눴는데,
  // CSV로 올린 내역은 staff_id가 늘 비어 있어 인원이 1명으로 잡히고 한 달 식대 전체가
  // 한 사람 몫으로 계산돼 거의 매달 경고가 떴다.
  const staffCount = Math.max(staffList.filter(s => !s.resign_date).length, 1)
  const mealTotal = mealTxns.reduce((s, t) => s + t.amount, 0)
  const workDays = 22
  const mealPerPerson = mealTotal / staffCount
  if (mealPerPerson > 15000 * workDays) {
    anomalies.push({
      type: 'over_limit',
      severity: 'high',
      message: `${monthText} 식대 1인당 ${Math.round(mealPerPerson / workDays).toLocaleString()}원/일 (기준: 15,000원)`,
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


// ===== 경리 화면에 붙는 본체 — 자기 데이터는 자기가 읽는다 =====
export default function CardAnalysis() {
  const [cardTxns, setCardTxns] = useState<CardTransaction[]>([])
  const [cardMappings, setCardMappings] = useState<CardMapping[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [filterCat, setFilterCat] = useState('전체')
  const [showMapping, setShowMapping] = useState(false)
  const [loading, setLoading] = useState(true)
  // 예전에는 요약·이상 탐지는 이번 달, 아래 목록은 모든 달이라 합계와 목록이 맞지 않았다.
  // 월 하나로 셋을 같이 움직인다. 기본은 이번 달(한국 시각).
  const [thisYm] = useState(() => todayKST().slice(0, 7))
  const [month, setMonth] = useState(thisYm)

  const loadData = useCallback(async () => {
    const [cardR, mapR, stfR] = await Promise.all([
      // 카드 내역은 달마다 수백 건씩 쌓인다 — 1000건에서 잘리지 않게 끝까지 읽는다
      fetchAllPagesResult<CardTransaction>((from, to) =>
        supabase.from('card_transactions').select('*').order('transaction_date', { ascending: false }).order('id').range(from, to)),
      supabase.from('card_mappings').select('*').order('card_last4'),
      supabase.from('staff').select('id, name, resign_date').order('name'),
    ])
    if (!cardR.error) setCardTxns(cardR.data || [])
    if (!mapR.error) setCardMappings(mapR.data || [])
    if (!stfR.error) setStaffList(stfR.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const staffName = (id: string | null) => !id ? '-' : staffList.find(s => s.id === id)?.name || '-'
  const getCardStaff = (cardName: string) => {
    const m = cardMappings.find(cm => cm.card_name === cardName)
    return m?.staff_id ? staffName(m.staff_id) : null
  }
  // 자료가 있는 달 + 이번 달·지금 고른 달(비어 있어도 목록에서 사라지지 않게)
  const months = useMemo(
    () => monthOptions(cardTxns.map(c => c.transaction_date), [thisYm, month]),
    [cardTxns, thisYm, month],
  )
  const monthText = month === thisYm ? '이번 달' : monthLabel(month)
  const monthTxns = useMemo(() => cardTxns.filter(c => inMonth(c.transaction_date, month)), [cardTxns, month])
  const anomalies = useMemo(() => detectAnomalies(monthTxns, staffList, monthText), [monthTxns, staffList, monthText])
  const filteredCards = filterCat === '전체' ? monthTxns : monthTxns.filter(c => c.category === filterCat)

  const handleDelete = async (table: string, id: string, label: string) => {
    if (!confirm(`"${label}" 삭제하시겠습니까?`)) return
    await supabase.from(table).delete().eq('id', id)
    loadData()
  }

  if (loading) return <div className="py-12 text-center text-[13px] text-txt-quaternary">불러오는 중...</div>

  return (
    <CardAnalysisTab
      cardTxns={cardTxns}
      monthTxns={monthTxns}
      month={month}
      setMonth={setMonth}
      months={months}
      thisYm={thisYm}
      monthText={monthText}
      cardMappings={cardMappings}
      staffList={staffList}
      anomalies={anomalies}
      filteredCards={filteredCards}
      filterCat={filterCat}
      setFilterCat={setFilterCat}
      staffName={staffName}
      getCardStaff={getCardStaff}
      handleDelete={handleDelete}
      showMapping={showMapping}
      setShowMapping={setShowMapping}
      onReload={loadData}
    />
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
function CardAnalysisTab({ cardTxns, monthTxns, month, setMonth, months, thisYm, monthText, cardMappings, staffList, anomalies, filteredCards, filterCat, setFilterCat, staffName, getCardStaff, handleDelete, showMapping, setShowMapping, onReload }: any) {
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
    if (!file.name.endsWith('.pdf')) { toast.info('PDF 파일만 업로드 가능합니다'); return }
    setUploading(true); setUploadResult(null)
    try {
      // 업로드는 /api/storage/upload(service_role)로만 한다 — 프론트 anon 키에는
      // Storage 쓰기 권한이 없다. 라우트가 경로 정규화(한글 파일명)와 형식 검증도 맡는다.
      const fd = new FormData()
      fd.append('file', file)
      fd.append('storagePath', `card-statements/${Date.now()}_${file.name}`)

      const res = await fetch('/api/storage/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      // PDF를 읽어 카드내역으로 등록하는 기능은 아직 없다 — 파일만 보관한다.
      // 예전 안내("AI 분석 후 자동 등록됩니다")는 사실이 아니어서, 기다려도 내역이 생기지 않았다.
      setUploadResult(`"${file.name}" 보관 완료. PDF는 내역으로 등록되지 않습니다 — 카드내역은 카드사 CSV로 올려 주세요.`)
    } catch (err) {
      // 실패 이유를 삼키면 이번처럼 원인을 못 찾는다 — 서버가 준 메시지를 그대로 보여준다
      setUploadResult(`업로드 실패: ${err instanceof Error ? err.message : '다시 시도해 주세요'}`)
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
    if (!confirm('이 카드의 담당자 연결을 지울까요?')) return
    const { error } = await supabase.from('card_mappings').delete().eq('id', id)
    if (error) { toast.error(`지우지 못했습니다: ${error.message}`); return }
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
      // 같은 CSV를 두 번 올리면 내역이 두 배로 쌓였다. 파일 기간의 기존 내역을 읽어
      // 카드·날짜·금액·가맹점이 같은 것은 빼고 넣는다 (src/lib/cardImport.ts).
      const range = cardDateRange(csvPreview)
      const existing: CardRowKeyFields[] = []
      if (range) {
        // 한 번에 1000건까지만 오므로 나눠 읽는다. 끝은 '다음 날 전'으로 — 날짜 칸이 시각을 가져도 끝날이 빠지지 않게.
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('card_transactions')
            .select('card_name, transaction_date, amount, merchant')
            .gte('transaction_date', range.from)
            .lt('transaction_date', range.before)
            .order('id')
            .range(from, from + 999)
          if (error) throw error
          existing.push(...((data || []) as CardRowKeyFields[]))
          if (!data || data.length < 1000) break
        }
      }
      const { fresh, skipped } = splitNewCardRows(csvPreview, existing)

      const inserts = fresh.map(row => ({
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
      setUploadResult(skipped.length > 0
        ? `${fresh.length}건 등록, ${skipped.length}건은 이미 있어 건너뜀`
        : `CSV ${fresh.length}건 등록 완료`)
      setCsvPreview(null)
      // 지난달 CSV를 올리면 이번 달 화면에는 안 보여 안 올라간 줄 안다 — 새로 넣은 달로 옮겨 보여 준다
      if (fresh.length > 0 && !fresh.some(r => inMonth(r.transaction_date, month))) {
        setMonth(monthOptions(fresh.map(r => r.transaction_date))[0])
      }
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

  // 고른 달의 카드별 요약
  const thisMonth = monthTxns as CardTransaction[]
  const cardSummary = Object.entries(
    thisMonth.reduce((acc: Record<string, { total: number; count: number }>, c: CardTransaction) => {
      if (!acc[c.card_name]) acc[c.card_name] = { total: 0, count: 0 }
      acc[c.card_name].total += c.amount; acc[c.card_name].count++
      return acc
    }, {})
  ).sort((a, b) => b[1].total - a[1].total)

  const totalCard = thisMonth.reduce((s: number, c: CardTransaction) => s + c.amount, 0)

  return (
    <div className="space-y-4">
      {/* 파일 업로드 영역 (PDF + CSV) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* PDF 업로드 */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`rounded-[10px] border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${
            dragging ? 'border-accent bg-accent-light' : 'border-border-primary hover:border-border-secondary hover:bg-surface-secondary'
          }`}>
          {uploading ? (
            <div className="text-sm text-txt-secondary">업로드 중...</div>
          ) : (
            <>
              <div className="flex justify-center mb-2"><FileText size={24} className="text-txt-tertiary" /></div>
              <div className="text-sm font-medium text-txt-secondary">PDF 업로드</div>
              <div className="text-xs text-txt-tertiary mt-1">보관만 됩니다 · 내역 등록은 CSV로</div>
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
            dragging ? 'border-accent bg-accent-light' : 'border-border-primary hover:border-border-secondary hover:bg-surface-secondary'
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
          <div className="px-4 py-3 border-b border-border-tertiary flex items-center justify-between bg-accent-light">
            <h3 className="text-[14px] font-semibold text-txt-primary flex items-center gap-1.5">
              <Upload size={16} className="text-txt-tertiary" /> CSV 미리보기 ({csvPreview.length}건)
            </h3>
            <div className="flex gap-2">
              <button onClick={() => setCsvPreview(null)}
                className="btn-secondary text-xs">취소</button>
              <button onClick={handleCsvConfirm} disabled={csvSaving}
                className="btn-primary text-xs disabled:opacity-50">
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

      {/* 월 선택 — 사용현황·이상 탐지·내역 목록이 모두 이 달을 따른다 */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={e => setMonth(e.target.value)} aria-label="월 선택" className="input-field shrink-0">
          {(months as string[]).map(m => (
            <option key={m} value={m}>{monthLabel(m)}{m === thisYm ? ' (이번 달)' : ''}</option>
          ))}
        </select>
        <span className="text-[12px] text-txt-tertiary">사용현황 · 이상 탐지 · 내역이 모두 이 달 기준입니다</span>
      </div>

      {/* 카드 매핑 + 이상탐지 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    className="input-field text-xs" />
                  <input value={newCardLast4} onChange={e => setNewCardLast4(e.target.value)} placeholder="끝4자리"
                    className="input-field text-xs" />
                  <select value={newCardStaff} onChange={e => setNewCardStaff(e.target.value)}
                    className="input-field text-xs">
                    <option value="">담당자</option>
                    {staffList.map((s: Staff) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button onClick={addMapping} disabled={!newCardName.trim()}
                  className="btn-primary w-full text-xs disabled:opacity-50">추가</button>
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
                {cardTxns.length === 0 ? '카드 내역을 등록하면 자동 분석합니다'
                  : monthTxns.length === 0 ? `${monthText} 카드 내역이 없습니다`
                  : <span className="flex items-center gap-1 justify-center"><CheckCircle size={14} className="text-[#059669]" /> 이상 항목 없음</span>}
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {anomalies.map((a: Anomaly, i: number) => (
                  <div key={i} className={`rounded-lg border px-3 py-2 ${SEVERITY_COLOR[a.severity]}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold flex items-center gap-1"><Circle size={8} className={a.severity === 'high' ? 'fill-red-500 text-red-500' : a.severity === 'medium' ? 'fill-yellow-500 text-yellow-500' : 'fill-blue-500 text-accent-text'} />{SEVERITY_LABEL[a.severity]}</span>
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
          <h3 className="text-[14px] font-semibold tracking-[-0.1px] text-txt-primary mb-3">{monthText} 카드별 사용현황</h3>
          <div className="space-y-2">
            {cardSummary.map(([card, info]: [string, any]) => {
              const pct = totalCard > 0 ? (info.total / totalCard * 100) : 0
              const owner = getCardStaff(card)
              return (
                <div key={card} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <span className="text-sm font-medium text-txt-secondary">{card}</span>
                    {owner && <span className="text-[10px] text-accent-text ml-1">({owner})</span>}
                  </div>
                  <div className="flex-1 h-2 bg-surface-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
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
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${filterCat === c ? 'bg-accent-light text-accent-text border-accent' : 'bg-surface text-txt-secondary border-border-primary'}`}>{c}</button>
        ))}
      </div>

      <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
        {filteredCards.length === 0 ? <div className="text-center py-12 text-txt-quaternary text-sm">{monthText} {filterCat !== '전체' ? `${filterCat} ` : ''}카드 내역이 없습니다</div> : (
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
                      {owner && <span className="text-[10px] text-accent-text ml-1">({owner})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-txt-primary text-[13px]">{c.merchant}</td>
                    <td className="px-4 py-2.5"><span className={`text-[11px] px-[10px] py-[2px] rounded-full font-medium ${CAT_COLOR[c.category] || CAT_COLOR['기타']}`}>{c.category}</span></td>
                    <td className="px-4 py-2.5 text-right font-medium text-txt-primary text-[13px] tabular-nums">{c.amount.toLocaleString()}원</td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => handleDelete('card_transactions', c.id, c.merchant)} className="btn-inline-danger">삭제</button>
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
