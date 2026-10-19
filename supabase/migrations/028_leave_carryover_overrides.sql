-- 028_leave_carryover_overrides.sql
-- 직원별 '이월 수량(일)' 수동 수정.
--
-- 입사 1년이 지날 때 자동 계산되는 이월 일수를, 관리자·경리가 직원마다 손으로
-- 바로잡을 수 있게 한다(예: 중간 입사·특별휴가 정산 등 자동 계산과 다른 경우).
-- 값이 있으면 연차 화면이 그 구간의 이월을 계산값 대신 이 값으로 쓰고,
-- 수동 지정분은 N개월 기한이 아니라 그 구간 끝(다음 입사기념일)까지 유효하다
-- (src/lib/leave/balance.ts).
--
-- (staff_id, period_start) 하나당 한 행 — period_start는 해당 연차 구간의 시작일.
-- leave_requests·leave_settings와 동일하게 RLS는 켜지 않는다(CLAUDE.md "RLS 지금
-- ENABLE 금지"). 누가 고칠 수 있는지는 화면에서 직책(관리자·경리)으로 막는다.
-- 추가 전용. 기존 테이블·정책 변경 없음.

CREATE TABLE IF NOT EXISTS leave_carryover_overrides (
  staff_id     UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  days         INT  NOT NULL DEFAULT 0 CHECK (days >= 0 AND days <= 60),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, period_start)
);

COMMENT ON TABLE leave_carryover_overrides IS '직원별 이월 수량 수동 수정 (구간 시작일 기준, 관리자·경리만 변경)';

-- anon/authenticated가 화면에서 직접 접근 (RLS 미사용 — leave_requests와 동일)
GRANT SELECT, INSERT, UPDATE, DELETE ON leave_carryover_overrides TO anon, authenticated;

-- 롤백 (필요 시 수동 실행)
-- DROP TABLE IF EXISTS leave_carryover_overrides;
