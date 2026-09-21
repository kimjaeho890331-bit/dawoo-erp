-- 노무비 준공 가정산: 계정과목 키를 「노무비」로 맞추고, 신규 행은 현장/접수 연결을 강제한다.
-- 기존 미연결 행은 고치지 않는다(site 추정 금지). 제목→카테고리만 분명한 경우만 고친다.
-- RLS는 켜지 않는다. 테이블 DROP 없음.
--
-- 2026-09-21 운영 스냅샷 (적용 전 조회)
-- expenses: 노무비 34 / 연결 12 / 미연결 22
--           제목 노무·카테고리 다름 1 (「노무비 및 퇴직공제」=기타 — 후불 공과 혼재, 자동 수정 안 함)
--           제목→노무비 분명 건 0
-- expense_reports: 노무비 10 / 미연결 6 / 제목 노무·카테고리 다름 1 (동일 퇴직공제 건)

-- 분명한 제목→카테고리만. 건강보험·퇴직공제 등이 섞인 줄은 건드리지 않는다.
UPDATE expenses
SET category = '노무비'
WHERE (coalesce(title, '') || ' ' || coalesce(item, '')) ~ '(노무|일당|일용|근로)'
  AND coalesce(category, '') IS DISTINCT FROM '노무비'
  AND (coalesce(title, '') || ' ' || coalesce(item, '')) !~ '(건강보험|국민건강|국민연금|고용보험|산재보험|장기요양|퇴직공제)';

UPDATE expense_reports
SET category = '노무비'
WHERE coalesce(title, '') ~ '(노무|일당|일용|근로)'
  AND coalesce(category, '') IS DISTINCT FROM '노무비'
  AND coalesce(title, '') !~ '(건강보험|국민건강|국민연금|고용보험|산재보험|장기요양|퇴직공제)';

-- 신규 INSERT/UPDATE만 검사. 기존 미연결 노무비는 그대로 두고 검토 목록에서 본다.
ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_labor_needs_work_target;
ALTER TABLE expenses
  ADD CONSTRAINT expenses_labor_needs_work_target
  CHECK (
    category IS DISTINCT FROM '노무비'
    OR site_id IS NOT NULL
    OR project_id IS NOT NULL
  ) NOT VALID;

ALTER TABLE expense_reports
  DROP CONSTRAINT IF EXISTS expense_reports_labor_needs_work_target;
ALTER TABLE expense_reports
  ADD CONSTRAINT expense_reports_labor_needs_work_target
  CHECK (
    category IS DISTINCT FROM '노무비'
    OR site_id IS NOT NULL
    OR project_id IS NOT NULL
  ) NOT VALID;

COMMENT ON CONSTRAINT expenses_labor_needs_work_target ON expenses IS
  '노무비는 site_id 또는 project_id가 있어야 한다. NOT VALID — 기존 미연결 행은 유지.';
COMMENT ON CONSTRAINT expense_reports_labor_needs_work_target ON expense_reports IS
  '노무비 결의서는 site_id 또는 project_id가 있어야 한다. NOT VALID — 기존 미연결 행은 유지.';

-- 미연결 검토용 (실행만, 연결은 사람이)
-- SELECT id, title, category, amount, expense_date
-- FROM expenses
-- WHERE (category = '노무비' OR (coalesce(title,'') || ' ' || coalesce(item,'')) ~ '(노무|일당|일용|근로)')
--   AND site_id IS NULL AND project_id IS NULL
-- ORDER BY expense_date DESC NULLS LAST;

-- 롤백 (필요 시 수동)
-- ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_labor_needs_work_target;
-- ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS expense_reports_labor_needs_work_target;
-- 카테고리 UPDATE는 제목 기준으로만 돌아가므로 자동 롤백하지 않는다.
