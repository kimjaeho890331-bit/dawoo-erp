-- 034_as_records_photos.sql
-- A/S 전·후 사진.
--
-- as_records.photos(사진 URL 목록)는 이미 있었지만 화면에 올리는 자리가 없어 늘 비어 있었고,
-- 전·후 구분도 없었다. A/S는 "고치기 전이 이랬고 고친 뒤가 이렇다"를 남기는 게 일의 전부라
-- 한 칸에 섞으면 쓸모가 없다. 그래서 칸을 둘로 나눈다.
--
-- 기존 photos 칸은 지우지 않는다. 지금 두 건 다 비어 있지만, 쓰던 칸을 말없이 없애면
-- 나중에 남은 자료가 있었는지 확인할 길이 사라진다.
--
-- 사진은 documents 버킷 attachments/as/<기록id>/{before,after}/ 아래에 올리고
-- 공개 URL을 여기에 담는다 (cost_ratios 캡처와 같은 방식).
--
-- 추가 전용. 기존 자료·정책 변경 없음.

ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS photos_before TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS photos_after  TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN as_records.photos_before IS 'A/S 전 사진 공개 URL 목록';
COMMENT ON COLUMN as_records.photos_after IS 'A/S 후 사진 공개 URL 목록';

-- 롤백 (필요 시 수동 실행)
-- ALTER TABLE as_records DROP COLUMN IF EXISTS photos_before, DROP COLUMN IF EXISTS photos_after;
