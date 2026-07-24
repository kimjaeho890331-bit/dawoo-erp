-- 009_vendor_categories_rls_off.sql
-- vendor_categories RLS 비활성화
-- 이유: 프론트 supabase 클라이언트(src/lib/supabase.ts)는 plain createClient라 세션이 없는 anon으로 요청하고,
--       운영 DB의 기존 테이블들(vendors, as_records 등)은 001_enable_rls.sql이 실제 적용된 적이 없어 RLS가 꺼진 상태.
--       008에서 이 테이블만 RLS(authenticated 전용)를 켜는 바람에 화면에서 공종칩 조회/등록이 차단됨.
-- TODO: 추후 @supabase/ssr 쿠키 기반 클라이언트로 전환할 때 전 테이블 RLS를 일괄 활성화할 것.

-- 적용
ALTER TABLE vendor_categories DISABLE ROW LEVEL SECURITY;

-- 롤백 (필요 시 수동 실행)
-- ALTER TABLE vendor_categories ENABLE ROW LEVEL SECURITY;
