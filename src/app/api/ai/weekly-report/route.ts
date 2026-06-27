import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'
import type { WeeklyReport, WeeklyStat } from '@/types'

export const maxDuration = 30

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const KST = 9 * 3600 * 1000 // 한국 시간 보정 (서버는 UTC)

// KST 기준 "이번 주 월요일 00:00"의 실제 UTC 인스턴트
function kstThisWeekStart(now: Date): Date {
  const k = new Date(now.getTime() + KST)
  const day = k.getUTCDay() // 0=일 ~ 6=토 (KST 벽시계)
  const diff = day === 0 ? -6 : 1 - day
  const kMidnight = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + diff, 0, 0, 0)
  return new Date(kMidnight - KST)
}

function kstDateStr(d: Date): string {
  const k = new Date(d.getTime() + KST)
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`
}

const emptyStat = (): WeeklyStat => ({ intake: 0, water: 0, small: 0, amount: 0, approved: 0, completed: 0, paid: 0 })

interface ProjRow {
  created_at: string
  total_cost: number | null
  work_types: { work_categories: { name: string } | null } | null
}
interface LogRow { to_status: string | null; created_at: string }

// GET /api/ai/weekly-report — 월요일 기준 지난주 vs 지지난주 회사 단위 비교 보고서
export async function GET() {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })

  const now = new Date()
  const thisWeekStart = kstThisWeekStart(now)
  const lwStart = new Date(thisWeekStart.getTime() - 7 * 86400000)  // 지난주 시작
  const wbStart = new Date(thisWeekStart.getTime() - 14 * 86400000) // 지지난주 시작
  const tws = thisWeekStart.getTime()
  const lws = lwStart.getTime()
  const wbs = wbStart.getTime()

  const [projRes, logRes] = await Promise.all([
    supabaseAdmin.from('projects')
      .select('created_at, total_cost, work_types:work_type_id ( work_categories:category_id ( name ) )')
      .is('cancel_reason', null)
      .gte('created_at', wbStart.toISOString())
      .lt('created_at', thisWeekStart.toISOString()),
    supabaseAdmin.from('status_logs')
      .select('to_status, created_at')
      .gte('created_at', wbStart.toISOString())
      .lt('created_at', thisWeekStart.toISOString()),
  ])

  const lw = emptyStat()
  const wb = emptyStat()
  const bucket = (t: number): WeeklyStat | null => (t >= tws ? null : t >= lws ? lw : t >= wbs ? wb : null)

  for (const p of (projRes.data || []) as unknown as ProjRow[]) {
    const s = bucket(new Date(p.created_at).getTime())
    if (!s) continue
    s.intake++
    s.amount += p.total_cost || 0
    const cat = p.work_types?.work_categories?.name
    if (cat === '수도') s.water++
    else if (cat === '소규모') s.small++
  }
  for (const l of (logRes.data || []) as LogRow[]) {
    const s = bucket(new Date(l.created_at).getTime())
    if (!s) continue
    if (l.to_status === '승인') s.approved++
    else if (l.to_status === '완료서류제출') s.completed++
    else if (l.to_status === '입금') s.paid++
  }

  // AI 보고서 생성 (실패해도 숫자 + 룰 요약으로 graceful)
  let ai: { summary: string; goodPoints: string[]; problems: string[]; improvements: string[] } | null = null
  try {
    ai = await generateReport(lw, wb)
  } catch { /* graceful */ }

  const report: WeeklyReport = {
    generatedAt: new Date().toISOString(),
    lwStart: kstDateStr(lwStart),
    wbStart: kstDateStr(wbStart),
    lw,
    wb,
    summary: ai?.summary || fallbackSummary(lw, wb),
    goodPoints: ai?.goodPoints || [],
    problems: ai?.problems || [],
    improvements: ai?.improvements || [],
    aiGenerated: !!ai,
  }
  return Response.json(report)
}

function fallbackSummary(lw: WeeklyStat, wb: WeeklyStat): string {
  const d = lw.intake - wb.intake
  const dir = d > 0 ? `${d}건 증가` : d < 0 ? `${Math.abs(d)}건 감소` : '동일'
  return `지난주 접수 ${lw.intake}건(수도 ${lw.water}·소규모 ${lw.small}), 지지난주 대비 ${dir}.`
}

const SYSTEM = `당신은 다우건설(정부 지원 수도/소규모 공사 접수~수금 ERP)의 주간 운영 분석가입니다.
지난주와 지지난주의 "회사 전체(팀 단위)" 접수·진행 실적을 비교해 월요일 주간 보고서를 작성합니다.

[규칙]
- 회사/팀 단위만. 직원 개인 실적/평가/순위 금지 (접수가 전화 회선 공유라 개인 귀속 불가).
- 미수금/잔액 독촉·경고 금지 (관공서 일이라 회수는 정상 절차).
- 반드시 사실(주어진 숫자) 기반. 과장·추측 금지. 표본이 작으니(주 수 건~수십 건) 단정적 결론은 자제.
- 한국어. 각 항목 1문장, 가능한 구체 숫자 포함.

[출력 항목]
- summary: 1~2문장 총평.
- goodPoints: 잘한 점(증가/완료/진행). 0~3개.
- problems: 문제점(감소/정체/누락). 0~3개. 없으면 빈 배열.
- improvements: 다음 주 보완점(실행 가능한 제안). 0~3개.

JSON만 출력(설명/코드펜스 금지):
{"summary":"...","goodPoints":["..."],"problems":["..."],"improvements":["..."]}`

async function generateReport(lw: WeeklyStat, wb: WeeklyStat) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const man = (won: number) => Math.round(won / 10000).toLocaleString()
  const line = (label: string, s: WeeklyStat) =>
    `[${label}] 접수 ${s.intake}건(수도 ${s.water}/소규모 ${s.small}), 수주액 ${man(s.amount)}만원, 승인 ${s.approved}건, 완료서류 ${s.completed}건, 입금 ${s.paid}건`
  const digest = `${line('지난주', lw)}\n${line('지지난주', wb)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 700, system: SYSTEM, messages: [{ role: 'user', content: digest }] }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) return null
  const result = await res.json()
  const text = (result.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('').trim()
  const jsonStr = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  let parsed: { summary?: string; goodPoints?: string[]; problems?: string[]; improvements?: string[] }
  try { parsed = JSON.parse(jsonStr) } catch { return null }
  if (!parsed.summary) return null
  const arr = (x: unknown): string[] => Array.isArray(x) ? x.filter(v => typeof v === 'string').slice(0, 3) : []
  return {
    summary: parsed.summary,
    goodPoints: arr(parsed.goodPoints),
    problems: arr(parsed.problems),
    improvements: arr(parsed.improvements),
  }
}
