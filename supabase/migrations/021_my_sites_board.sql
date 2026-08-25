-- 021_my_sites_board.sql
-- 사장 김재호 전용 「내 현장」(/my-sites) 보드.
-- site_tasks.is_confirmed 는 공정 캘린더 확정용 컬럼(미사용이어도 의미 유지).
-- 완료 여부는 is_done 만 쓴다. 기존 RLS 정책은 변경하지 않는다.
-- 정산완료 현장 삭제/시드 없음. 넘기기는 sites.hidden_from_my_sites.

-- 적용
ALTER TABLE site_tasks
  ADD COLUMN IF NOT EXISTS is_done BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN site_tasks.is_done IS
  '내 현장 보드 완료. is_confirmed(캘린더 확정)와 별개.';

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS hidden_from_my_sites BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN sites.hidden_from_my_sites IS
  '내 현장 보드에서 넘긴 현장. sites 행은 유지하고 현장관리에는 그대로 보인다.';

-- 이번 주 3줄. 이미 같은 제목(현장 없음)이 있으면 넣지 않는다.
INSERT INTO site_tasks (task_name, site_id, is_done)
SELECT v.task_name, NULL, false
FROM (VALUES
  ('영등포 주말'),
  ('농협 견적 금액만'),
  ('철도 착공 날짜')
) AS v(task_name)
WHERE NOT EXISTS (
  SELECT 1 FROM site_tasks t
  WHERE t.site_id IS NULL AND t.task_name = v.task_name
);

-- 롤백 (필요 시 수동 실행)
-- DELETE FROM site_tasks
--   WHERE site_id IS NULL
--     AND task_name IN ('영등포 주말', '농협 견적 금액만', '철도 착공 날짜');
-- ALTER TABLE sites DROP COLUMN IF EXISTS hidden_from_my_sites;
-- ALTER TABLE site_tasks DROP COLUMN IF EXISTS is_done;
