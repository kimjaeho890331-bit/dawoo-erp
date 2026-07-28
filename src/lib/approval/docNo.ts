import type { SupabaseClient } from '@supabase/supabase-js'
import { FORM_ABBR } from '@/types/approval'

/** CDV-26-000158 형식으로 조립한다. 채번 자체는 DB 함수가 한다. */
export function formatDocNo(formAbbr: string, year: number, seq: number): string {
  const yy = String(year % 100).padStart(2, '0')
  return `${formAbbr}-${yy}-${String(seq).padStart(6, '0')}`
}

/**
 * 문서번호를 발급한다. 동시 승인에도 번호가 겹치지 않도록 DB 함수에서 원자적으로 증가시킨다.
 * service_role 클라이언트로만 호출한다.
 */
export async function issueDocNo(
  admin: SupabaseClient,
  year: number = new Date().getFullYear(),
): Promise<string> {
  const { data, error } = await admin.rpc('next_doc_no', {
    p_form_abbr: FORM_ABBR,
    p_year: year,
  })
  if (error) throw new Error(`문서번호 채번 실패: ${error.message}`)
  if (typeof data !== 'string') throw new Error('문서번호 채번 실패: 응답이 문자열이 아닙니다')
  return data
}
