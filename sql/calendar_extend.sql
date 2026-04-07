-- 업무 캘린더용 schedules 테이블 확장
-- 기존 schedules는 site_id 전용이었으나, 통합 캘린더로 확장
-- 실행: Supabase SQL Editor

-- 1. schedule_type 컬럼 추가 (일정 종류 구분)
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'site'
  CHECK (schedule_type IN ('site', 'project', 'personal', 'promo', 'ai'));
-- site: 현장관리 공정
-- project: 접수대장 (실측/시공/제출)
-- personal: 개인일정/회의
-- promo: 홍보
-- ai: AI 제안

-- 2. staff_id 추가 (담당 직원)
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id);

-- 3. project_id 추가 (접수대장 연동)
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- 4. site_id를 nullable로 변경 (개인일정은 현장 없음)
ALTER TABLE schedules ALTER COLUMN site_id DROP NOT NULL;

-- 5. all_day 추가
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS all_day BOOLEAN DEFAULT true;

-- 6. 인덱스
CREATE INDEX IF NOT EXISTS idx_schedules_type ON schedules(schedule_type);
CREATE INDEX IF NOT EXISTS idx_schedules_staff ON schedules(staff_id);
CREATE INDEX IF NOT EXISTS idx_schedules_dates ON schedules(start_date, end_date);
