import { supabase } from '@/lib/supabase';
import type { Project } from '@/types';

// JOIN 셀렉트 문자열
const PROJECT_SELECT = `
  *,
  staff:staff_id ( id, name ),
  cities:city_id ( name ),
  work_types:work_type_id ( name, work_categories:category_id ( name ) )
`;

// --- 목록 조회 (필터링 포함) ---
export async function getProjects(params: {
  category: '소규모' | '수도';
  status?: string;
  cityIds?: string[];
  search?: string;
}): Promise<Project[]> {
  let query = supabase
    .from('projects')
    .select(PROJECT_SELECT)
    .order('created_at', { ascending: false });

  // 카테고리 필터: work_types -> work_categories.name 으로 필터링
  // Supabase에서 nested filter가 안 되므로, 해당 카테고리의 work_type_id 목록을 먼저 조회
  const { data: workTypes } = await supabase
    .from('work_types')
    .select('id, work_categories!inner( name )')
    .eq('work_categories.name', params.category);

  if (workTypes && workTypes.length > 0) {
    const typeIds = workTypes.map((wt: { id: string }) => wt.id);
    query = query.in('work_type_id', typeIds);
  }

  // 상태 필터
  if (params.status) {
    query = query.eq('status', params.status);
  }

  // 시 필터 (복수 선택)
  if (params.cityIds && params.cityIds.length > 0) {
    query = query.in('city_id', params.cityIds);
  }

  // 검색 (빌라명, 소유주명, 도로명주소)
  if (params.search) {
    query = query.or(
      `building_name.ilike.%${params.search}%,owner_name.ilike.%${params.search}%,road_address.ilike.%${params.search}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`프로젝트 목록 조회 실패: ${error.message}`);
  }

  return (data as Project[]) ?? [];
}

// --- 단건 조회 ---
export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_SELECT)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // not found
    }
    throw new Error(`프로젝트 조회 실패: ${error.message}`);
  }

  return data as Project;
}

// --- 생성 ---
export async function createProject(
  data: Partial<Project>
): Promise<Project> {
  // JOIN 필드 제거 (DB에 없는 필드)
  const { staff, cities, work_types, ...insertData } = data as Project;

  const { data: created, error } = await supabase
    .from('projects')
    .insert(insertData)
    .select(PROJECT_SELECT)
    .single();

  if (error) {
    throw new Error(`프로젝트 생성 실패: ${error.message}`);
  }

  return created as Project;
}

// --- 수정 ---
export async function updateProject(
  id: string,
  data: Partial<Project>
): Promise<Project> {
  // JOIN 필드 제거
  const { staff, cities, work_types, ...updateData } = data as Project;

  const { data: updated, error } = await supabase
    .from('projects')
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(PROJECT_SELECT)
    .single();

  if (error) {
    throw new Error(`프로젝트 수정 실패: ${error.message}`);
  }

  return updated as Project;
}

// --- 단계 변경 (status_logs에도 기록) ---
export async function updateProjectStatus(
  id: string,
  newStatus: string,
  staffId?: string,
  note?: string
): Promise<void> {
  // 현재 상태 조회
  const { data: current, error: fetchError } = await supabase
    .from('projects')
    .select('status')
    .eq('id', id)
    .single();

  if (fetchError) {
    throw new Error(`프로젝트 상태 조회 실패: ${fetchError.message}`);
  }

  const fromStatus = current?.status ?? null;

  // 상태 업데이트
  const { error: updateError } = await supabase
    .from('projects')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    throw new Error(`프로젝트 상태 변경 실패: ${updateError.message}`);
  }

  // status_logs에 이력 기록
  const { error: logError } = await supabase
    .from('status_logs')
    .insert({
      project_id: id,
      staff_id: staffId ?? null,
      from_status: fromStatus,
      to_status: newStatus,
      note: note ?? null,
    });

  if (logError) {
    throw new Error(`상태 변경 이력 기록 실패: ${logError.message}`);
  }
}
