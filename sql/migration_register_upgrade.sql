-- =============================================
-- 접수대장 고도화 마이그레이션
-- 실행: Supabase SQL Editor에서 실행
-- =============================================

-- 1. payments 테이블 (복수 입금)
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

CREATE INDEX IF NOT EXISTS idx_payments_project ON payments(project_id);

-- 2. projects 테이블 누락 컬럼 추가
ALTER TABLE projects ADD COLUMN IF NOT EXISTS additional_cost INTEGER DEFAULT 0;       -- 추가공사금
ALTER TABLE projects ADD COLUMN IF NOT EXISTS consent_date DATE;                        -- 동의서 수령일
ALTER TABLE projects ADD COLUMN IF NOT EXISTS construction_end_date DATE;               -- 공사완료일
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval_received_date DATE;              -- 승인일 (2단계)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS field_memo TEXT;                          -- 현장메모 (실측 시)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS area_result TEXT;                         -- 면적결과 (실측 시)
