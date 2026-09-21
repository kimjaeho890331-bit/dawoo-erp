-- 노무비 정리 원샷 (사람이 Studio에서 실행).
-- 1) 분명한 제목→카테고리만 노무비로 고친다. site/project는 추정하지 않는다.
-- 2) 미연결·카테고리 불일치 목록을 보여 준다. CFO가 가정산에서 걸러낸다.
-- 후불 공과(건강보험·퇴직공제 등)는 노무비로 바꾸지 않는다.

-- ===== 적용 전 건수 =====
SELECT
  'expenses' AS src,
  count(*) FILTER (WHERE category = '노무비') AS cat_labor,
  count(*) FILTER (WHERE category = '노무비' AND site_id IS NULL AND project_id IS NULL) AS labor_unlinked,
  count(*) FILTER (
    WHERE (coalesce(title, '') || ' ' || coalesce(item, '')) ~ '(노무|일당|일용|근로)'
      AND coalesce(category, '') IS DISTINCT FROM '노무비'
  ) AS title_labor_wrong_cat,
  count(*) FILTER (
    WHERE (coalesce(title, '') || ' ' || coalesce(item, '')) ~ '(노무|일당|일용|근로)'
      AND coalesce(category, '') IS DISTINCT FROM '노무비'
      AND (coalesce(title, '') || ' ' || coalesce(item, '')) !~ '(건강보험|국민건강|국민연금|고용보험|산재보험|장기요양|퇴직공제)'
  ) AS title_labor_clear_fix
FROM expenses
UNION ALL
SELECT
  'expense_reports',
  count(*) FILTER (WHERE category = '노무비'),
  count(*) FILTER (WHERE category = '노무비' AND site_id IS NULL AND project_id IS NULL),
  count(*) FILTER (
    WHERE coalesce(title, '') ~ '(노무|일당|일용|근로)'
      AND coalesce(category, '') IS DISTINCT FROM '노무비'
  ),
  count(*) FILTER (
    WHERE coalesce(title, '') ~ '(노무|일당|일용|근로)'
      AND coalesce(category, '') IS DISTINCT FROM '노무비'
      AND coalesce(title, '') !~ '(건강보험|국민건강|국민연금|고용보험|산재보험|장기요양|퇴직공제)'
  )
FROM expense_reports;

-- ===== 분명한 제목→카테고리만 =====
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

-- ===== 검토 목록: 자동 연결하지 말 것 =====
SELECT 'expense' AS src, id, title, category, amount, expense_date,
       site_id, project_id,
       CASE WHEN coalesce(category, '') IS DISTINCT FROM '노무비' THEN 'wrong_category' ELSE 'unlinked' END AS reason
FROM expenses
WHERE (
    (coalesce(title, '') || ' ' || coalesce(item, '')) ~ '(노무|일당|일용|근로)'
    AND coalesce(category, '') IS DISTINCT FROM '노무비'
  )
  OR (
    (category = '노무비' OR (coalesce(title, '') || ' ' || coalesce(item, '')) ~ '(노무|일당|일용|근로)')
    AND site_id IS NULL AND project_id IS NULL
  )
UNION ALL
SELECT 'report', id, title, category, total_amount, submitted_at::date,
       site_id, project_id,
       CASE WHEN coalesce(category, '') IS DISTINCT FROM '노무비' THEN 'wrong_category' ELSE 'unlinked' END
FROM expense_reports
WHERE (
    coalesce(title, '') ~ '(노무|일당|일용|근로)'
    AND coalesce(category, '') IS DISTINCT FROM '노무비'
  )
  OR (
    (category = '노무비' OR coalesce(title, '') ~ '(노무|일당|일용|근로)')
    AND site_id IS NULL AND project_id IS NULL
  )
ORDER BY 1, 6 DESC NULLS LAST;
