/**
 * 입금 처리 공통 라이브러리
 * - 텔레그램, AI 비서, 수동 등록 모두 이 모듈을 사용
 * - payment_type 자동 분류 + status 자동 전환
 */
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export interface ProjectAmounts {
  total_cost: number
  self_pay: number
  city_support: number
  additional_cost: number
  collected: number
  outstanding: number
  status: string
}

/** 금액 기준 payment_type 자동 추론 */
export function inferPaymentType(
  amount: number,
  project: Pick<ProjectAmounts, 'self_pay' | 'city_support' | 'additional_cost' | 'collected' | 'total_cost'>,
): { type: '자부담착수금' | '추가공사비' | '시지원금잔금'; reason: string } {
  const self = project.self_pay || 0
  const cityS = project.city_support || 0
  const addC = project.additional_cost || 0
  const alreadyCollected = project.collected || 0
  const total = (project.total_cost || 0) + addC

  // 1) 정확 일치 우선 — 자부담/추가공사/시지원 순
  if (self > 0 && amount === self) return { type: '자부담착수금', reason: '자부담금 일치' }
  if (addC > 0 && amount === addC) return { type: '추가공사비', reason: '추가공사금 일치' }
  if (cityS > 0 && amount === cityS) return { type: '시지원금잔금', reason: '시지원금 일치' }

  // 2) 자부담금을 아직 안 받았으면 자부담 우선
  if (self > 0 && alreadyCollected < self) {
    if (amount <= self - alreadyCollected) return { type: '자부담착수금', reason: '자부담금 부분납부' }
  }

  // 3) 추가공사비 정확히 미수 중이면 추가공사비
  const remainAdditional = addC - Math.max(0, alreadyCollected - self)
  if (addC > 0 && remainAdditional > 0 && amount <= remainAdditional) {
    return { type: '추가공사비', reason: '추가공사비 추정' }
  }

  // 4) 큰 금액 or 남은 미수금 = 시지원금
  if (cityS > 0 && amount >= cityS * 0.8) return { type: '시지원금잔금', reason: '시지원금 추정' }

  // 5) 기본값: 총 공사비 대비 위치
  if (amount >= total * 0.5) return { type: '시지원금잔금', reason: '큰 금액 → 시지원금' }
  return { type: '자부담착수금', reason: '소액 → 자부담' }
}

/** 입금 후 status 자동 전환 규칙 */
export function inferNextStatus(
  currentStatus: string,
  newCollected: number,
  project: Pick<ProjectAmounts, 'self_pay' | 'total_cost' | 'additional_cost'>,
): string | null {
  if (currentStatus === '취소' || currentStatus === '문의(예약)') return null
  if (currentStatus === '입금') return null

  const self = project.self_pay || 0
  // total_cost는 이미 all-inclusive
  const total = project.total_cost || 0

  // 1) 총 공사비 완납 → '입금'
  if (total > 0 && newCollected >= total) return '입금'

  // 2) 자부담금 완납 + 아직 자부담 이전 단계 → '승인'으로
  const PRE_APPROVAL = ['문의', '실측', '견적전달', '동의서', '신청서제출']
  if (self > 0 && newCollected >= self && PRE_APPROVAL.includes(currentStatus)) {
    return '승인'
  }

  return null
}

/**
 * 입금 기록 + 프로젝트 수금/미수금 재계산 + status 자동 전환
 * 반환: 응답 메시지 생성용 데이터
 */
export async function applyDepositAndAdvanceStatus(params: {
  projectId: string
  amount: number
  payerName?: string | null
  confirmerName: string
  paymentDate?: string | null
  source: 'telegram' | 'ai' | 'manual'
}): Promise<
  | { ok: false; error: string }
  | {
      ok: true
      payment: { type: string; reason: string; amount: number; confirmer: string }
      project: {
        id: string
        building_name: string
        owner_name: string | null
        address: string
        city: string
        category: string
        support_program: string
        water_work_type: string | null
        note: string | null
        self_pay: number
        city_support: number
        additional_cost: number
        total_cost: number
        collected: number
        outstanding: number
      }
      statusChange: { from: string; to: string } | null
    }
> {
  const { projectId, amount, payerName, confirmerName, paymentDate, source } = params
  const today = paymentDate || new Date().toISOString().slice(0, 10)

  // 프로젝트 조회
  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select(
      'id, building_name, owner_name, road_address, jibun_address, water_work_type, support_program, note, total_cost, collected, outstanding, self_pay, city_support, additional_cost, status, cities(name), work_types(name, work_categories(name))',
    )
    .eq('id', projectId)
    .single()
  if (pErr || !project) return { ok: false, error: '프로젝트를 찾을 수 없습니다' }

  // 중복 체크 (같은 금액 + 같은 날짜 + 같은 확인자)
  const { data: dup } = await supabaseAdmin
    .from('payments')
    .select('id')
    .eq('project_id', projectId)
    .eq('amount', amount)
    .eq('payment_date', today)
    .ilike('note', `%${confirmerName}%`)
    .limit(1)
  if (dup && dup.length > 0) return { ok: false, error: '동일 날짜/금액/확인자로 이미 등록됨' }

  // payment_type 자동 분류
  const { type, reason } = inferPaymentType(amount, {
    self_pay: project.self_pay || 0,
    city_support: project.city_support || 0,
    additional_cost: project.additional_cost || 0,
    collected: project.collected || 0,
    total_cost: project.total_cost || 0,
  })

  // payments INSERT
  const sourceLabel = source === 'telegram' ? '텔레그램' : source === 'ai' ? 'AI비서' : '수동'
  const noteText = `자동분류: ${reason} / 확인: ${confirmerName} (${sourceLabel})`
  const { error: insErr } = await supabaseAdmin.from('payments').insert({
    project_id: projectId,
    payment_type: type,
    amount,
    payment_date: today,
    payer_name: payerName || confirmerName,
    note: noteText,
  })
  if (insErr) return { ok: false, error: `입금 기록 실패: ${insErr.message}` }

  // projects.collected / outstanding 재계산 (모든 payments 다시 합산 — 무결성)
  const { data: allPayments } = await supabaseAdmin
    .from('payments')
    .select('amount')
    .eq('project_id', projectId)
  const newCollected = (allPayments || []).reduce((s, p) => s + (p.amount || 0), 0)
  // total_cost는 이미 all-inclusive (self + city + additional)
  const newOutstanding = Math.max(0, (project.total_cost || 0) - newCollected)

  await supabaseAdmin
    .from('projects')
    .update({ collected: newCollected, outstanding: newOutstanding })
    .eq('id', projectId)

  // status 자동 전환
  const nextStatus = inferNextStatus(project.status, newCollected, {
    self_pay: project.self_pay || 0,
    total_cost: project.total_cost || 0,
    additional_cost: project.additional_cost || 0,
  })
  let statusChange: { from: string; to: string } | null = null
  if (nextStatus && nextStatus !== project.status) {
    await supabaseAdmin.from('projects').update({ status: nextStatus }).eq('id', projectId)
    await supabaseAdmin.from('status_logs').insert({
      project_id: projectId,
      from_status: project.status,
      to_status: nextStatus,
      note: `자동전환(입금 ${type})`,
    })
    statusChange = { from: project.status, to: nextStatus }
  }

  return {
    ok: true,
    payment: { type, reason, amount, confirmer: confirmerName },
    project: {
      id: project.id,
      building_name: project.building_name || '(이름없음)',
      owner_name: project.owner_name,
      address: project.road_address || project.jibun_address || '-',
      city: (project.cities as { name?: string } | null)?.name || '-',
      category:
        (project.work_types as { work_categories?: { name?: string } } | null)?.work_categories?.name || '-',
      support_program:
        project.support_program || (project.work_types as { name?: string } | null)?.name || '-',
      water_work_type: project.water_work_type,
      note: project.note,
      self_pay: project.self_pay || 0,
      city_support: project.city_support || 0,
      additional_cost: project.additional_cost || 0,
      total_cost: project.total_cost || 0,
      collected: newCollected,
      outstanding: newOutstanding,
    },
    statusChange,
  }
}

/** 입금 완료 메시지 포맷 (텔레그램/AI 공통) */
export function formatDepositMessage(result: Extract<
  Awaited<ReturnType<typeof applyDepositAndAdvanceStatus>>,
  { ok: true }
>): string {
  const won = (n: number) => n.toLocaleString('ko-KR') + '원'
  const { payment, project, statusChange } = result
  const waterType = project.water_work_type ? ` (${project.water_work_type})` : ''

  const lines = [
    `✅ *입금 등록 완료* (확인: ${payment.confirmer})`,
    `분류: *${payment.type}* — ${payment.reason}`,
    ``,
    `🏢 *${project.building_name}*`,
    `📍 ${project.city} · ${project.address}`,
    `🔧 ${project.category} · ${project.support_program}${waterType}`,
    `💬 ${project.note || '-'}`,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `자부담금   ${won(project.self_pay)}`,
    `시지원금   ${won(project.city_support)}`,
    `추가공사금 ${won(project.additional_cost)}`,
    `총공사비   *${won(project.total_cost)}*`,
    `━━━━━━━━━━━━━━━━`,
    `수금액     ${won(project.collected)} ← +${won(payment.amount)}`,
    `*미수금     ${won(project.outstanding)}*`,
  ]
  if (statusChange) {
    lines.push('', `📈 단계 자동 이동: ${statusChange.from} → ${statusChange.to}`)
  }
  return lines.join('\n')
}
