-- =============================================================
-- 경리 > 새는 돈 찾기 — 통장 거래내역 + 정기지출 검토 결과
-- -------------------------------------------------------------
-- 왜: 대표 — "회사에서 빠져나가는 1원까지 알고 싶다". 법인카드 내역(card_transactions)은
--     이미 있지만 통장(기업은행) 출금은 어디에도 쌓이지 않아, 자동이체·구독료·수수료처럼
--     매달 조용히 나가는 돈을 볼 수 없었다. 통장 거래내역을 올려 두고, 화면이 찾아 준
--     정기지출마다 대표가 필요/해지/줄이기/해지함을 표시해 「고정지출 목록」을 만든다.
-- 실행: 파일 전체를 Supabase SQL Editor에 붙여 한 번 실행한다. 다시 실행해도 안전하다.
-- 요구: Postgres 15 이상(UNIQUE NULLS NOT DISTINCT). Supabase 기본 버전이면 된다.
-- =============================================================


-- ===================== 통장 거래내역 =====================
-- 은행 엑셀 한 줄 = 한 행. 입금도 함께 넣어 두지만 화면 분석은 출금만 쓴다.
create table if not exists public.bank_transactions (
  id           uuid primary key default gen_random_uuid(),
  account      text not null,          -- 통장 이름(예: '기업 1234'). 계좌번호 전체는 넣지 않고 끝 4자리만
  tx_at        timestamptz not null,   -- 거래 일시(한국 시각으로 넣는다). 시각이 없는 파일은 그날 0시
  direction    text not null check (direction in ('out', 'in')),
  amount       numeric not null,       -- 늘 양수. 들어왔는지 나갔는지는 direction
  balance      numeric,                -- 거래 후 잔액. 파일에 없으면 비운다
  counterparty text,                   -- 받는 분·상대 예금주
  description  text,                   -- 거래내용·적요
  memo         text,
  raw          jsonb,                  -- 원래 엑셀 한 줄(머리글 → 값). 칸을 잘못 골랐을 때 다시 읽으려고 남긴다
  created_at   timestamptz default now(),
  -- 같은 파일을 두 번 올려도 두 배로 쌓이지 않게 막는 열쇠.
  -- 잔액이 없는 파일도 있어 NULLS NOT DISTINCT로 둔다 — 기본(NULL끼리 다름)이면 잔액 없는 줄은
  -- 매번 새 줄로 들어가 중복이 막히지 않는다. 같은 시각·같은 금액이라도 잔액이 다르면 다른 거래다.
  constraint bank_transactions_dedupe unique nulls not distinct (account, tx_at, direction, amount, balance)
);

-- 화면은 늘 「최근 N개월 출금」으로 읽는다
create index if not exists bank_transactions_tx_at_idx
  on public.bank_transactions (tx_at);


-- ===================== 정기지출 검토 결과 =====================
-- 화면이 찾은 항목(같은 곳으로 반복해 나가는 돈)마다 대표가 내린 결정.
-- item_key = '출처:정리한 이름' (예: 'bank:kt통신요금', 'card:쿠팡'). 거래내역을 다시 올려도
-- 이름이 같으면 같은 항목으로 이어진다.
create table if not exists public.spend_reviews (
  id             uuid primary key default gen_random_uuid(),
  item_key       text unique not null,
  label          text,                 -- 화면에 보이는 이름(원래 표기)
  decision       text not null default 'unknown'
                 check (decision in ('unknown', 'keep', 'cancel', 'reduce', 'cancelled')),
                 -- unknown 검토 전 / keep 필요 / cancel 해지할 것 / reduce 줄일 것 / cancelled 해지함
  monthly_amount numeric,              -- 결정할 때의 월 금액(나중에 내역이 바뀌어도 그때 기준을 남긴다)
  note           text,
  decided_by     uuid references public.staff(id) on delete set null,
  decided_at     timestamptz,
  updated_at     timestamptz default now()
);


-- ===================== 보안(RLS) =====================
-- 프로젝트 RLS B단계와 같은 규칙: 로그인한 직원(authenticated)은 전부, 로그인 안 한 요청(anon)은 막는다.
-- 화면(src/lib/supabase.ts)이 로그인 토큰을 싣고 요청하므로(A단계) 화면은 그대로 동작한다.
alter table public.bank_transactions enable row level security;
alter table public.spend_reviews     enable row level security;

drop policy if exists staff_all on public.bank_transactions;
create policy staff_all on public.bank_transactions
  for all to authenticated using (true) with check (true);

drop policy if exists staff_all on public.spend_reviews;
create policy staff_all on public.spend_reviews
  for all to authenticated using (true) with check (true);


-- ===================== 확인 =====================
-- 두 표가 보이고 rls=true, 정책에 staff_all(authenticated ALL)이 있으면 끝
select c.relname as 표, c.relrowsecurity as rls,
  coalesce((select string_agg(p.policyname || '(' || array_to_string(p.roles, ',') || ' ' || p.cmd || ')', '; ')
    from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname), '') as 정책
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('bank_transactions', 'spend_reviews');


-- ===================== 되돌리기 (필요할 때만, 주석을 풀고 실행) =====================
-- 올린 통장 내역과 검토 결과가 모두 지워진다. 다른 표에는 영향이 없다(이 두 표를 참조하는 표 없음).
-- drop table if exists public.spend_reviews;
-- drop table if exists public.bank_transactions;
