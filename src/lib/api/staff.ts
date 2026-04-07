import { supabase } from '@/lib/supabase';
import type { Staff } from '@/types';

// --- 직원 목록 조회 ---
export async function getStaffList(): Promise<Staff[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('id, name, phone, role')
    .order('name');

  if (error) {
    throw new Error(`직원 목록 조회 실패: ${error.message}`);
  }

  return (data as Staff[]) ?? [];
}
