-- 007_as_records_missing_columns.sql
-- A/S 접수 화면(AsPage)이 저장하는 컬럼들이 실제 테이블에 없어 insert가 400으로 실패하던 문제 수정
-- (테이블이 초기 최소 스키마로 생성된 뒤 화면 확장분이 반영되지 않았음 — A/S 접수가 한 번도 동작한 적 없음)

-- 적용
ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS site_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS issue_type TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS assigned_vendor_id TEXT,
  ADD COLUMN IF NOT EXISTS cost BIGINT,
  ADD COLUMN IF NOT EXISTS memo TEXT,
  ADD COLUMN IF NOT EXISTS photos TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN as_records.site_name IS '현장명';
COMMENT ON COLUMN as_records.address IS '주소';
COMMENT ON COLUMN as_records.issue_type IS '하자유형: 누수|균열|도배불량|타일탈락|설비고장|전기불량|기타';
COMMENT ON COLUMN as_records.description IS '하자 내용';
COMMENT ON COLUMN as_records.assigned_vendor_id IS '담당업체명 (자유입력 텍스트)';
COMMENT ON COLUMN as_records.cost IS 'A/S 비용(원)';
COMMENT ON COLUMN as_records.photos IS '사진 URL 목록';

-- 롤백 (필요 시 수동 실행)
-- ALTER TABLE as_records
--   DROP COLUMN site_name, DROP COLUMN address, DROP COLUMN issue_type,
--   DROP COLUMN description, DROP COLUMN assigned_vendor_id, DROP COLUMN cost,
--   DROP COLUMN memo, DROP COLUMN photos;
