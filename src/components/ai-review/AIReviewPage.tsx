'use client'
// AI 검토 (운영 백오피스) — AI 비서의 등록/취소·만족도 지표 + 검토 큐(플래그 대화·취소) + 학습 규칙
// 사람(대표) 교정 → ai_memory 규칙 저장 → 다음 대화에 자동 반영(route.ts 주입)되는 되먹임 화면
import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, ThumbsUp, Flag, XCircle, CheckCircle2,
  Plus, Trash2, BookOpen, ChevronDown, Loader2, Sparkles,
} from 'lucide-react'

interface Metrics { approved: number; cancelled: number; shown: number; approveRate: number | null; up: number; down: number; flaggedCount: number; totalSessions: number }
interface ToolRow { tool: string; label: string; approved: number; cancelled: number; total: number }
interface FlaggedSession { id: string; title: string | null; last_message_at: string; flagged_reason: string | null }
interface CancelRow { tool: string | null; label: string | null; session_id: string | null; created_at: string }
interface Rule { id: string; category: string; key: string; value: string; created_at: string }
interface ReviewData { metrics: Metrics; byTool: ToolRow[]; reviewQueue: { flaggedSessions: FlaggedSession[]; recentCancels: CancelRow[] }; rules: Rule[] }

const CAT_LABEL: Record<string, string> = { rule: '규칙', preference: '선호', alias: '별칭', pattern: '패턴' }

function fmtDate(iso: string) {
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return '' }
}

export default function AIReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sessionMsgs, setSessionMsgs] = useState<Record<string, { role: string; content: string }[]>>({})
  const [ruleKey, setRuleKey] = useState('')
  const [ruleValue, setRuleValue] = useState('')
  const [ruleCat, setRuleCat] = useState('rule')
  const [saving, setSaving] = useState(false)

  // setState를 await 이후에만 호출 → effect 내 동기 setState 회피
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-review')
      const d = await res.json()
      if (!d.error) setData(d)
    } catch { /* graceful */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function openSession(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!sessionMsgs[id]) {
      try {
        const res = await fetch(`/api/chat/sessions?session_id=${id}`)
        const d = await res.json()
        setSessionMsgs(prev => ({ ...prev, [id]: d.messages || [] }))
      } catch { /* graceful */ }
    }
  }

  async function saveRule() {
    if (!ruleKey.trim() || !ruleValue.trim() || saving) return
    setSaving(true)
    try {
      await fetch('/api/ai-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: ruleKey.trim(), value: ruleValue.trim(), category: ruleCat }),
      })
      setRuleKey(''); setRuleValue('')
      await load()
    } catch { /* graceful */ }
    setSaving(false)
  }

  async function deleteRule(id: string) {
    if (!window.confirm('이 규칙을 삭제할까요?')) return
    try {
      await fetch(`/api/ai-review?id=${id}`, { method: 'DELETE' })
      setData(prev => prev ? { ...prev, rules: prev.rules.filter(r => r.id !== id) } : prev)
    } catch { /* graceful */ }
  }

  const m = data?.metrics

  return (
    <div className="max-w-[1100px] mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-accent-light flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-txt-primary tracking-[-0.01em]">AI 검토</h1>
            <p className="text-[12px] text-txt-tertiary">AI 비서가 잘한 점·헛다리를 보고, 교정 규칙을 심어 방향을 잡습니다</p>
          </div>
        </div>
        <button onClick={() => { setLoading(true); load() }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-primary bg-surface text-[13px] text-txt-secondary hover:bg-surface-secondary cursor-pointer">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 새로고침
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-txt-tertiary"><Loader2 className="w-5 h-5 animate-spin mr-2" /> 불러오는 중...</div>
      ) : (
        <>
          {/* 지표 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <MetricCard icon={<CheckCircle2 className="w-4 h-4 text-[#059669]" />} label="등록 채택률" value={m?.approveRate != null ? `${m.approveRate}%` : '-'} sub={`등록 ${m?.approved ?? 0} · 취소 ${m?.cancelled ?? 0}`} />
            <MetricCard icon={<ThumbsUp className="w-4 h-4 text-accent" />} label="만족 피드백" value={`${m?.up ?? 0}`} sub={`아쉬움 ${m?.down ?? 0}건`} />
            <MetricCard icon={<Flag className="w-4 h-4 text-danger" />} label="검토 필요 대화" value={`${m?.flaggedCount ?? 0}`} sub={`전체 ${m?.totalSessions ?? 0} 대화`} />
            <MetricCard icon={<BookOpen className="w-4 h-4 text-txt-secondary" />} label="학습 규칙" value={`${data?.rules.length ?? 0}`} sub="AI에 자동 반영 중" />
          </div>

          {/* 도구별 등록/취소 */}
          {data && data.byTool.length > 0 && (
            <Section title="작업별 등록 vs 취소" hint="취소가 많은 작업 = AI가 자주 헛짚는 곳">
              <div className="space-y-2">
                {data.byTool.map(t => {
                  const rate = t.total > 0 ? Math.round((t.approved / t.total) * 100) : 0
                  return (
                    <div key={t.tool} className="flex items-center gap-3">
                      <span className="w-20 text-[13px] text-txt-secondary shrink-0">{t.label}</span>
                      <div className="flex-1 h-5 rounded-md bg-surface-secondary overflow-hidden flex">
                        <div className="h-full bg-[#a7d8c4]" style={{ width: `${rate}%` }} />
                        <div className="h-full bg-danger-bg" style={{ width: `${100 - rate}%` }} />
                      </div>
                      <span className="w-28 text-[12px] text-txt-tertiary shrink-0 text-right tabular-nums">등록 {t.approved} · 취소 {t.cancelled}</span>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          <div className="grid md:grid-cols-2 gap-5 mb-6">
            {/* 검토 큐 — 플래그 대화 */}
            <Section title="검토 필요 대화" hint="👎·부정 표현이 감지된 대화">
              {!data || data.reviewQueue.flaggedSessions.length === 0 ? (
                <Empty text="검토할 대화가 없습니다" />
              ) : (
                <div className="space-y-1.5">
                  {data.reviewQueue.flaggedSessions.map(s => (
                    <div key={s.id} className="rounded-lg border border-border-primary overflow-hidden">
                      <button onClick={() => openSession(s.id)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-secondary cursor-pointer">
                        <Flag className="w-3.5 h-3.5 text-danger shrink-0" />
                        <span className="flex-1 min-w-0 text-[13px] text-txt-primary truncate">{s.title || '새 대화'}</span>
                        <span className="text-[11px] text-txt-quaternary shrink-0">{fmtDate(s.last_message_at)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-txt-quaternary shrink-0 transition-transform ${expanded === s.id ? 'rotate-180' : ''}`} />
                      </button>
                      {expanded === s.id && (
                        <div className="px-3 py-2.5 border-t border-border-primary bg-page space-y-2 max-h-72 overflow-y-auto">
                          {(sessionMsgs[s.id] || []).map((msg, k) => (
                            <div key={k} className={`text-[12.5px] leading-relaxed ${msg.role === 'user' ? 'text-txt-primary font-medium' : 'text-txt-secondary'}`}>
                              <span className="text-[10px] uppercase tracking-wide text-txt-quaternary mr-1.5">{msg.role === 'user' ? '직원' : 'AI'}</span>
                              <span className="whitespace-pre-wrap">{msg.content}</span>
                            </div>
                          ))}
                          {!sessionMsgs[s.id] && <div className="text-[12px] text-txt-tertiary">불러오는 중...</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* 검토 큐 — 최근 취소 */}
            <Section title="최근 취소된 제안" hint="사람이 [취소]한 = AI 판단이 빗나간 건">
              {!data || data.reviewQueue.recentCancels.length === 0 ? (
                <Empty text="취소된 제안이 없습니다" />
              ) : (
                <div className="space-y-1.5">
                  {data.reviewQueue.recentCancels.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border-primary">
                      <XCircle className="w-3.5 h-3.5 text-danger shrink-0" />
                      <span className="flex-1 text-[13px] text-txt-primary">{c.label || c.tool || '작업'}</span>
                      <span className="text-[11px] text-txt-quaternary shrink-0">{fmtDate(c.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* 학습 규칙 */}
          <Section title="학습 규칙 (AI에 자동 반영)" hint="여기 적은 규칙이 다음 대화부터 AI 판단에 우선 적용됩니다">
            {/* 추가 폼 */}
            <div className="flex flex-col md:flex-row gap-2 mb-3 p-3 rounded-lg bg-page border border-border-primary">
              <select value={ruleCat} onChange={e => setRuleCat(e.target.value)} className="input-field md:w-28">
                {Object.entries(CAT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input value={ruleKey} onChange={e => setRuleKey(e.target.value)} placeholder="언제 (예: 방수 업체)" className="input-field md:w-44" />
              <input value={ruleValue} onChange={e => setRuleValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveRule() }} placeholder="이렇게 (예: A방수에 먼저 연락)" className="input-field flex-1" />
              <button onClick={saveRule} disabled={saving || !ruleKey.trim() || !ruleValue.trim()} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-[13px] font-semibold hover:bg-accent-hover cursor-pointer disabled:opacity-40 shrink-0">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} 규칙 추가
              </button>
            </div>
            {!data || data.rules.length === 0 ? (
              <Empty text="아직 학습 규칙이 없습니다. 위에서 첫 규칙을 심어보세요." />
            ) : (
              <div className="space-y-1.5">
                {data.rules.map(r => (
                  <div key={r.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border-primary">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-secondary text-txt-tertiary shrink-0">{CAT_LABEL[r.category] || r.category}</span>
                    <span className="text-[13px] text-txt-primary font-medium shrink-0">{r.key}</span>
                    <span className="text-txt-quaternary shrink-0">→</span>
                    <span className="flex-1 min-w-0 text-[13px] text-txt-secondary truncate">{r.value}</span>
                    <button onClick={() => deleteRule(r.id)} className="shrink-0 w-7 h-7 grid place-items-center rounded-md text-txt-quaternary hover:text-danger hover:bg-danger-bg cursor-pointer" aria-label="규칙 삭제">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="p-4 rounded-xl bg-surface border border-border-primary">
      <div className="flex items-center gap-1.5 text-[12px] text-txt-tertiary font-medium">{icon} {label}</div>
      <div className="text-[26px] font-extrabold text-txt-primary tabular-nums mt-1 tracking-[-0.02em]">{value}</div>
      <div className="text-[11px] text-txt-quaternary mt-0.5">{sub}</div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-2.5">
        <h2 className="text-[15px] font-bold text-txt-primary">{title}</h2>
        {hint && <p className="text-[11.5px] text-txt-tertiary mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-[13px] text-txt-quaternary">{text}</div>
}
