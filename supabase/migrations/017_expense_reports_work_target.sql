-- 지출결의서에 현장(입찰·수의) / 접수 건(지원사업) 연결. 둘 다 비울 수 있다.
-- 기존 행은 채우지 않는다. RLS는 그대로 둔다.

ALTER TABLE expense_reports
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

ALTER TABLE expense_reports
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_er_site ON expense_reports(site_id);
CREATE INDEX IF NOT EXISTS idx_er_project ON expense_reports(project_id);

COMMENT ON COLUMN expense_reports.site_id IS '입찰/수의 현장. 비우면 현장 없음';
COMMENT ON COLUMN expense_reports.project_id IS '지원사업 접수 건. 비우면 현장 없음';

-- 롤백 (필요 시 수동)
-- DROP INDEX IF EXISTS idx_er_site;
-- DROP INDEX IF EXISTS idx_er_project;
-- ALTER TABLE expense_reports DROP COLUMN IF EXISTS site_id;
-- ALTER TABLE expense_reports DROP COLUMN IF EXISTS project_id;
