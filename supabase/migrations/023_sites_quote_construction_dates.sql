-- 023_sites_quote_construction_dates.sql
-- 현장관리 견적일·착공일. start_date/end_date(착공예정·준공예정)와 별개.
-- 기존 행은 채우지 않는다. RLS 변경 없음. DROP 없음.

-- 적용
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS quote_date DATE,
  ADD COLUMN IF NOT EXISTS construction_start_date DATE;

COMMENT ON COLUMN sites.quote_date IS '견적일. start_date와 별개. 비어 있으면 비움.';
COMMENT ON COLUMN sites.construction_start_date IS '착공일. start_date(착공예정일)와 별개. 복사하지 않음.';

-- 롤백 (필요 시 수동 실행)
-- ALTER TABLE sites DROP COLUMN IF EXISTS construction_start_date;
-- ALTER TABLE sites DROP COLUMN IF EXISTS quote_date;
