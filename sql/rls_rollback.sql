-- =============================================================
-- RLS 되돌리기: rls_b1/rls_b2로 잠근 표를 잠그기 전 상태로 그대로 돌린다
-- (잠글 때 ops._rls_backup에 적어 둔 원래 정책·RLS 상태로)
-- 화면이 비거나 저장이 안 되면 이 파일 전체를 실행한다.
-- =============================================================

-- 전부 되돌리기
select ops.rls_unlock(array(select distinct tablename from ops._rls_backup));

-- 공지사항만 되돌리려면 위 줄 대신:
-- select ops.rls_unlock(array['notices']);

-- ===================== 확인 =====================
-- rls 칸이 true, 정책에 staff_all(authenticated ALL)이 보이면 잠긴 것
select c.relname as 표, c.relrowsecurity as rls,
  coalesce((select string_agg(p.policyname||'('||array_to_string(p.roles,',')||' '||p.cmd||')', '; ')
    from pg_policies p where p.schemaname='public' and p.tablename=c.relname),'') as 정책
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by 1;


