# 업무 캘린더 직원 색상 커스텀 + 가독성 자동 보정 — 설계

날짜: 2026-07-11 / 승인: 대표 (캘린더에서 바로 변경 + 가독성 보정 둘 다 적용)

## 문제
- 직원 색상이 파스텔/베이지처럼 밝으면 캘린더에서 이름·일정 글자가 안 보임.
  - 확정 일정 바: 직원색 배경 + **흰 글자 고정** → 밝은 배경이면 안 읽힘.
  - 미확정 일정 바: 흰 배경 + 직원색 글자/점선 → 밝은 색이면 안 읽힘.
  - 상단 직원 필터 칩: 연한 배경(색+18 alpha) + 직원색 글자 → 동일 문제.
- 색상 변경 UI는 직원관리 수정 모달에만 있어 캘린더에서 접근 불편.

## 설계

### 1. 가독성 유틸 (src/lib/staff-colors.ts에 추가)
- `getContrastText(bgHex)`: WCAG 상대 휘도로 흰 글자 vs 진한 글자(#1F2937) 중 대비가 높은 쪽 반환.
- `ensureReadableOnLight(hex)`: 흰/연한 배경 위 글자·테두리용. 흰 배경 대비 3:1 미만이면 대비 충족까지 어둡게 조정한 변형 반환 (원색은 배경·점에 그대로 사용).
- 결과 메모이즈(Map 캐시).

### 2. 캘린더 적용 (WorkCalendarPage.tsx)
- 확정 바: `color: getContrastText(barColor)`. 이니셜 뱃지 글자 동일.
- 미확정 바: 글자·점선 테두리 `ensureReadableOnLight(barColor)`. 뱃지(원색 배경)는 `getContrastText`.
- 직원 필터 칩: 이름 글자 `ensureReadableOnLight(c)`, 색상 점은 원색 유지.
- 오늘 일정 직원 아바타(원색 배경 + 흰 글자 고정): `getContrastText(color)`.
- 모바일 뷰·연차 페이지는 점으로만 사용 → 변경 없음.

### 3. 캘린더 내 색상 변경 — StaffColorPopover (신규, src/components/calendar/)
- 트리거: 직원 필터 칩 **우클릭**(onContextMenu) → 칩 아래 앵커 팝오버. 좌클릭 필터 토글은 그대로.
- 내용: STAFF_COLOR_PALETTE 48색 그리드(현재 색 하이라이트) + `<input type="color">` + hex 입력 — 직원관리 모달과 동일 팔레트 공유.
- 저장: 스와치 클릭 즉시 optimistic 반영 + `supabase.from('staff').update({ color })`, 실패 시 롤백 + alert.
- 닫기: 외부 클릭 / ESC. 안내 문구를 "칩 우클릭으로 색상 변경"으로 교체.

## 하지 않는 것
- 직원관리 기존 피커 변경 없음(팔레트 공유로 일관성 유지).
- DB 스키마 변경 없음(staff.color 기존 컬럼 사용).
- 홍보현황 탭·모바일 뷰·연차 페이지 변경 없음.

## 검증
- `npm run build` 통과 + 로컬 프리뷰에서 밝은 색(파스텔) 지정 후 칩/일정 바 가독성 확인.
