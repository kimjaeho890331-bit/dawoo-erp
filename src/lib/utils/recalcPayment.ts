import { supabase } from '@/lib/supabase'

/**
 * projects.collected / outstanding 을 payments 전체 재합산으로 갱신.
 * (증감분 계산 방식은 동시 편집·총공사비 사후 수정 시 값이 어긋나므로 항상 전액 재합산)
 */
export async function recalcProjectPaymentTotals(projectId: string, totalCost: number) {
  const { data, error } = await supabase
    .from('payments')
    .select('amount')
    .eq('project_id', projectId)
  if (error) throw error
  const collected = (data || []).reduce((s, p) => s + (p.amount || 0), 0)
  const { error: updateError } = await supabase
    .from('projects')
    .update({ collected, outstanding: Math.max(0, totalCost - collected) })
    .eq('id', projectId)
  if (updateError) throw updateError
  return { collected, outstanding: Math.max(0, totalCost - collected) }
}

/** 저장된 필드 중 총공사비 관련 필드가 있는지 */
export function touchesMoneyFields(saved: Record<string, unknown>): boolean {
  return ['total_cost', 'self_pay', 'city_support', 'additional_cost'].some(f => f in saved)
}
