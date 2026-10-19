-- 031_project_representative2.sql
-- 접수건에 두 번째 대표자(이름·연락처)를 둔다.
--
-- 빌라는 연락 닿는 사람이 둘인 경우가 흔한데(입주민 대표와 부대표, 또는
-- 소유주와 실거주자), 지금은 칸이 하나뿐이라 한 명은 비고에 적히거나 빠졌다.
--
-- 기존 owner_name/owner_phone 은 화면에서 '대표자1'로 부른다. 칸 이름은
-- 그대로 두어 지난 자료와 다른 화면들이 깨지지 않게 한다.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS rep2_name TEXT;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS rep2_phone TEXT;

COMMENT ON COLUMN projects.owner_name IS '대표자1 이름 (옛 이름: 소유주)';
COMMENT ON COLUMN projects.owner_phone IS '대표자1 연락처 (옛 이름: 소유주 연락처)';
COMMENT ON COLUMN projects.rep2_name IS '대표자2 이름. 연락 닿는 사람이 둘일 때 쓴다';
COMMENT ON COLUMN projects.rep2_phone IS '대표자2 연락처';

-- 롤백 (필요 시 수동)
-- ALTER TABLE projects DROP COLUMN IF EXISTS rep2_name;
-- ALTER TABLE projects DROP COLUMN IF EXISTS rep2_phone;
