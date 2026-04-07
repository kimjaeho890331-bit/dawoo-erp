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
