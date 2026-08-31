-- 022_credential_entries.sql
-- 공유 ID/PW (/ids) + 중요 ID/PW (/ids-private)
-- 기존 테이블 DROP 없음. 기존 RLS 정책 변경 없음.
--
-- 접근: API(service_role)만. anon/authenticated 직접 SELECT를 막아서
-- 직원이 supabase 클라이언트로 중요 행을 읽지 못하게 한다.
-- 시드 없음 (빈 테이블로 시작).

-- 적용
CREATE TABLE IF NOT EXISTS credential_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('shared', 'private')),
  name TEXT NOT NULL,
  url TEXT,
  login_id TEXT,
  password TEXT,
  memo TEXT,
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credential_entries_kind ON credential_entries (kind);

COMMENT ON TABLE credential_entries IS
  '현장 공유/관리자 전용 로그인. 비밀번호 평문은 activity_log에 남기지 않는다.';

ALTER TABLE credential_entries ENABLE ROW LEVEL SECURITY;

-- 정책 없음 + 권한 회수. service_role은 RLS를 우회한다.
REVOKE ALL ON TABLE credential_entries FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE credential_entries TO service_role;

-- 롤백 (필요 시 수동 실행)
-- DROP TABLE IF EXISTS credential_entries;
