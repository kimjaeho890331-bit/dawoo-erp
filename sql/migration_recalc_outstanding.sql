-- ================================================
-- projects.outstanding 재계산
-- 원인: total_cost는 이미 self + city + additional 합산(all-inclusive)인데
--       기존 코드가 total_cost + additional_cost로 이중 집계
-- → outstanding이 additional_cost만큼 과다 계상
-- ================================================

-- 실행 전 확인:
-- SELECT id, building_name, total_cost, additional_cost, collected, outstanding,
--        (total_cost - collected) as correct_outstanding
-- FROM projects
-- WHERE outstanding != GREATEST(0, total_cost - collected)
-- LIMIT 20;

UPDATE projects
SET outstanding = GREATEST(0, total_cost - collected);
