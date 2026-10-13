-- 027_leave_carryover.sql
-- 연차 '이월 사용 기한(개월)' 설정.
--
-- 입사 1년이 지날 때 안 쓴 연차는 다음 해로 이월되고, 이월분은 이 기간 안에만 쓸 수 있다.
-- 기간이 지나면 이월분은 자동으로 사라진다(화면에 '이월 없음'). 값은 화면 supabase
-- 클라이언트(anon)가 직접 읽고 쓰므로 leave_requests와 동일하게 RLS를 켜지 않는다
-- (CLAUDE.md "RLS 지금 ENABLE 금지"). 값 변경은 화면에서 직책(대표·관리자·경리)으로 막는다.
-- 추가 전용. 기존 테이블·정책 변경 없음.

CREATE TABLE IF NOT EXISTS leave_settings (
  id INT PRIMARY KEY DEFAULT 1,
  carryover_months INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_settings_singleton CHECK (id = 1)
);
INSERT INTO leave_settings (id, carryover_months) VALUES (1, 1)
  ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE leave_settings IS '연차 전역 설정 (이월 사용 기한 등, 단일 행)';

-- anon/authenticated가 화면에서 직접 접근 (RLS 미사용 — leave_requests와 동일)
GRANT SELECT, INSERT, UPDATE ON leave_settings TO anon, authenticated;

-- 롤백 (필요 시 수동 실행)
-- DROP TABLE IF EXISTS leave_settings;
