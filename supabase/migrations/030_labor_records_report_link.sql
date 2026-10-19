-- 030_labor_records_report_link.sql
-- 근무표 행이 어느 노무비 결의서로 올라갔는지 기록한다.
--
-- 화면을 둘로 나눈다(2026-10-15): 「결의서 만들기」 탭은 아직 안 올린 행만 보여주는
-- 작업대이고, 「근무지출관리」 탭은 승인된 것을 월·공사건별로 보는 대장이다.
-- 승인 여부는 결의서의 status 를 보면 되므로 따로 칸을 두지 않는다 — 값이 두 벌이 되면
-- 어긋난다. 결의서가 지워지면 연결만 풀고 근무표 행은 남긴다(작업대로 돌아온다).

ALTER TABLE labor_records
  ADD COLUMN IF NOT EXISTS expense_report_id UUID REFERENCES expense_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_labor_records_report ON labor_records(expense_report_id);

COMMENT ON COLUMN labor_records.expense_report_id IS '이 행을 담아 올린 노무비 지출결의서. 비우면 아직 안 올린 행(작업대에 보인다)';

-- 롤백 (필요 시 수동)
-- DROP INDEX IF EXISTS idx_labor_records_report;
-- ALTER TABLE labor_records DROP COLUMN IF EXISTS expense_report_id;
