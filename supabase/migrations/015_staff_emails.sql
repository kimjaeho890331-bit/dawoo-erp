-- 015_staff_emails.sql
-- 로그인 계정 ↔ 직원 다중 이메일 매핑 ("내 계정 연결" 기능)
--
-- 배경: ERP는 카카오·네이버 OAuth로 로그인하는데 staff.email(단일, UNIQUE)에는
-- 직원관리에 적어둔 개인 지메일이 들어 있어 실제 로그인 계정과 거의 안 맞는다
-- (직원 12명 중 2명만 일치). 게다가 한 사람이 계정을 여러 개(카카오/네이버/구글)
-- 섞어 쓴다. staff.email 단일 칼럼으로는 이걸 담을 수 없어 1:N 매핑 테이블을 둔다.
--
-- 지출결의서 감사 컬럼(014_approval_actor_audit.sql의 drafted_by_email /
-- acted_by_email)이 "어느 로그인 계정이 눌렀는지"는 남기지만 "그게 누구인지"는
-- 모른다 — 이 매핑이 있어야 감사 기록이 사람이 읽을 수 있는 형태가 된다.
--
-- staff.email 칼럼은 그대로 둔다(삭제/변경 없음) — 직원관리 화면이 "대표 이메일"
-- 표시용으로 계속 쓴다. 이 표는 로그인 매핑 전용이며 staff.email과 별개다.
--
-- RLS 미적용: 현행 구조(프론트 anon 클라이언트, 타 테이블 RLS off)와 동일.
-- 새 테이블에만 RLS를 켜면 anon 조회가 막혀 화면이 깨지므로 다른 테이블과
-- 일관되게 꺼둔다.

-- 적용
CREATE TABLE IF NOT EXISTS staff_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,   -- 한 계정은 한 사람에게만 연결(다대일 방지)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_emails_staff ON staff_emails(staff_id);

COMMENT ON TABLE staff_emails IS
  '로그인 계정 이메일 ↔ 직원 매핑(1:N, 한 직원이 여러 계정 보유 가능). email은 UNIQUE — 한 계정이 두 사람에게 붙지 않는다.';

-- 기존 staff.email 값을 시드 — 이미 채워져 있던 "대표 이메일"을 매핑의 출발점으로 사용
INSERT INTO staff_emails (staff_id, email)
SELECT id, email FROM staff WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- 롤백 (필요 시 수동 실행)
-- DROP TABLE IF EXISTS staff_emails;
