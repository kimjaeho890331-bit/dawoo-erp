-- =============================================
-- 캘린더 + 현장 + 직원 종합 마이그레이션
-- 실행: Supabase SQL Editor에 전체 복사 → Run
-- =============================================

-- 1. schedules: 다중 담당자 지원
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS staff_ids UUID[];
CREATE INDEX IF NOT EXISTS idx_schedules_staff_ids ON schedules USING GIN (staff_ids);

-- 2. sites: 계약 종류 (수의/입찰)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS contract_type TEXT;

-- 3. staff: 연락처 분리 + 사번 + 4대보험
ALTER TABLE staff ADD COLUMN IF NOT EXISTS work_phone TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS personal_phone TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS employee_no TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS ins_pension BOOLEAN DEFAULT false;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS ins_health BOOLEAN DEFAULT false;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS ins_employment BOOLEAN DEFAULT false;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS ins_industrial BOOLEAN DEFAULT false;

-- 기존 phone 값을 work_phone에 1회 복사
UPDATE staff SET work_phone = phone WHERE work_phone IS NULL AND phone IS NOT NULL;

-- 4. 직원 첨부파일 (연봉계약서/통장사본/신분증사본)
CREATE TABLE IF NOT EXISTS staff_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('salary_contract', 'bank_account', 'id_card')),
  file_url TEXT NOT NULL,
  file_name TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_attachments_staff ON staff_attachments(staff_id);
ALTER TABLE staff_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_attachments_all" ON staff_attachments;
CREATE POLICY "staff_attachments_all" ON staff_attachments FOR ALL USING (true) WITH CHECK (true);

-- 5. 직원 초대 코드
CREATE TABLE IF NOT EXISTS staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  used_by_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_code ON staff_invitations(code) WHERE used_at IS NULL;
ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_invitations_all" ON staff_invitations;
CREATE POLICY "staff_invitations_all" ON staff_invitations FOR ALL USING (true) WITH CHECK (true);
