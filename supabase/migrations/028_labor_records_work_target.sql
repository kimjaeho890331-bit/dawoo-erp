-- 028_labor_records_work_target.sql
-- 근무표 행에 공사건(입찰/수의 현장 또는 지원사업 접수건)을 붙인다.
-- 한 달 근무표에 여러 공사건 인력이 섞이는데 지금은 자유기재 site_name 텍스트뿐이라
-- 공사건별로 나눠 결의서를 올릴 수가 없다. 017(expense_reports)과 같은 패턴.
-- 설계: docs/superpowers/specs/2026-10-14-labor-work-target-approval-design.md
--
-- 기존 행은 채우지 않는다 — 전부 「공사건 미지정」으로 모이고, 화면에서 사람이 지정한다.
-- site_name 텍스트로 공사건을 추정하지 않는다(026이 세운 "site 추정 금지" 원칙).
-- 근무표에는 CHECK를 걸지 않는다. 입력 중간에 공사건이 비는 것은 정상이고,
-- 공사건은 결의서를 만들 때만 요구한다(026의 expense_reports CHECK가 최종 방어선).
-- RLS는 그대로 둔다. 테이블 DROP 없음.

ALTER TABLE labor_records
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

ALTER TABLE labor_records
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_labor_records_site ON labor_records(site_id);
CREATE INDEX IF NOT EXISTS idx_labor_records_project ON labor_records(project_id);

COMMENT ON COLUMN labor_records.site_id IS '입찰/수의 현장. 비우면 공사건 미지정';
COMMENT ON COLUMN labor_records.project_id IS '지원사업 접수 건. 비우면 공사건 미지정';

-- 롤백 (필요 시 수동 실행)
-- DROP INDEX IF EXISTS idx_labor_records_site;
-- DROP INDEX IF EXISTS idx_labor_records_project;
-- ALTER TABLE labor_records DROP COLUMN IF EXISTS site_id;
-- ALTER TABLE labor_records DROP COLUMN IF EXISTS project_id;
