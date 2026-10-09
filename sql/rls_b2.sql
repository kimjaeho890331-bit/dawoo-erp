-- =============================================================
-- RLS B단계 - 2단계: 나머지 모든 표를 "로그인한 직원만"으로
-- 전제: sql/rls_b1.sql을 실행했고, 하루 동안 공지사항 등 화면에 문제가 없었다.
-- 파일 전체를 SQL Editor에 붙여 실행한다. 되돌리기는 sql/rls_rollback.sql.
-- =============================================================

-- 나머지 모든 표. 직원이 하루 동안 새 화면(A단계)을 받은 뒤에 한다 —
-- 예전 화면을 띄워 둔 채 있는 기기는 로그인 토큰 없이 요청해 빈 화면이 될 수 있으므로,
-- 실행 뒤 이상하면 먼저 새로고침해 보고, 그래도 비면 sql/rls_rollback.sql.
select ops.rls_lock(array(
  select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname not in (select tablename from ops._rls_backup)
   order by 1
));


-- ===================== 확인 =====================
-- rls 칸이 true, 정책에 staff_all(authenticated ALL)이 보이면 잠긴 것
select c.relname as 표, c.relrowsecurity as rls,
  coalesce((select string_agg(p.policyname||'('||array_to_string(p.roles,',')||' '||p.cmd||')', '; ')
    from pg_policies p where p.schemaname='public' and p.tablename=c.relname),'') as 정책
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by 1;


