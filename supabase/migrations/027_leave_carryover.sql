-- 027_leave_carryover.sql
-- 연차 이월분 '소멸 기록'과 '이월 사용 기한(개월)' 설정.
--
-- 화면 supabase 클라이언트(anon)가 직접 읽고 쓴다 → leave_requests와 동일하게 RLS를
-- 켜지 않는다 (CLAUDE.md "RLS 지금 ENABLE 금지"). 소멸·기한 변경 권한은 화면에서
-- 직책(대표·관리자·경리)으로 막는다 — src/lib/leave/permissions.ts.
-- 추가 전용. 기존 테이블·정책 변경 없음.

-- 전역 설정 (단일 행): 이월분을 며칠(개월) 더 쓸 수 있는지
CREATE TABLE IF NOT EXISTS leave_settings (
  id INT PRIMARY KEY DEFAULT 1,
  carryover_months INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_settings_singleton CHECK (id = 1)
);
INSERT INTO leave_settings (id, carryover_months) VALUES (1, 1)
  ON CONFLICT (id) DO NOTHING;

-- 이월분 소멸 기록: 관리자·경리가 '소멸' 처리하면 한 줄 쌓인다
CREATE TABLE IF NOT EXISTS leave_carryover_forfeits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,       -- 소멸된 이월이 속한 연차 구간의 시작일(입사 기념일)
  days NUMERIC NOT NULL,
  forfeited_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  forfeited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leave_forfeits_staff ON leave_carryover_forfeits (staff_id);

COMMENT ON TABLE leave_settings IS '연차 전역 설정 (이월 사용 기한 등, 단일 행)';
COMMENT ON TABLE leave_carryover_forfeits IS '연차 이월분 소멸 기록 (대표·관리자·경리가 처리)';

-- anon/authenticated가 화면에서 직접 접근 (RLS 미사용 — leave_requests와 동일)
GRANT SELECT, INSERT, UPDATE ON leave_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON leave_carryover_forfeits TO anon, authenticated;

-- 롤백 (필요 시 수동 실행)
-- DROP TABLE IF EXISTS leave_carryover_forfeits;
-- DROP TABLE IF EXISTS leave_settings;
