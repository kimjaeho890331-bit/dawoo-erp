-- ================================================
-- schedules.title에서 앞에 박힌 "HH:MM " 제거
-- 원인: syncSchedules가 title과 start_time 양쪽에 시간을 넣어서
--       캘린더가 "09:00 09:00 신일빌라 실측"처럼 중복 표시
-- 신규 저장은 이미 수정됨 (ProjectDetailPanel.tsx syncSchedules)
-- 이 마이그레이션은 기존 데이터만 정리
-- ================================================

-- 실행 전 확인:
-- SELECT id, title, start_time FROM schedules WHERE title ~ '^[0-9]{1,2}:[0-9]{2} ' LIMIT 20;

UPDATE schedules
SET title = regexp_replace(title, '^[0-9]{1,2}:[0-9]{2} ', '')
WHERE title ~ '^[0-9]{1,2}:[0-9]{2} ';

-- 실행 후 검증:
-- SELECT COUNT(*) FROM schedules WHERE title ~ '^[0-9]{1,2}:[0-9]{2} ';  -- 0이어야 함
