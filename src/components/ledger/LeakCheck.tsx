'use client'

// 경리 > 새는 돈 찾기 — 대표: "회사에서 빠져나가는 1원까지 알고 싶다", "새는 돈·쓸데없는 지출을 막는 1차 정리".
// 통장 출금(bank_transactions) + 법인카드(card_transactions)에서 매달 나가는 돈을 찾아(src/lib/ledger/leaks.ts)
// 항목마다 필요/해지/줄이기/해지함을 고르게 한다(spend_reviews). 「필요」로 남은 것이 회사의 고정지출 목록이다.

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowUpRight, Banknote, CalendarClock, Copy, CreditCard, Database, ListChecks, PauseCircle, Receipt, Repeat,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { fetchAllPagesResult } from '@/lib/fetchAllPages'
import { isMissingTableOrColumn } from '@/lib/staff/ghost'
import { todayKST } from '@/lib/utils/date'
import { monthLabel } from '@/lib/monthFilter'
import type { SpendDecision, SpendReview } from '@/types'
import {
  detectLeaks,
  periodStart,
  summarizeReviews,
  type BankOutInput,
  type CardInput,
  type RecurringItem,
} from '@/lib/ledger/leaks'
import BankUpload from '@/components/ledger/BankUpload'
import {
  DECISION_LABEL, EmptyLine, RecurringHeader, RecurringRow, Section, SourceBadge, shortDate, useShowMore, won,
  type ReviewState,
} from '@/components/ledger/LeakSections'

const STAFF_KEY = 'dawoo_current_staff_id'

/** 기간(개월). 0 = 전체. 1년이 기본 — 연 1회·분기 결제까지 보이고, 대표가 「1년에 얼마」로 판단한다 */
const PERIODS = [3, 6, 12, 24, 0] as const
type Period = (typeof PERIODS)[number]
const PERIOD_LABEL: Record<Period, string> = { 3: '최근 3개월', 6: '최근 6개월', 12: '최근 1년', 24: '최근 2년', 0: '전체' }

type Filter = 'all' | SpendDecision
const FILTERS: Filter[] = ['all', 'unknown', 'keep', 'cancel', 'reduce', 'cancelled']

interface BankOutRow extends BankOutInput { account: string }

type Loaded =
  | { key: string; status: 'ok'; bank: BankOutRow[]; card: CardInput[]; reviews: SpendReview[]; from: string | null; to: string }
  | { key: string; status: 'dbMissing' }
  | { key: string; status: 'error'; message: string }

function errText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

/** 기간 안의 통장 출금·카드·검토 결과를 끝까지 읽는다(1000줄에서 잘리지 않게) */
async function loadLeakData(period: Period, key: string): Promise<Loaded> {
  const to = todayKST()
  const from = period > 0 ? periodStart(to, period) : null
  const [bankR, cardR, revR] = await Promise.all([
    fetchAllPagesResult<BankOutRow>((f, t) => {
      let q = supabase.from('bank_transactions')
        .select('id, account, tx_at, amount, counterparty, description')
        .eq('direction', 'out')
      // 은행 파일 시각은 한국 시각으로 넣었다 — 기간 첫날 0시도 한국 시각으로 자른다
      if (from) q = q.gte('tx_at', `${from}T00:00:00+09:00`)
      return q.order('tx_at').order('id').range(f, t)
    }),
    fetchAllPagesResult<CardInput>((f, t) => {
      let q = supabase.from('card_transactions').select('id, card_name, merchant, amount, transaction_date')
      if (from) q = q.gte('transaction_date', from)
      return q.order('transaction_date').order('id').range(f, t)
    }),
    fetchAllPagesResult<SpendReview>((f, t) =>
      supabase.from('spend_reviews').select('*').order('updated_at').order('id').range(f, t)),
  ])
  // 새 표(sql/leak_check.sql)를 아직 안 만들었으면 화면을 깨지 말고 안내한다
  const missing = (e: unknown) => isMissingTableOrColumn(e as { code?: string; message?: string } | null)
  if (missing(bankR.error) || missing(revR.error)) return { key, status: 'dbMissing' }
  const firstError = bankR.error ?? cardR.error ?? revR.error
  if (firstError) return { key, status: 'error', message: errText(firstError) }
  return { key, status: 'ok', bank: bankR.data ?? [], card: cardR.data ?? [], reviews: revR.data ?? [], from, to }
}

export default function LeakCheck({ onGoCard }: { onGoCard: () => void }) {
  const [period, setPeriod] = useState<Period>(12)
  const [reloadTick, setReloadTick] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // 결정·메모는 저장 즉시 화면에 반영한다(다시 읽지 않는다) — 저장 실패면 되돌린다
  const [reviews, setReviews] = useState<SpendReview[]>([])
  const [view, setView] = useState<'review' | 'fixed'>('review')
  const [filter, setFilter] = useState<Filter>('all')
  const [forceDbMissing, setForceDbMissing] = useState(false)

  const loadKey = `${period}:${reloadTick}`

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await loadLeakData(period, loadKey)
      if (cancelled) return
      setLoaded(res)
      if (res.status === 'ok') setReviews(res.reviews)
    })()
    return () => { cancelled = true }
  }, [period, loadKey])

  const reload = () => setReloadTick(t => t + 1)
  const stale = loaded !== null && loaded.key !== loadKey

  const report = useMemo(() => {
    if (loaded?.status !== 'ok') return null
    return detectLeaks(loaded.bank, loaded.card, { from: loaded.from, to: loaded.to })
  }, [loaded])
  const summary = useMemo(() => (report ? summarizeReviews(report, reviews) : null), [report, reviews])
  const reviewMap = useMemo(() => new Map(reviews.map(r => [r.item_key, r])), [reviews])
  const stateOf = (key: string): ReviewState => {
    const r = reviewMap.get(key)
    return { decision: r?.decision ?? 'unknown', note: r?.note ?? null }
  }

  /** 결정·메모 저장(item_key로 덮어쓰기). 보낸 칸만 바뀐다 — 메모만 고치면 결정은 그대로 */
  const saveReview = async (
    item: { key: string; label: string; monthlyAvg: number },
    patch: { decision?: SpendDecision; note?: string | null },
  ) => {
    const now = new Date().toISOString()
    let staffId: string | null = null
    try { staffId = localStorage.getItem(STAFF_KEY) } catch { /* 저장소를 못 쓰는 브라우저 — 누가 정했는지만 비운다 */ }
    const payload: Record<string, unknown> = {
      item_key: item.key,
      label: item.label,
      // 결정할 때의 월 금액을 남긴다 — 나중에 기간을 바꿔 이 항목이 안 보여도 고정지출 목록 금액이 남는다
      monthly_amount: item.monthlyAvg,
      updated_at: now,
    }
    if (patch.decision !== undefined) {
      payload.decision = patch.decision
      payload.decided_by = patch.decision === 'unknown' ? null : staffId
      payload.decided_at = patch.decision === 'unknown' ? null : now
    }
    if (patch.note !== undefined) payload.note = patch.note

    const before = reviews
    const existing = reviewMap.get(item.key)
    const optimistic: SpendReview = {
      id: existing?.id ?? `tmp-${item.key}`,
      item_key: item.key,
      label: item.label,
      decision: patch.decision ?? existing?.decision ?? 'unknown',
      monthly_amount: item.monthlyAvg,
      note: patch.note !== undefined ? patch.note : existing?.note ?? null,
      decided_by: (payload.decided_by as string | null | undefined) ?? existing?.decided_by ?? null,
      decided_at: (payload.decided_at as string | null | undefined) ?? existing?.decided_at ?? null,
      updated_at: now,
    }
    setReviews(prev => [...prev.filter(r => r.item_key !== item.key), optimistic])

    const upsert = (body: Record<string, unknown>) =>
      supabase.from('spend_reviews').upsert(body, { onConflict: 'item_key' }).select('*').single()
    let { data, error } = await upsert(payload)
    // 고른 직원이 직원 목록에서 지워졌으면(외래키 오류) 누가 정했는지만 비우고 다시 저장한다
    if (error?.code === '23503' && payload.decided_by) {
      ({ data, error } = await upsert({ ...payload, decided_by: null }))
    }
    if (error) {
      setReviews(before)
      if (isMissingTableOrColumn(error)) setForceDbMissing(true)
      else toast.error(`저장하지 못했습니다: ${error.message}`)
      return
    }
    if (data) setReviews(prev => [...prev.filter(r => r.item_key !== item.key), data as SpendReview])
  }

  const decide = (item: RecurringItem) => (d: SpendDecision) => { void saveReview(item, { decision: d }) }
  const note = (item: RecurringItem) => (n: string | null) => { void saveReview(item, { note: n }) }

  // ---------------- 화면 ----------------

  if (forceDbMissing || loaded?.status === 'dbMissing') {
    return (
      <div className="rounded-[10px] border border-border-primary bg-surface p-6">
        <div className="flex items-start gap-3">
          <Database size={20} className="mt-0.5 shrink-0 text-txt-tertiary" />
          <div className="space-y-1.5">
            <div className="text-[15px] font-semibold text-txt-primary">DB 준비가 필요합니다(sql/leak_check.sql 실행)</div>
            <p className="text-[13px] text-txt-secondary">
              통장 거래내역과 검토 결과를 저장할 표가 아직 없습니다. Supabase → SQL Editor에 <code className="rounded bg-surface-secondary px-1">sql/leak_check.sql</code> 파일 내용을 붙여 한 번 실행한 뒤 이 화면을 새로고침해 주세요.
            </p>
            <p className="text-[12px] text-txt-tertiary">법인카드 내역은 그대로 있습니다 — 「법인카드」 탭에서 볼 수 있습니다.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!loaded) return <div className="py-12 text-center text-[13px] text-txt-quaternary">불러오는 중...</div>

  if (loaded.status === 'error') {
    return (
      <div className="rounded-[10px] border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger">
        내역을 읽지 못했습니다: {loaded.message}
        <button type="button" onClick={reload} className="btn-secondary ml-3 text-xs">다시 읽기</button>
      </div>
    )
  }

  if (!report || !summary) return null
  const { coverage } = report
  const noData = coverage.bank.count === 0 && coverage.card.count === 0
  const accounts = [...new Set(loaded.status === 'ok' ? loaded.bank.map(b => b.account) : [])]

  const filtered = filter === 'all' ? report.recurring : report.recurring.filter(i => stateOf(i.key).decision === filter)
  const filterCount = (f: Filter) => (f === 'all' ? report.recurring.length : report.recurring.filter(i => stateOf(i.key).decision === f).length)
  const cancelledCount = filterCount('cancelled')

  return (
    <div className="space-y-4">
      {/* 올리기 + 기간 */}
      <div className="space-y-3 rounded-[10px] border border-border-primary bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-txt-primary">
            <Banknote size={16} className="text-txt-tertiary" /> 통장·카드 내역
          </h3>
          <div className="flex items-center gap-2">
            {stale && <span className="text-[12px] text-txt-tertiary">새로 읽는 중...</span>}
            <select
              value={period}
              onChange={e => setPeriod(Number(e.target.value) as Period)}
              aria-label="기간"
              className="input-field shrink-0"
            >
              {PERIODS.map(p => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
            </select>
          </div>
        </div>
        <BankUpload onSaved={reload} onDbMissing={() => setForceDbMissing(true)} />
        <div className="grid grid-cols-1 gap-2 text-[12px] text-txt-secondary sm:grid-cols-2">
          <div className="rounded-lg bg-surface-secondary px-3 py-2">
            <span className="font-medium text-txt-primary">통장</span>{' '}
            {coverage.bank.count > 0
              ? <>{accounts.join(', ')} · {shortDate(coverage.bank.from!)} ~ {shortDate(coverage.bank.to!)} · 출금 {coverage.bank.count.toLocaleString()}건</>
              : '이 기간에 올린 통장 내역이 없습니다'}
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-secondary px-3 py-2">
            <span>
              <span className="font-medium text-txt-primary">법인카드</span>{' '}
              {coverage.card.count > 0
                ? <>{shortDate(coverage.card.from!)} ~ {shortDate(coverage.card.to!)} · {coverage.card.count.toLocaleString()}건</>
                : '이 기간 카드 내역이 없습니다'}
            </span>
            {/* 카드 명세서는 원래 있던 카드 CSV 올리기를 쓴다 — 같은 표(card_transactions)에 쌓여 여기서도 같이 본다 */}
            <button type="button" onClick={onGoCard} className="btn-inline inline-flex shrink-0 items-center gap-1">
              <CreditCard size={12} /> 카드 내역 올리기
            </button>
          </div>
        </div>
      </div>

      {noData ? (
        <div className="rounded-[10px] border border-border-primary bg-surface p-6 text-[13px] text-txt-secondary">
          <div className="mb-2 text-[15px] font-semibold text-txt-primary">먼저 내역을 올려 주세요</div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>기업은행 인터넷뱅킹 → 조회 → 거래내역조회에서 기간을 1년으로 잡고 「엑셀 저장」 → 위 상자에 올립니다.</li>
            <li>법인카드는 카드사 홈페이지에서 이용내역을 CSV로 받아 「법인카드」 탭에 올립니다.</li>
            <li>그러면 매달 같은 곳으로 나가는 돈(자동이체·구독·임대료 등)과 수수료·중복 결제를 찾아 여기에 보여 줍니다.</li>
          </ol>
          <p className="mt-2 text-[12px] text-txt-tertiary">통장이 여러 개면 하나씩 올리면 됩니다. 같은 파일을 두 번 올려도 겹치지 않습니다.</p>
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="stat-card">
              <p className="text-xs text-txt-secondary">한 달 정기지출</p>
              <p className="text-xl font-semibold text-txt-primary tabular-nums">{won(summary.monthlyTotal)}</p>
              <p className="text-xs text-txt-tertiary">
                정기지출 {report.recurring.length}곳{cancelledCount > 0 ? ` · 해지함 ${cancelledCount}곳은 뺌` : ''}
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-txt-secondary">1년으로 치면</p>
              <p className="text-xl font-semibold text-txt-primary tabular-nums">{won(summary.yearlyTotal)}</p>
              <p className="text-xs text-txt-tertiary">한 달 × 12</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-txt-secondary">해지·줄이기로 아끼는 돈(1년)</p>
              <p className="text-xl font-semibold text-txt-primary tabular-nums">{won(summary.savingsYearly)}</p>
              <p className="text-xs text-txt-tertiary">해지 {won(summary.cancelYearly)} · 줄이기 {won(summary.reduceYearly)}(전액 기준)</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-txt-secondary">검토 남은 항목</p>
              <p className="text-xl font-semibold text-txt-primary tabular-nums">{summary.remaining}개</p>
              <p className="text-xs text-txt-tertiary">필요·해지·줄이기 중 고르기</p>
            </div>
          </div>

          {/* 정리하기 / 고정지출 목록 */}
          <div className="tabs-container">
            <button type="button" onClick={() => setView('review')} className={`tab-item ${view === 'review' ? 'tab-active' : ''}`}>정리하기</button>
            <button type="button" onClick={() => setView('fixed')} className={`tab-item ${view === 'fixed' ? 'tab-active' : ''}`}>
              고정지출 목록 <span className="ml-1 tabular-nums">{summary.fixed.length}</span>
            </button>
          </div>

          {view === 'fixed' ? (
            <FixedList summary={summary} />
          ) : (
            <div className="space-y-4">
              {/* 1. 정기 지출 */}
              <Section
                title="정기 지출"
                icon={<Repeat size={16} />}
                count={report.recurring.length}
                total={`한 달 ${won(report.recurring.reduce((s, i) => s + i.monthlyAvg, 0))}`}
                hint="매달(또는 몇 달마다) 같은 곳으로 나가는 돈입니다. 하나씩 필요·해지·줄이기를 골라 주세요. 이미 해지했으면 「해지함」."
              >
                {report.recurring.length === 0 ? (
                  <EmptyLine>
                    3달 이상 반복해서 나간 돈이 아직 없습니다. 기간을 늘리거나 더 긴 기간의 통장·카드 내역을 올려 보세요.
                  </EmptyLine>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5 px-4 py-2.5">
                      {FILTERS.map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFilter(f)}
                          className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                            filter === f ? 'border-accent bg-accent-light text-accent-text' : 'border-border-primary bg-surface text-txt-secondary'
                          }`}
                        >
                          {f === 'all' ? '전체' : DECISION_LABEL[f]} <span className="tabular-nums">{filterCount(f)}</span>
                        </button>
                      ))}
                    </div>
                    <RecurringHeader />
                    {filtered.length === 0 ? <EmptyLine>이 분류에 해당하는 항목이 없습니다.</EmptyLine> : filtered.map(item => (
                      <RecurringRow key={item.key} item={item} review={stateOf(item.key)} onDecide={decide(item)} onNote={note(item)} />
                    ))}
                  </>
                )}
              </Section>

              {/* 2. 금액 오른 정기결제 */}
              <Section
                title="금액 오른 정기결제"
                icon={<ArrowUpRight size={16} />}
                count={report.priceIncreases.length}
                total={report.priceIncreases.length ? `1년 ${won(report.priceIncreases.reduce((s, p) => s + p.yearlyExtra, 0))} 더 냄` : undefined}
                hint="최근 금액이 그전보다 5% 넘게 오른 구독·자동이체입니다. 요금제가 바뀌었는지 확인해 보세요."
              >
                {report.priceIncreases.length === 0 ? <EmptyLine>금액이 오른 정기결제가 없습니다.</EmptyLine> : (
                  <>
                    <RecurringHeader />
                    {report.priceIncreases.map(p => (
                      <RecurringRow
                        key={p.item.key}
                        item={p.item}
                        review={stateOf(p.item.key)}
                        onDecide={decide(p.item)}
                        onNote={note(p.item)}
                        extra={
                          <span className="text-danger tabular-nums">
                            {won(p.before)} → {won(p.latest)} (+{Math.round(p.ratio * 100)}%) · 1년 {won(p.yearlyExtra)} 더
                          </span>
                        }
                      />
                    ))}
                  </>
                )}
              </Section>

              {/* 3. 중복 의심 */}
              <DuplicateSection report={report} />

              {/* 4. 수수료 */}
              <FeeSection report={report} />

              {/* 5. 큰 일회성 지출 */}
              <OneOffSection report={report} />

              {/* 6. 끊긴 정기결제 */}
              <Section
                title="끊긴 정기결제"
                icon={<PauseCircle size={16} />}
                count={report.stopped.length}
                defaultOpen={false}
                hint="예전엔 매달 나갔는데 최근 두 달 넘게 안 나간 것 — 이미 해지됐을 가능성이 큽니다. 맞으면 「해지함」."
              >
                {report.stopped.length === 0 ? <EmptyLine>끊긴 정기결제가 없습니다.</EmptyLine> : (
                  <>
                    <RecurringHeader amountLabel="한 달(그때)" />
                    {report.stopped.map(item => (
                      <RecurringRow
                        key={item.key}
                        item={item}
                        review={stateOf(item.key)}
                        onDecide={decide(item)}
                        onNote={note(item)}
                        extra={<span className="text-txt-tertiary">마지막 {item.lastSeen}</span>}
                      />
                    ))}
                  </>
                )}
              </Section>

              {/* 참고: 카드대금 */}
              <CardBillSection report={report} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------- 고정지출 목록 ----------------

function FixedList({ summary }: { summary: ReturnType<typeof summarizeReviews> }) {
  if (summary.fixed.length === 0) {
    return (
      <div className="rounded-[10px] border border-border-primary bg-surface">
        <EmptyLine>
          아직 「필요」로 고른 항목이 없습니다. 「정리하기」에서 정기 지출마다 「필요」를 누르면 여기에 모여 회사의 고정지출 목록이 됩니다.
        </EmptyLine>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-[10px] border border-border-primary bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-tertiary px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-txt-primary">
          <ListChecks size={16} className="text-txt-tertiary" /> 고정지출 목록
        </h3>
        <div className="text-[13px] text-txt-secondary tabular-nums">
          한 달 <b className="text-[15px] text-txt-primary">{won(summary.fixedMonthly)}</b> · 1년 {won(summary.fixedMonthly * 12)}
        </div>
      </div>
      <div className="hidden bg-surface-secondary px-4 py-2 text-[11px] font-medium tracking-[0.3px] text-txt-tertiary md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px] md:gap-4">
        <span>항목</span><span>메모</span><span className="text-right">한 달</span>
      </div>
      {summary.fixed.map(f => (
        <div key={f.key} className="border-t border-border-tertiary px-4 py-3 first:border-t-0 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px] md:items-center md:gap-4">
          <div className="flex min-w-0 items-center gap-1.5">
            {f.source && <SourceBadge source={f.source} />}
            <span className="truncate text-[14px] font-medium text-txt-primary">{f.label}</span>
          </div>
          <div className="mt-0.5 text-[12px] text-txt-secondary md:mt-0">
            {f.note || ''}
            {!f.detected && <span className="text-txt-tertiary">{f.note ? ' · ' : ''}이 기간 내역에 없음(정할 때 금액)</span>}
          </div>
          <div className="mt-1 text-right text-[14px] font-semibold text-txt-primary tabular-nums md:mt-0">{won(f.monthly)}</div>
        </div>
      ))}
    </div>
  )
}

// ---------------- 중복 의심 ----------------

type Report = ReturnType<typeof detectLeaks>

function DuplicateSection({ report }: { report: Report }) {
  const more = useShowMore(20)
  const d = report.duplicates
  return (
    <Section
      title="중복 의심"
      icon={<Copy size={16} />}
      count={d.length}
      total={d.length ? `더 나갔을 수 있는 돈 ${won(d.reduce((s, x) => s + x.extra, 0))}` : undefined}
      hint="같은 날 같은 곳에 같은 금액이 두 번 이상 나간 것(1만원 이상). 실제로 두 번 산 것인지 확인해 보세요."
    >
      {d.length === 0 ? <EmptyLine>중복으로 보이는 결제가 없습니다.</EmptyLine> : (
        <>
          {more.slice(d).map(x => (
            <div key={`${x.source}|${x.date}|${x.label}|${x.amount}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border-tertiary px-4 py-2.5 first:border-t-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <SourceBadge source={x.source} />
                <span className="text-[12px] text-txt-tertiary tabular-nums">{shortDate(x.date)}</span>
                <span className="truncate text-[13px] text-txt-primary">{x.label}</span>
                <span className="hidden text-[12px] text-txt-tertiary sm:inline">{x.via.join(', ')}</span>
              </div>
              <div className="text-[13px] tabular-nums text-txt-primary">
                {won(x.amount)} × {x.count}번 <span className="text-danger">(+{won(x.extra)})</span>
              </div>
            </div>
          ))}
          {more.button(d.length)}
        </>
      )}
    </Section>
  )
}

// ---------------- 수수료 ----------------

function FeeSection({ report }: { report: Report }) {
  const f = report.fees
  return (
    <Section
      title="수수료"
      icon={<Receipt size={16} />}
      count={f.count}
      total={f.count ? `1년 약 ${won(f.yearly)}` : undefined}
      defaultOpen={f.count > 0}
      hint="통장에서 빠져나간 이체·각종 수수료입니다. 같은 은행 이체나 수수료 면제 상품으로 줄일 수 있는지 보세요."
    >
      {f.count === 0 ? <EmptyLine>{report.coverage.bank.count ? '이 기간 통장에 수수료가 없습니다.' : '통장 내역을 올리면 수수료를 모아 보여 줍니다.'}</EmptyLine> : (
        <div className="grid grid-cols-1 gap-4 px-4 py-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-[12px] text-txt-tertiary">달마다 (한 달 평균 {won(f.monthlyAvg)})</div>
            <div className="divide-y divide-border-tertiary">
              {[...f.months].reverse().map(m => (
                <div key={m.month} className="flex justify-between py-1.5 text-[13px] tabular-nums">
                  <span className="text-txt-secondary">{monthLabel(m.month)}</span>
                  <span className="text-txt-primary">{m.count}건 · {won(m.total)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[12px] text-txt-tertiary">종류별 (합계 {won(f.total)})</div>
            <div className="divide-y divide-border-tertiary">
              {f.byName.slice(0, 10).map(n => (
                <div key={n.label} className="flex justify-between gap-3 py-1.5 text-[13px] tabular-nums">
                  <span className="truncate text-txt-secondary">{n.label}</span>
                  <span className="shrink-0 text-txt-primary">{n.count}건 · {won(n.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}

// ---------------- 큰 일회성 지출 ----------------

function OneOffSection({ report }: { report: Report }) {
  const more = useShowMore(20)
  const o = report.oneOffs
  return (
    <Section
      title="큰 일회성 지출"
      icon={<AlertTriangle size={16} />}
      count={o.length}
      total={o.length ? won(o.reduce((s, x) => s + x.amount, 0)) : undefined}
      defaultOpen={false}
      hint="정기지출이 아닌 지출 중 금액이 큰 것(100만원 이상 전부, 적으면 큰 순서로 20건). 모르는 지출이 없는지 훑어보세요."
    >
      {o.length === 0 ? <EmptyLine>큰 일회성 지출이 없습니다.</EmptyLine> : (
        <>
          {more.slice(o).map((x, i) => (
            <div key={`${x.source}|${x.id ?? i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border-tertiary px-4 py-2.5 first:border-t-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <SourceBadge source={x.source} />
                <span className="text-[12px] text-txt-tertiary tabular-nums">{shortDate(x.date)}</span>
                <span className="truncate text-[13px] text-txt-primary">{x.name || '(이름 없음)'}</span>
                <span className="hidden text-[12px] text-txt-tertiary sm:inline">{x.via}</span>
              </div>
              <div className="text-[13px] font-medium tabular-nums text-txt-primary">{won(x.amount)}</div>
            </div>
          ))}
          {more.button(o.length)}
        </>
      )}
    </Section>
  )
}

// ---------------- 카드대금(참고) ----------------

function CardBillSection({ report }: { report: Report }) {
  const more = useShowMore(12)
  const b = report.cardBills
  if (b.rows.length === 0) return null
  return (
    <Section
      title="카드대금 출금(참고)"
      icon={<CalendarClock size={16} />}
      count={b.rows.length}
      total={won(b.total)}
      defaultOpen={false}
      hint={`통장에서 카드값으로 나간 돈입니다. 카드 내역(가맹점별)과 겹치므로 위 계산에서는 뺐습니다. ${
        report.coverage.card.count
          ? '어디에 썼는지는 위 목록에 카드 내역으로 들어 있습니다.'
          : '법인카드 탭에 카드 내역을 올리면 어디에 썼는지 위 목록에 나옵니다.'
      }`}
    >
      {more.slice(b.rows).map((x, i) => (
        <div key={`${x.id ?? i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border-tertiary px-4 py-2.5 first:border-t-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-[12px] text-txt-tertiary tabular-nums">{shortDate(x.date)}</span>
            <span className="truncate text-[13px] text-txt-primary">{x.name}</span>
            <span className="text-[12px] text-txt-tertiary">
              {x.matchedMonth
                ? `· 카드 내역 ${monthLabel(x.matchedMonth)}${x.matchedCard ? ` ${x.matchedCard}` : ''} 합계와 같음`
                : report.coverage.card.count ? '· 맞는 카드 내역 없음(카드 CSV 확인)' : ''}
            </span>
          </div>
          <div className="text-[13px] tabular-nums text-txt-primary">{won(x.amount)}</div>
        </div>
      ))}
      {more.button(b.rows.length)}
    </Section>
  )
}
