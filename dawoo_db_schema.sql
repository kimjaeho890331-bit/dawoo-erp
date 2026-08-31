-- ============================================
-- 다우건설 고객관리 시스템 DB 스키마
-- Supabase (PostgreSQL)
-- 2026.04.06
-- IF NOT EXISTS 적용 — 이미 있는 테이블은 건너뜀
-- ============================================

-- 1. 직원 테이블
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT '직원',  -- 관리자, 직원
  email TEXT UNIQUE,         -- 카카오 OAuth 연결 이메일
  is_verified BOOLEAN DEFAULT false,  -- 초대코드 인증 완료 여부
  telegram_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 시(지자체) 테이블
CREATE TABLE IF NOT EXISTS cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,  -- 수원, 성남, 안양...
  code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 공사종류 테이블 (대분류)
CREATE TABLE IF NOT EXISTS work_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,  -- 수도, 소규모
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. 공사종류 테이블 (소분류)
CREATE TABLE IF NOT EXISTS work_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES work_categories(id),
  name TEXT NOT NULL,  -- 옥내수도, 공용수도, 아파트공용, 옥상방수, 새빛, 녹색, 공동주택...
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. 접수대장 (핵심 테이블 - A안: 모든 항목 다 넣기)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- === 항상 보이는 항목 ===
  building_name TEXT,              -- 빌라명
  staff_id UUID REFERENCES staff(id),  -- 담당자
  road_address TEXT,               -- 도로명주소
  jibun_address TEXT,              -- 지번주소
  region TEXT,                     -- 지역명
  city_id UUID REFERENCES cities(id),  -- 시
  work_type_id UUID REFERENCES work_types(id),  -- 공사종류(소분류)
  owner_name TEXT,                 -- 소유주명
  owner_phone TEXT,                -- 소유주 연락처
  tenant_phone TEXT,               -- 세입자 연락처
  total_cost INTEGER DEFAULT 0,    -- 총공사비
  self_pay INTEGER DEFAULT 0,      -- 자부담금
  city_support INTEGER DEFAULT 0,  -- 시지원금

  -- === 1단계: 접수~신청서 제출 ===
  area NUMERIC,                    -- 면적(㎡)
  unit_count INTEGER,              -- 세대수
  approval_date DATE,              -- 사용승인일
  application_date DATE,           -- 신청서 제출일
  application_submitter TEXT,      -- 신청서 제출자
  survey_date DATE,                -- 실측일
  survey_staff TEXT,               -- 실측담당자

  -- === 2단계: 승인~공사 ===
  construction_date DATE,          -- 시공일
  contractor TEXT,                 -- 시공업체/직영
  equipment TEXT,                  -- 장비/일용직
  down_payment INTEGER DEFAULT 0,  -- 착수금(계약금)

  -- === 3단계: 완료서류 제출 ===
  completion_doc_date DATE,        -- 완료서류 제출일
  completion_submitter TEXT,       -- 완료서류 제출자

  -- === 4단계: 수금 ===
  outstanding INTEGER DEFAULT 0,   -- 미수금
  balance INTEGER DEFAULT 0,       -- 잔금
  payment_date DATE,               -- 입금내역 날짜 (레거시, payments 테이블로 이전)
  payer_name TEXT,                 -- 입금자명 (레거시, payments 테이블로 이전)
  collected INTEGER DEFAULT 0,     -- 수금액

  -- === 추가 필드 (고도화) ===
  additional_cost INTEGER DEFAULT 0, -- 추가공사금
  consent_date DATE,               -- 동의서 수령일
  construction_end_date DATE,      -- 공사완료일
  approval_received_date DATE,     -- 승인일 (2단계, approval_date=사용승인일과 구분)
  field_memo TEXT,                 -- 현장메모 (실측 시)
  area_result TEXT,                -- 면적결과 (실측 시)

  -- === 수도 전용 ===
  water_work_type TEXT,            -- 공사종류 (옥내/공용/아파트)
  unit_password TEXT,              -- 세대 비밀번호
  direct_worker TEXT,              -- 직영 시공자

  -- === 소규모 전용 ===
  support_program TEXT,            -- 지원사업 종류 (새빛/녹색/공동주택)
  external_contractor TEXT,        -- 시공업체
  other_contractor TEXT,           -- 기타 시공업체
  design_amount INTEGER DEFAULT 0, -- 설계금액
  receipt_date DATE,               -- 접수일

  -- === 전유부/표제부 자동 데이터 (화면 안보여도 DB에 있음) ===
  dong TEXT,                       -- 동
  ho TEXT,                         -- 호
  bunji TEXT,                      -- 번지
  exclusive_area NUMERIC,          -- 전유면적
  land_area NUMERIC,               -- 대지면적
  building_area NUMERIC,           -- 건축면적
  total_floor_area NUMERIC,        -- 연면적
  building_use TEXT,               -- 건축물용도

  -- === 통장 정보 ===
  bank_name TEXT,                  -- 은행명
  account_number TEXT,             -- 계좌번호
  account_holder TEXT,             -- 예금주

  -- === 기타 ===
  status TEXT DEFAULT '문의',      -- 현재 단계
  note TEXT,                       -- 상담내용/메모
  cancel_reason TEXT,              -- 취소사유
  year INTEGER,                    -- 진행연도
  extra_fields JSONB DEFAULT '{}', -- 예비 확장 칸

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5-1. 복수 입금 (payments)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL,        -- 자부담착수금, 추가공사비, 시지원금잔금
  amount INTEGER NOT NULL DEFAULT 0,
  payment_date DATE,
  payer_name TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. 단계 변경 이력
CREATE TABLE IF NOT EXISTS status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. 서류 템플릿 (서류함)
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id UUID REFERENCES cities(id),
  work_type_id UUID REFERENCES work_types(id),
  name TEXT NOT NULL,              -- 템플릿 이름
  file_path TEXT,                  -- Supabase Storage 경로
  field_mapping JSONB DEFAULT '{}', -- 폼필드 <-> DB칼럼 매핑
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. 생성된 서류
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES templates(id),
  name TEXT,                       -- 서류 이름
  file_path TEXT,                  -- 생성된 PDF 경로
  doc_type TEXT,                   -- 신청서, 견적서, 완료보고서 등
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. 첨부파일 (통장사본, 사진 등)
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT,
  file_path TEXT,
  file_type TEXT,                  -- 통장사본, 공사전사진, 공사후사진 등
  created_at TIMESTAMPTZ DEFAULT now()
);

-- === 인덱스 (IF NOT EXISTS) ===
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_city ON projects(city_id);
CREATE INDEX IF NOT EXISTS idx_projects_work_type ON projects(work_type_id);
CREATE INDEX IF NOT EXISTS idx_projects_year ON projects(year);
CREATE INDEX IF NOT EXISTS idx_projects_building ON projects(building_name);
CREATE INDEX IF NOT EXISTS idx_status_logs_project ON status_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_project ON payments(project_id);

-- === 단계 목록 (AI 내부 10단계) ===
COMMENT ON COLUMN projects.status IS '
  화면 4단계:
    1단계: 접수~신청서제출 (문의,실사,견적전달,동의서,신청서제출)
    2단계: 승인~공사 (승인,착공계,공사)
    3단계: 완료서류제출
    4단계: 수금 (입금,완료)

  AI 내부 10단계:
    문의 > 실사 > 견적전달 > 동의서 > 신청서제출
    > 승인 > 착공계 > 공사 > 완료서류제출 > 입금
';

-- === 15개 시 초기 데이터 (중복 무시) ===
INSERT INTO cities (name) VALUES
  ('수원'),('성남'),('안양'),('부천'),('광명'),
  ('시흥'),('안산'),('군포'),('의왕'),('과천'),
  ('용인'),('화성'),('오산'),('평택'),('하남')
ON CONFLICT (name) DO NOTHING;

-- === 공사 대분류 초기 데이터 (중복 무시) ===
INSERT INTO work_categories (name) VALUES ('수도'), ('소규모')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 23. 지출결의서 전자결재 (012_expense_approval.sql)
-- ============================================
-- 카카오워크 전자결재 대체. 문서 1건 = expense_reports 1행 + 지급정보/상세내용/결재선/첨부 자식 행
-- RLS 미적용: 현행 구조(프론트 anon 클라이언트, 타 테이블 RLS off)와 동일.
--             쓰기 보호는 /api/approval/* 서버 라우트에서 수행한다.

CREATE TABLE IF NOT EXISTS expense_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no TEXT UNIQUE,                          -- CDV-26-000158. 결재 완료 시 채번
  title TEXT NOT NULL,                         -- 기안제목 (50자)
  status TEXT NOT NULL DEFAULT 'draft',        -- draft/pending/approved/rejected/withdrawn
  drafter_staff_id UUID NOT NULL REFERENCES staff(id),
  submitted_at TIMESTAMPTZ,                    -- 상신일시
  completed_at TIMESTAMPTZ,                    -- 결재완료일시
  total_amount BIGINT NOT NULL DEFAULT 0,      -- 지급 총계 = payments 합계
  category TEXT,                               -- 계정과목. 최종 승인 시 결재자가 선택
  body_html TEXT,                              -- 본문 에디터
  retention_years INT NOT NULL DEFAULT 5,      -- 보존연한 (표시용)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,       -- 입찰/수의 현장. 비우면 현장 없음
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL  -- 지원사업 접수 건. 비우면 현장 없음
);

CREATE TABLE IF NOT EXISTS expense_report_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  seq INT NOT NULL DEFAULT 0,
  vendor_name TEXT NOT NULL,
  amount BIGINT NOT NULL,
  pay_request_date DATE NOT NULL,
  bank TEXT NOT NULL,
  account_no TEXT NOT NULL,
  business_no TEXT,
  expense_id UUID REFERENCES expenses(id)      -- 승인 시 생성된 지출. 중복 생성 방지 키
);

CREATE TABLE IF NOT EXISTS expense_report_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  seq INT NOT NULL DEFAULT 0,
  vendor_name TEXT,
  account TEXT,
  content TEXT,
  dept_name TEXT,
  amount BIGINT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS expense_report_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  seq INT NOT NULL,                            -- 결재 순서. 작을수록 먼저
  staff_id UUID NOT NULL REFERENCES staff(id),
  role TEXT NOT NULL,                          -- approval / cooperation
  state TEXT NOT NULL DEFAULT 'waiting',       -- waiting / approved / rejected
  acted_at TIMESTAMPTZ,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS expense_report_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_report_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  ref_report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS doc_sequences (
  form_abbr TEXT NOT NULL,
  year INT NOT NULL,
  last_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (form_abbr, year)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_er_status ON expense_reports(status);
CREATE INDEX IF NOT EXISTS idx_er_drafter ON expense_reports(drafter_staff_id);
CREATE INDEX IF NOT EXISTS idx_er_submitted ON expense_reports(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_report ON expense_report_payments(report_id);
CREATE INDEX IF NOT EXISTS idx_erd_report ON expense_report_details(report_id);
CREATE INDEX IF NOT EXISTS idx_erl_report ON expense_report_lines(report_id);
CREATE INDEX IF NOT EXISTS idx_erl_staff ON expense_report_lines(staff_id, state);
CREATE INDEX IF NOT EXISTS idx_erf_report ON expense_report_files(report_id);
CREATE INDEX IF NOT EXISTS idx_push_staff ON push_subscriptions(staff_id);

-- 카카오워크 마지막 문서번호가 CDV-26-000157이므로 158부터 이어간다
INSERT INTO doc_sequences (form_abbr, year, last_no)
VALUES ('CDV', 2026, 157)
ON CONFLICT (form_abbr, year) DO NOTHING;

-- 문서번호 원자적 채번. 동시에 두 명이 승인해도 번호가 겹치지 않는다.
CREATE OR REPLACE FUNCTION next_doc_no(p_form_abbr TEXT, p_year INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_no INT;
BEGIN
  INSERT INTO doc_sequences (form_abbr, year, last_no)
  VALUES (p_form_abbr, p_year, 0)
  ON CONFLICT (form_abbr, year) DO NOTHING;

  UPDATE doc_sequences
     SET last_no = last_no + 1
   WHERE form_abbr = p_form_abbr AND year = p_year
  RETURNING last_no INTO v_no;

  RETURN p_form_abbr || '-' || lpad((p_year % 100)::TEXT, 2, '0') || '-' || lpad(v_no::TEXT, 6, '0');
END
$$;

COMMENT ON TABLE expense_reports IS '지출결의서 문서 본체';
COMMENT ON TABLE expense_report_payments IS '지급 정보 — 실제 송금 대상 1행';
COMMENT ON TABLE expense_report_details IS '상세 내용 — 비용 내역 (선택)';
COMMENT ON TABLE expense_report_lines IS '결재선 — seq 순서대로 결재/협조';
COMMENT ON TABLE doc_sequences IS '문서번호 순번. 2026년 CDV는 157부터 시작(카카오워크 이어받기)';
COMMENT ON FUNCTION next_doc_no IS '문서번호 원자적 채번 — CDV-26-000158 형식';

-- ============================================
-- 24. expenses ↔ 지출결의서 연결 + 중복 생성 방지 (013_expenses_approval_link.sql)
-- ============================================
-- 최종 승인 완료 처리의 재개 경로는 결재선 선점을 건너뛰므로, 승인 버튼 더블클릭 등
-- 요청이 겹치면 같은 지급정보 행에서 expenses가 두 번 생성될 수 있다. 앱 코드만으로는
-- 이 동시성 창을 완전히 막을 수 없어 DB 유일 제약으로 직접 차단한다.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS expense_report_payment_id UUID REFERENCES expense_report_payments(id);

-- 부분 유니크 인덱스: NULL(일반 지출)은 몇 개든 무관, 값이 채워진 행만
-- 지급정보 1건당 지출 1건으로 강제한다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_report_payment
  ON expenses(expense_report_payment_id)
  WHERE expense_report_payment_id IS NOT NULL;

COMMENT ON COLUMN expenses.expense_report_payment_id IS
  '지출결의서 승인으로 생성된 경우 원본 지급정보 행. 부분 유니크 인덱스로 중복 생성을 DB가 차단한다.';

-- ============================================
-- 25. 지출결의서 결재 행위자 감사 컬럼 (014_approval_actor_audit.sql)
-- ============================================
-- 2026-07-30, 행위자 판정 방식 변경(로그인 계정 대신 화면에서 직접 선택)에 대한 보완.
-- 화면에서 고른 직원과 별개로 실제 조작한 로그인 계정 이메일을 남겨 분쟁 시 추적한다.

ALTER TABLE expense_reports
  ADD COLUMN IF NOT EXISTS drafted_by_email TEXT;   -- 기안 시점의 로그인 계정 이메일. 기존 행은 NULL

ALTER TABLE expense_report_lines
  ADD COLUMN IF NOT EXISTS acted_by_email TEXT;      -- 승인/반려 시점의 로그인 계정 이메일. 기존 행은 NULL

COMMENT ON COLUMN expense_reports.drafted_by_email IS
  '기안 시점의 로그인 계정 이메일(감사용, 화면 비노출). 행위자는 actor_staff_id로 화면에서 고른 사람이다.';
COMMENT ON COLUMN expense_report_lines.acted_by_email IS
  '승인/반려 처리 시점의 로그인 계정 이메일(감사용, 화면 비노출). 행위자는 actor_staff_id로 화면에서 고른 사람이다.';

-- ============================================
-- 26. 로그인 계정 ↔ 직원 다중 이메일 매핑 (015_staff_emails.sql, 016_staff_emails_audit.sql)
-- ============================================
-- 카카오/네이버 등 로그인 계정과 staff.email(단일)이 거의 안 맞고, 한 사람이
-- 계정을 여러 개 섞어 써서 1:N 매핑 테이블을 둔다. staff.email은 그대로 유지
-- ("대표 이메일" 표시용). RLS 미적용 — 다른 테이블과 동일 방침.
-- 016: linked_by_email/updated_at 추가 — "누가 언제 이 매핑을 걸었나" 이력용.

CREATE TABLE IF NOT EXISTS staff_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_by_email TEXT,        -- 016: 이 매핑을 실행한 로그인 계정(연결 이력 추적용)
  updated_at TIMESTAMPTZ        -- 016: 마지막 생성/갱신 시각
);

CREATE INDEX IF NOT EXISTS idx_staff_emails_staff ON staff_emails(staff_id);

COMMENT ON TABLE staff_emails IS
  '로그인 계정 이메일 ↔ 직원 매핑(1:N). email은 UNIQUE — 한 계정이 두 사람에게 붙지 않는다.';

-- ============================================
-- 27. 건축물대장 발급 대기열 (019_building_ledger_requests.sql)
-- ============================================
-- 접수대장(projects)과 별도 테이블. 직원 신청 → 세움터 발급 → 직원 확인.
-- projects 컬럼 추가 없음. 기존 RLS 변경 없음.

CREATE TABLE IF NOT EXISTS building_ledger_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'issued', 'confirmed')),
  address_used TEXT,
  drive_folder_id TEXT,
  drive_folder_url TEXT,
  drive_file_id TEXT,
  drive_file_url TEXT,
  batch_key TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS building_ledger_requests_one_open_per_project
  ON building_ledger_requests (project_id)
  WHERE status IN ('requested', 'issued');

CREATE INDEX IF NOT EXISTS building_ledger_requests_status_requested_at_idx
  ON building_ledger_requests (status, requested_at);

-- ============================================
-- 28. 내 현장 보드 (021_my_sites_board.sql)
-- ============================================
-- site_tasks 는 원래 공정 캘린더용(is_confirmed=확정). 완료는 is_done.
-- site_id NULL = 현장 없는 일(이번 주). hidden_from_my_sites = 보드에서 넘김.
-- 기존 site_tasks / sites RLS 정책은 변경하지 않는다.

CREATE TABLE IF NOT EXISTS site_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  task_name TEXT NOT NULL,
  contractor_name TEXT,
  worker_name TEXT,
  start_date DATE,
  end_date DATE,
  color TEXT,
  is_confirmed BOOLEAN DEFAULT false,
  is_done BOOLEAN NOT NULL DEFAULT false,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE site_tasks
  ADD COLUMN IF NOT EXISTS is_done BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS hidden_from_my_sites BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- 29. 공유/중요 ID·PW (022_credential_entries.sql)
-- ============================================
-- /ids = kind shared (전 직원), /ids-private = kind private (관리자만).
-- API(service_role)만 접근. anon/authenticated REVOKE. 기존 RLS 정책 변경 없음.
-- 시드 없음.

CREATE TABLE IF NOT EXISTS credential_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('shared', 'private')),
  name TEXT NOT NULL,
  url TEXT,
  login_id TEXT,
  password TEXT,
  memo TEXT,
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credential_entries_kind ON credential_entries (kind);
