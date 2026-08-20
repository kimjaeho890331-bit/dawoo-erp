-- 018_vendor_daily_worker_fields.sql
-- 일용직은 거래처(vendors) 행으로 관리한다. 별도 테이블을 만들지 않는다.
-- 주민번호만 신규 컬럼. 연락처·은행·계좌·서류 URL은 기존 컬럼을 쓴다.
-- 기존 행의 빈 값은 채우지 않는다. RLS 변경·DROP 없음.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS resident_id TEXT;

COMMENT ON COLUMN vendors.resident_id IS '일용직 주민등록번호. 협력업체는 비움.';
