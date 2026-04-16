// ============================================
// 다우건설 ERP 타입 정의
// DB 스키마 기반 (dawoo_db_schema.sql)
// ============================================

// --- 프로젝트 상태 (AI 내부 10단계) ---
export const PROJECT_STATUSES = [
  '문의',
  '실측',
  '견적전달',
  '동의서',
  '신청서제출',
  '승인',
  '착공계',
  '공사',
  '완료서류제출',
  '입금',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// 화면 4단계 매핑
export const STATUS_STAGE_MAP: Record<ProjectStatus, number> = {
  '문의': 1,
  '실측': 1,
  '견적전달': 1,
  '동의서': 1,
  '신청서제출': 1,
  '승인': 2,
  '착공계': 2,
  '공사': 2,
  '완료서류제출': 3,
  '입금': 4,
};

// --- 직원 ---
export interface Staff {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  telegram_id?: string | null;
  created_at?: string;
}

// --- 시(지자체) ---
export interface City {
  id: string;
  name: string;
  code: string | null;
  created_at?: string;
}

// --- 공사 대분류 ---
export interface WorkCategory {
  id: string;
  name: string; // '수도' | '소규모'
  created_at?: string;
}

// --- 공사 소분류 ---
export interface WorkType {
  id: string;
  category_id: string;
  name: string;
  work_categories?: WorkCategory;
  created_at?: string;
}

// --- 접수대장 (projects 테이블 전체) ---
export interface Project {
  id: string;

  // 항상 보이는 항목
  building_name: string | null;
  staff_id: string | null;
  road_address: string | null;
  jibun_address: string | null;
  region: string | null;
  city_id: string | null;
  work_type_id: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  tenant_phone: string | null;
  total_cost: number;
  self_pay: number;
  city_support: number;

  // 1단계: 접수~신청서 제출
  area: number | null;
  unit_count: number | null;
  approval_date: string | null;
  application_date: string | null;
  application_submitter: string | null;
  survey_date: string | null;
  survey_staff: string | null;

  // 2단계: 승인~공사
  construction_date: string | null;
  contractor: string | null;
  equipment: string | null;
  down_payment: number;

  // 3단계: 완료서류 제출
  completion_doc_date: string | null;
  completion_submitter: string | null;

  // 4단계: 수금
  outstanding: number;
  balance: number;
  payment_date: string | null;
  payer_name: string | null;
  collected: number;

  // 추가 필드 (고도화)
  additional_cost: number;
  consent_date: string | null;
  construction_end_date: string | null;
  approval_received_date: string | null;
  field_memo: string | null;
  area_result: string | null;

  // 수도 전용
  water_work_type: string | null;
  unit_password: string | null;
  direct_worker: string | null;

  // 소규모 전용
  support_program: string | null;
  external_contractor: string | null;
  other_contractor: string | null;
  design_amount: number;
  receipt_date: string | null;

  // 전유부/표제부 자동 데이터
  dong: string | null;
  ho: string | null;
  bunji: string | null;
  exclusive_area: number | null;
  land_area: number | null;
  building_area: number | null;
  total_floor_area: number | null;
  building_use: string | null;
  building_purpose: string | null;
  household_count: number | null;

  // 통장 정보
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;

  // 기타
  status: ProjectStatus;
  note: string | null;
  cancel_reason: string | null;
  year: number | null;
  extra_fields: Record<string, unknown>;

  created_at: string;
  updated_at: string;

  // JOIN 결과 (조회 시 포함)
  staff?: Pick<Staff, 'id' | 'name'> | null;
  cities?: Pick<City, 'name'> | null;
  work_types?: Pick<WorkType, 'name' | 'work_categories'> | null;
}

// --- 복수 입금 ---
export interface Payment {
  id: string;
  project_id: string;
  payment_type: string; // 자부담착수금, 추가공사비, 시지원금잔금
  amount: number;
  payment_date: string | null;
  payer_name: string | null;
  note: string | null;
  created_at: string;
}

// --- 목록 표시용 경량 타입 ---
export interface ProjectListItem {
  id: string;
  building_name: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  road_address: string | null;
  staff: Pick<Staff, 'id' | 'name'> | null;
  work_type: string | null;
  status: ProjectStatus;
  note: string | null;
  total_cost: number;
  outstanding: number;
}

// --- 단계 변경 이력 ---
export interface StatusLog {
  id: string;
  project_id: string;
  staff_id: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
}

// --- 생성된 서류 ---
export interface Document {
  id: string;
  project_id: string;
  template_id: string | null;
  name: string | null;
  file_path: string | null;
  doc_type: string | null;
  created_at: string;
}

// --- 첨부파일 ---
export interface Attachment {
  id: string;
  project_id: string;
  name: string | null;
  file_path: string | null;
  file_type: string | null;
  created_at: string;
}

// ============================================
// 할 일 / 시킨 일 (tasks 테이블)
// ============================================

export interface Task {
  id: string;
  content: string;
  assigned_to: string | null;   // 수행자 staff_id
  assigned_by: string | null;   // 지시자 staff_id
  deadline: string | null;      // YYYY-MM-DD
  done: boolean;
  done_at: string | null;
  project_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// 대시보드 AI 브리핑
// ============================================

export type BriefingCategory = 'now' | 'today' | 'week';

export type BriefingRuleKey =
  | 'today_schedule_imminent'     // 오늘 일정 곧 시작
  | 'consent_missing'              // 동의서 단계 필수 누락
  | 'application_missing'          // 신청서 제출 누락
  | 'survey_time_missing'          // 실측 시간 미입력
  | 'application_stale'            // 신청서 제출 3일+ 방치
  | 'completion_doc_stale'         // 완료서류 5일+ 미제출
  | 'stage_upgradeable'            // 다음 단계 전환 가능
  | 'week_schedule_upcoming'       // 이번 주 일정 예고
  | 'payment_incoming_info';       // 입금 예정 (정보성)

export interface BriefingItem {
  id: string;                      // rule_key + project_id or schedule_id
  category: BriefingCategory;      // now | today | week
  rule: BriefingRuleKey;           // 어떤 룰이 이 카드를 만들었는지
  priority: number;                // 카테고리 내부 정렬 (낮을수록 먼저)
  title: string;                   // 한 줄 제목 (카드 전면)
  reason: string;                  // "왜 이 카드?" 근거 설명
  actionHref: string | null;       // 클릭 시 이동 경로
  actionLabel: string | null;      // 액션 버튼 텍스트
  projectId: string | null;        // 관련 프로젝트 ID
  scheduleId: string | null;       // 관련 일정 ID
  meta?: Record<string, string | number | null>; // 추가 데이터 (주소/연락처 등)
}

export interface BriefingResponse {
  generatedAt: string;             // ISO timestamp
  staffId: string | null;          // 필터 기준 담당자 (null = 전체)
  summary: string;                 // 상단 한 줄 요약
  items: BriefingItem[];
  info: {
    outstandingCount: number;      // 미수금 건수 (정보성)
    outstandingTotal: number;      // 미수금 총액 (정보성, 경고 아님)
    todayScheduleCount: number;
  };
}
