-- 029_payment_work_target.sql
-- 지출결의서 지급줄에 공사건(현장/접수건)을 붙인다.
-- 노무비를 공사건별로 묶어 한 장에 올리려면 줄마다 공사건이 있어야 한다.
-- 문서의 site_id/project_id(017·026)는 대표 공사건으로 그대로 두고, 줄 값이 있으면
-- 승인 시 만들어지는 지출은 그 줄의 공사건으로 등록된다 — 현장별 원가가 정확해진다.
-- 설계: docs/superpowers/specs/2026-10-14-labor-work-target-approval-design.md
--
-- 기존 줄은 채우지 않는다(NULL = 문서의 공사건을 따른다). CHECK 없음. RLS 그대로.

ALTER TABLE expense_report_payments
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

ALTER TABLE expense_report_payments
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_erp_site ON expense_report_payments(site_id);
CREATE INDEX IF NOT EXISTS idx_erp_project ON expense_report_payments(project_id);

COMMENT ON COLUMN expense_report_payments.site_id IS '줄별 공사건(입찰/수의 현장). 비우면 문서의 공사건을 따른다';
COMMENT ON COLUMN expense_report_payments.project_id IS '줄별 공사건(지원사업 접수건). 비우면 문서의 공사건을 따른다';

-- 롤백 (필요 시 수동)
-- DROP INDEX IF EXISTS idx_erp_site;
-- DROP INDEX IF EXISTS idx_erp_project;
-- ALTER TABLE expense_report_payments DROP COLUMN IF EXISTS site_id;
-- ALTER TABLE expense_report_payments DROP COLUMN IF EXISTS project_id;
