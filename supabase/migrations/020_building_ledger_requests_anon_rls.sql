-- 020_building_ledger_requests_anon_rls.sql
-- 화면 supabase 클라이언트는 세션을 쓰지 않아 요청이 anon으로 나간다.
-- 019는 authenticated만 허용해서 신청 INSERT가 RLS에 막혔다.
-- 기존 authenticated 정책은 그대로 두고, anon용 정책을 추가한다.

-- 적용
CREATE POLICY "building_ledger_requests_anon_select" ON building_ledger_requests
  FOR SELECT TO anon USING (true);
CREATE POLICY "building_ledger_requests_anon_insert" ON building_ledger_requests
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "building_ledger_requests_anon_update" ON building_ledger_requests
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "building_ledger_requests_anon_delete" ON building_ledger_requests
  FOR DELETE TO anon USING (true);

-- 롤백 (필요 시 수동 실행)
-- DROP POLICY IF EXISTS "building_ledger_requests_anon_select" ON building_ledger_requests;
-- DROP POLICY IF EXISTS "building_ledger_requests_anon_insert" ON building_ledger_requests;
-- DROP POLICY IF EXISTS "building_ledger_requests_anon_update" ON building_ledger_requests;
-- DROP POLICY IF EXISTS "building_ledger_requests_anon_delete" ON building_ledger_requests;
