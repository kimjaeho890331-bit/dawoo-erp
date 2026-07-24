-- 006_as_category.sql
-- A/S 관리 카테고리 구분 추가
-- 입찰 및 수의계약 A/S / 지원사업 A/S(수도·소규모) 를 구분하는 컬럼
-- '수도'·'소규모'는 지원사업 하위 구분이므로 컬럼 하나로 표현 (vendors.vendor_type 패턴과 동일)

-- 적용
ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '입찰수의계약'
  CHECK (category IN ('입찰수의계약', '수도', '소규모'));

COMMENT ON COLUMN as_records.category IS 'A/S 구분: 입찰수의계약 | 수도(지원사업) | 소규모(지원사업)';

-- 롤백 (필요 시 수동 실행)
-- ALTER TABLE as_records DROP COLUMN category;
