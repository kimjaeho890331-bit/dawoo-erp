import { supabase } from '@/lib/supabase';
import type { City } from '@/types';

// --- 시(지자체) 목록 조회 ---
export async function getCities(): Promise<City[]> {
  const { data, error } = await supabase
    .from('cities')
    .select('id, name, code')
    .order('name');

  if (error) {
    throw new Error(`시 목록 조회 실패: ${error.message}`);
  }

  return (data as City[]) ?? [];
}

// --- 지역명으로 city_id 조회, 없으면 생성 ---
// 접수 등록 시 주소에서 뽑은 지역명(예: '인천')을 cities 행에 연결한다.
// 목록에 없는 지역이면 새로 만들어 다음부터 자동으로 탭에 잡히게 한다.
export async function resolveCityId(regionName: string | null): Promise<string | null> {
  const name = regionName?.trim();
  if (!name) return null;

  const { data: existing } = await supabase
    .from('cities')
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created, error } = await supabase
    .from('cities')
    .insert({ name })
    .select('id')
    .single();
  if (error) {
    // 동시 생성으로 UNIQUE 충돌 시 재조회
    const { data: retry } = await supabase
      .from('cities')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    return (retry as { id: string } | null)?.id ?? null;
  }
  return (created as { id: string } | null)?.id ?? null;
}
