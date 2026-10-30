-- 033_staff_show_in_calendar.sql
-- 업무캘린더 상단 직원 칩에 누구를 띄울지.
--
-- 상단 줄은 "그 사람 일정만 보기" 필터다. 직원이 늘면서 칩이 길어져, 자주 안 쓰는
-- 이름까지 한 줄을 채우고 있었다. 회사가 함께 보는 화면이라 설정도 회사 전체가
-- 같은 값을 본다 (설정 > 업무 캘린더. 바꾸는 건 대표·관리자·경리).
--
-- '보일 사람 명단'을 따로 두지 않고 staff 에 칸을 둔 이유: 명단 방식이면 새로
-- 입사한 직원이 명단에 없어서 안 보인다. 칸 방식이면 기본값으로 보인다.
--
-- 퇴사자를 빼는 건 이 칸과 별개다. resign_date 로 화면에서 거른다
-- (src/lib/staff/selectable.ts) — 끄고 켜는 설정이 아니라 늘 빠진다.
--
-- 추가 전용. 기존 자료·정책 변경 없음. 기본값이 true 라 지금 보이던 사람은 그대로 보인다.

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS show_in_calendar BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN staff.show_in_calendar IS
  '업무캘린더 상단 직원 칩에 띄울지 여부. 끄면 칩만 사라지고 그 사람 일정은 달력에 그대로 남는다';

-- 롤백 (필요 시 수동 실행)
-- ALTER TABLE staff DROP COLUMN IF EXISTS show_in_calendar;
