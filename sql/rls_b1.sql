-- =============================================================
-- RLS B단계: "로그인한 직원만" DB를 읽고 쓰게 한다
-- -------------------------------------------------------------
-- 왜: 지금은 사이트 코드에 들어 있는 공개 키(anon)만 있으면 로그인 없이 모든 표를
--     읽고 지울 수 있다(2026-10 점검: 모든 표 anon 읽기·삭제 true).
-- 전제: A단계(PR #43) 배포 — 화면이 DB 요청에 로그인 토큰을 싣는다. 이것 없이 켜면
--       예전 사고처럼 직원 화면이 모두 빈다.
-- 방식: 표마다 RLS를 켜고 "로그인한 사람(authenticated)은 지금처럼 전부" 정책을 붙인다.
--       직원이 보는 것은 그대로, 로그인 안 한 요청만 막힌다.
--       서버만 쓰는 표(서비스 키로 접근)는 RLS를 켜고 정책을 두지 않는다 → 화면에서는 못 읽음.
-- 이 파일: [준비] + [1단계]. 파일 전체를 SQL Editor에 붙여 실행한다(공지사항 + 서버 전용 표만 잠금).
-- 다음: 하루 써 보고 문제 없으면 sql/rls_b2.sql. 문제 있으면 sql/rls_rollback.sql.
-- =============================================================


-- ===================== [준비] 한 번만 =====================
-- 화면(API)에서 보이지 않는 별도 스키마에 백업 표와 도구 함수를 둔다.
create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops._rls_backup (
  tablename   text not null,
  rls_was_on  boolean,          -- 정책 행이 아닌 '표' 행에만 채운다
  policyname  text,             -- null이면 표 행
  roles       text[],
  saved_at    timestamptz default now()
);

-- 표 여러 개를 잠근다. server_only=true면 로그인 사용자 정책도 만들지 않는다(서비스 키 전용).
create or replace function ops.rls_lock(targets text[], server_only boolean default false)
returns text language plpgsql as $$
declare t text; p record; done text := '';
begin
  foreach t in array targets loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = t and c.relkind = 'r') then
      done := done || t || '(없음 건너뜀) ';
      continue;
    end if;
    -- 처음 잠글 때만 원래 상태를 적어 둔다
    if not exists (select 1 from ops._rls_backup where tablename = t) then
      insert into ops._rls_backup(tablename, rls_was_on)
        select t, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = t;
      insert into ops._rls_backup(tablename, policyname, roles)
        select t, policyname, roles from pg_policies where schemaname = 'public' and tablename = t;
    end if;
    -- 기존 정책(누구나·anon 포함)은 로그인한 사람에게만 적용되게 바꾼다.
    -- 서버 전용 표는 화면(로그인 사용자)에도 닫는다 — service_role은 원래 RLS를 건너뛰므로 사실상 정책을 끄는 것.
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('alter policy %I on public.%I to %s', p.policyname, t,
                     case when server_only then 'service_role' else 'authenticated' end);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    if not server_only and not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'staff_all') then
      execute format('create policy staff_all on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
    done := done || t || ' ';
  end loop;
  return '잠금: ' || done;
end $$;

-- 잠근 표를 원래대로 되돌린다
create or replace function ops.rls_unlock(targets text[])
returns text language plpgsql as $$
declare t text; b record; was_on boolean; done text := '';
begin
  foreach t in array targets loop
    if not exists (select 1 from ops._rls_backup where tablename = t) then
      done := done || t || '(기록 없음 건너뜀) ';
      continue;
    end if;
    execute format('drop policy if exists staff_all on public.%I', t);
    for b in select policyname, roles from ops._rls_backup where tablename = t and policyname is not null loop
      execute format('alter policy %I on public.%I to %s', b.policyname, t, array_to_string(b.roles, ', '));
    end loop;
    select rls_was_on into was_on from ops._rls_backup where tablename = t and policyname is null limit 1;
    if was_on is false then
      execute format('alter table public.%I disable row level security', t);
    end if;
    delete from ops._rls_backup where tablename = t;
    done := done || t || ' ';
  end loop;
  return '되돌림: ' || done;
end $$;

revoke all on all functions in schema ops from public, anon, authenticated;


-- ===================== [1단계] 오늘 =====================
-- (가) 공지사항 하나만 먼저(시험). 실행 후 PC·폰에서 공지사항이 그대로 보이는지 확인.
select ops.rls_lock(array['notices']);

-- (나) 서버만 쓰는 표: 화면에서는 원래 읽지 않는다(서비스 키로만). 켜도 화면 변화 없음.
select ops.rls_lock(array[
  'credential_entries', 'push_subscriptions',
  'chat_messages', 'chat_sessions', 'ai_memory', 'ai_events', 'ai_knowledge',
  'doc_sequences'
], true);


-- ===================== 확인 =====================
-- rls 칸이 true, 정책에 staff_all(authenticated ALL)이 보이면 잠긴 것
select c.relname as 표, c.relrowsecurity as rls,
  coalesce((select string_agg(p.policyname||'('||array_to_string(p.roles,',')||' '||p.cmd||')', '; ')
    from pg_policies p where p.schemaname='public' and p.tablename=c.relname),'') as 정책
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by 1;


