-- vendors 테이블에 코드에서 사용 중인데 누락된 컬럼 추가
-- 증상: 협력업체 등록 시 "저장에 실패했습니다." (PostgREST schema cache 미스 → insert 실패)
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bank_info TEXT;

-- 스키마 캐시 리로드 (Supabase Realtime / PostgREST)
NOTIFY pgrst, 'reload schema';
