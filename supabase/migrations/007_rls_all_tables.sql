-- ============================================
-- 007. 전 테이블 RLS 일괄 적용 (개발자 요청서 1번 — 가장 급함)
--
-- ⚠️⚠️ 경고: 이 파일을 단독으로 먼저 실행하면 화면이 전부 빕니다. ⚠️⚠️
--
--   이유: 현재 앱은 데이터 읽기에 세션이 없는 anon 클라이언트
--   (src/lib/supabase.ts 의 createClient)를 씁니다. 로그인은 별도의
--   @supabase/ssr 쿠키 세션을 쓰기 때문에, 데이터 요청에는 로그인 JWT가
--   실리지 않습니다. 그 상태에서 아래 'authenticated 전용' 정책을 켜면
--   모든 SELECT가 막혀 화면이 백지가 됩니다.
--
--   ✅ 반드시 이 순서로:
--     1) src/lib/supabase.ts 를 @supabase/ssr createBrowserClient 로 교체해
--        데이터 요청에도 로그인 세션 JWT가 실리게 한다.
--     2) 로그인 상태에서 대시보드/접수대장이 정상으로 보이는지 확인한다.
--     3) 그 다음 이 파일을 실행한다.
--     4) 다시 로그인 상태로 전 화면 확인, anon(로그아웃)으로 접근 시
--        차단되는지 확인한다.
--
--   문제 시 롤백: 아래 맨 아래 '롤백' 블록 주석 해제 후 실행.
--
-- 특징: public 스키마의 모든 base table을 자동 순회 → 신규 테이블도 누락 없음.
--       재실행 안전(idempotent). 로그인 사용자에게 CRUD 전부 허용(회사 내부 6명 기준).
-- ============================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_auth_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t || '_auth_all', t
    );
  END LOOP;
END $$;

-- 확인: RLS 켜졌는지 + 정책 있는지
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY tablename;

-- ============================================
-- 롤백 (문제 발생 시 주석 해제하여 실행)
-- ============================================
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY;', t);
--   END LOOP;
-- END $$;
