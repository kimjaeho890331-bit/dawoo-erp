-- 024_sites_inflow_work_kind.sql
-- 현장 유입경로·공종. 기존 행은 채우지 않는다. RLS 변경 없음. DROP 없음.

-- 적용
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS inflow_path TEXT,
  ADD COLUMN IF NOT EXISTS work_kind TEXT;

ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_inflow_path_check;
ALTER TABLE sites ADD CONSTRAINT sites_inflow_path_check
  CHECK (inflow_path IS NULL OR inflow_path IN (
    '소개', '재계약', '협력사등록', '직접문의', '나라장터공고', '기타'
  ));

ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_work_kind_check;
ALTER TABLE sites ADD CONSTRAINT sites_work_kind_check
  CHECK (work_kind IS NULL OR work_kind IN (
    '기계가스설비', '실내건축', '습식방수', '금속창호', '도장'
  ));

COMMENT ON COLUMN sites.inflow_path IS '유입경로. 신규 등록만 필수. 기존 행은 비움.';
COMMENT ON COLUMN sites.work_kind IS '공종. 신규 등록만 필수. 기존 행은 비움.';

-- 롤백 (필요 시 수동 실행)
-- ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_work_kind_check;
-- ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_inflow_path_check;
-- ALTER TABLE sites DROP COLUMN IF EXISTS work_kind;
-- ALTER TABLE sites DROP COLUMN IF EXISTS inflow_path;
