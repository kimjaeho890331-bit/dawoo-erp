-- ============================================
-- 다우건설 고객관리 시스템 DB 스키마
-- Supabase (PostgreSQL)
-- 2026.04.06
-- ============================================

-- 1. 직원 테이블
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT '직원',  -- 관리자, 직원
  telegram_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 시(지자체) 테이블
CREATE TABLE cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,  -- 수원, 성남, 안양...
  code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 공사종류 테이블 (대분류)
CREATE TABLE work_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,  -- 수도, 소규모
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. 공사종류 테이블 (소분류)
CREATE TABLE work_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES work_categories(id),
  name TEXT NOT NULL,  -- 옥내수도, 공용수도, 아파트공용, 옥상방수, 새빛, 녹색, 공동주택...
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. 접수대장 (핵심 테이블 - A안: 모든 항목 다 넣기)
CREATE TABLE projects (
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
  payment_date DATE,               -- 입금내역 날짜
  payer_name TEXT,                 -- 입금자명
  collected INTEGER DEFAULT 0,     -- 수금액
  
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

-- 6. 단계 변경 이력
CREATE TABLE status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. 서류 템플릿 (서류함)
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id UUID REFERENCES cities(id),
  work_type_id UUID REFERENCES work_types(id),
  name TEXT NOT NULL,              -- 템플릿 이름
  file_path TEXT,                  -- Supabase Storage 경로
  field_mapping JSONB DEFAULT '{}', -- 폼필드 <-> DB칼럼 매핑
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. 생성된 서류
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES templates(id),
  name TEXT,                       -- 서류 이름
  file_path TEXT,                  -- 생성된 PDF 경로
  doc_type TEXT,                   -- 신청서, 견적서, 완료보고서 등
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. 첨부파일 (통장사본, 사진 등)
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT,
  file_path TEXT,
  file_type TEXT,                  -- 통장사본, 공사전사진, 공사후사진 등
  created_at TIMESTAMPTZ DEFAULT now()
);

-- === 인덱스 ===
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_city ON projects(city_id);
CREATE INDEX idx_projects_work_type ON projects(work_type_id);
CREATE INDEX idx_projects_year ON projects(year);
CREATE INDEX idx_projects_building ON projects(building_name);
CREATE INDEX idx_status_logs_project ON status_logs(project_id);
CREATE INDEX idx_documents_project ON documents(project_id);

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

-- === 15개 시 초기 데이터 ===
INSERT INTO cities (name) VALUES 
  ('수원'),('성남'),('안양'),('부천'),('광명'),
  ('시흥'),('안산'),('군포'),('의왕'),('과천'),
  ('용인'),('화성'),('오산'),('평택'),('하남');

-- === 공사 대분류 초기 데이터 ===
INSERT INTO work_categories (name) VALUES ('수도'), ('소규모');
