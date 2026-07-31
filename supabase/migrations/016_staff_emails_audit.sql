-- 016_staff_emails_audit.sql
-- staff_emails 연결 이력 컬럼 추가 (누가/언제 이 매핑을 걸었는지)
--
-- 배경: "내 계정 연결"(AccountLink.tsx)은 로그인한 사람이 드롭다운에서 직원을
-- 골라 자기 계정을 연결한다. 화면이 전 직원 목록을 필터 없이 보여주므로
-- 실수로 남의 이름을 고를 수 있다 — 이 회사는 지출결의서에서도 "행위자를
-- 화면에서 고르는" 신뢰 모델을 쓰고 있어 여기서만 엄격한 서버 검증을 추가하지
-- 않기로 했다(리뷰 결정). 대신 "누가 언제 이 매핑을 걸었는지"를 남겨 나중에
-- 추적·정정할 수 있게 한다.
--
-- linked_by_email: 연결을 실행한 로그인 계정 이메일(=요청 세션 이메일).
--   보통 staff_emails.email과 같지만, 관리자가 대신 연결해 줄 가능성을 열어두기
--   위해 별도 컬럼으로 둔다.
-- updated_at: 이 매핑이 마지막으로 갱신된 시각.
--
-- 기존 테이블 DROP/ALTER 없음 — 컬럼 추가만. nullable이라 기존 행(015에서 시드된
-- staff.email 이관분)은 NULL로 남는다.

-- 적용
ALTER TABLE staff_emails ADD COLUMN IF NOT EXISTS linked_by_email TEXT;
ALTER TABLE staff_emails ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

COMMENT ON COLUMN staff_emails.linked_by_email IS
  '이 매핑을 실행한 로그인 계정 이메일(연결 이력 추적용). 보통 email과 동일.';
COMMENT ON COLUMN staff_emails.updated_at IS
  '이 매핑이 마지막으로 생성/갱신된 시각.';

-- 롤백 (필요 시 수동 실행)
-- ALTER TABLE staff_emails DROP COLUMN IF EXISTS linked_by_email;
-- ALTER TABLE staff_emails DROP COLUMN IF EXISTS updated_at;
