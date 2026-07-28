-- 013_expenses_approval_link.sql
-- 지출결의서 최종 승인 완료 처리(채번 + 지출 생성)의 재개 경로는 결재선 선점을
-- 건너뛰므로, 승인 버튼 더블클릭 등으로 요청이 겹치면 같은 지급정보 행에서
-- expenses가 두 번 생성될 수 있다(실제 회계가 두 배로 잡힘). 앱 코드만으로는
-- 이 동시성 창을 완전히 막을 수 없어 DB 유일 제약으로 직접 차단한다.
-- RLS 미적용: 현행 구조(프론트 anon 클라이언트, 타 테이블 RLS off)와 동일.

-- 적용

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS expense_report_payment_id UUID REFERENCES expense_report_payments(id);

-- 부분 유니크 인덱스: expense_report_payment_id가 NULL인 기존/일반 지출 행은
-- 몇 개가 있어도 무관하다. 값이 채워진 행만 지급정보 1건당 지출 1건으로 강제한다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_report_payment
  ON expenses(expense_report_payment_id)
  WHERE expense_report_payment_id IS NOT NULL;

COMMENT ON COLUMN expenses.expense_report_payment_id IS
  '지출결의서 승인으로 생성된 경우 원본 지급정보 행. 부분 유니크 인덱스로 중복 생성을 DB가 차단한다.';

-- 롤백 (필요 시 수동 실행)
-- DROP INDEX IF EXISTS uq_expenses_report_payment;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS expense_report_payment_id;
