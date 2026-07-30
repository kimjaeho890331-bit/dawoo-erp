-- 014_approval_actor_audit.sql
-- 지출결의서 결재 행위자 감사(audit) 컬럼
-- 2026-07-30, 행위자 판정 방식 변경(docs/superpowers/specs/2026-07-25-expense-approval-design.md
-- "행위자를 로그인 계정에서 뽑지 않고 화면에서 고르는 이유" 절)에 대한 보완 조치.
-- 운영 staff 테이블에 이메일이 사실상 채워져 있지 않고 직원들이 카카오·네이버 등
-- 여러 계정을 섞어 써서, 로그인 계정으로 행위자(staff)를 확정하던 당초 설계로는
-- 아무도 기안조차 할 수 없었다. 그래서 행위자(누구 이름으로 기안·결재했는가)는
-- 화면에서 직접 고르는 방식(actor_staff_id)으로 바꿨다.
-- 이 컬럼들은 그 변경의 대가를 줄이기 위한 보완책이다: 화면에서 고른 직원과
-- 별개로 실제 조작한 로그인 계정 이메일을 남겨서, 분쟁이 생기면 누가 실제로
-- 눌렀는지 추적할 수 있게 한다. 화면에는 노출하지 않는다.
-- RLS 미적용: 현행 구조(프론트 anon 클라이언트, 타 테이블 RLS off)와 동일.

-- 적용
ALTER TABLE expense_reports
  ADD COLUMN IF NOT EXISTS drafted_by_email TEXT;   -- 기안(신규 저장) 시점의 로그인 계정 이메일. 기존 행은 NULL

ALTER TABLE expense_report_lines
  ADD COLUMN IF NOT EXISTS acted_by_email TEXT;      -- 승인/반려 처리 시점의 로그인 계정 이메일. 기존 행은 NULL

COMMENT ON COLUMN expense_reports.drafted_by_email IS
  '기안 시점의 로그인 계정 이메일(감사용, 화면 비노출). 행위자는 actor_staff_id로 화면에서 고른 사람이며, 이 값은 실제 조작 계정 추적용이다.';
COMMENT ON COLUMN expense_report_lines.acted_by_email IS
  '승인/반려 처리 시점의 로그인 계정 이메일(감사용, 화면 비노출). 행위자는 actor_staff_id로 화면에서 고른 사람이며, 이 값은 실제 조작 계정 추적용이다.';

-- 롤백 (필요 시 수동 실행)
-- ALTER TABLE expense_report_lines DROP COLUMN IF EXISTS acted_by_email;
-- ALTER TABLE expense_reports DROP COLUMN IF EXISTS drafted_by_email;
