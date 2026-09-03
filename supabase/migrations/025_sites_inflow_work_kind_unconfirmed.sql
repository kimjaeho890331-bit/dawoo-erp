-- 025_sites_inflow_work_kind_unconfirmed.sql
-- 유입경로·공종에 미확인 + DEFAULT. NULL만 백필. NOT NULL/DROP/RLS 없음.

-- 적용
ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_inflow_path_check;
ALTER TABLE sites ADD CONSTRAINT sites_inflow_path_check
  CHECK (inflow_path IS NULL OR inflow_path IN (
    '소개', '재계약', '협력사등록', '직접문의', '나라장터공고', '기타', '미확인'
  ));

ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_work_kind_check;
ALTER TABLE sites ADD CONSTRAINT sites_work_kind_check
  CHECK (work_kind IS NULL OR work_kind IN (
    '기계가스설비', '실내건축', '습식방수', '금속창호', '도장', '미확인'
  ));

ALTER TABLE sites ALTER COLUMN inflow_path SET DEFAULT '미확인';
ALTER TABLE sites ALTER COLUMN work_kind SET DEFAULT '미확인';

UPDATE sites SET inflow_path = '미확인' WHERE inflow_path IS NULL;
UPDATE sites SET work_kind = '미확인' WHERE work_kind IS NULL;

COMMENT ON COLUMN sites.inflow_path IS '유입경로. 빈 INSERT는 미확인. NULL 허용. 기존 값은 추정하지 않음.';
COMMENT ON COLUMN sites.work_kind IS '공종. 빈 INSERT는 미확인. NULL 허용. 기존 값은 추정하지 않음.';

-- 롤백 (필요 시 수동 실행)
-- ALTER TABLE sites ALTER COLUMN inflow_path DROP DEFAULT;
-- ALTER TABLE sites ALTER COLUMN work_kind DROP DEFAULT;
-- ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_work_kind_check;
-- ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_inflow_path_check;
-- ALTER TABLE sites ADD CONSTRAINT sites_inflow_path_check
--   CHECK (inflow_path IS NULL OR inflow_path IN (
--     '소개', '재계약', '협력사등록', '직접문의', '나라장터공고', '기타'
--   ));
-- ALTER TABLE sites ADD CONSTRAINT sites_work_kind_check
--   CHECK (work_kind IS NULL OR work_kind IN (
--     '기계가스설비', '실내건축', '습식방수', '금속창호', '도장'
--   ));
