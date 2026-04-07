# Design System: DAWOO ERP

> Linear의 정밀함과 FIELDON의 직관성을 결합한 건설 ERP 디자인 시스템.
> "직원이 교육 없이 쓸 수 있어야 한다" — 제1원칙.

## 1. Visual Theme & Atmosphere

DAWOO ERP는 라이트모드 기반 업무 도구다. 밝은 배경 위에 정보가 명확하게 드러나야 한다. 건설 현장에서 햇빛 아래 모바일로 봐도 읽히는 화면. Linear의 정밀한 타이포그래피와 여백 체계를 가져오되, 밝은 배경에 맞게 변환한다.

전체 분위기: 차분하고 절제된 톤. 불필요한 장식 없음. 색은 상태를 알리는 데만 쓴다. 여백이 구조를 만든다. 글씨 크기와 굵기의 차이가 시각적 계층을 만든다.

**Key Characteristics:**
- 라이트모드 기반: 흰 배경 + 연회색 표면 + 어두운 사이드바
- Pretendard + Inter Variable 조합 (한글은 Pretendard, 영문/숫자는 Inter)
- Linear 스타일 letter-spacing: 제목에 음수, 본문에 normal
- 색은 상태 전달용으로만 사용. 장식용 색 없음.
- 0.5px~1px 보더. 그림자 최소화. 플랫 디자인.
- 넉넉한 여백과 줄 간격으로 정보 밀도 조절

## 2. Color Palette & Roles

### Background Surfaces
| Token | Value | Usage |
|-------|-------|-------|
| bg-page | `#f8f9fa` | 전체 페이지 배경 |
| bg-primary | `#ffffff` | 카드, 패널, 모달, 입력 필드 배경 |
| bg-secondary | `#f1f3f5` | 테이블 헤더, 상시표시 영역, 비활성 표면 |
| bg-tertiary | `#e9ecef` | 호버 상태, 구분선 대용 |
| bg-sidebar | `#111827` | 사이드바 배경 (다크) |
| bg-sidebar-hover | `#1f2937` | 사이드바 메뉴 호버/활성 |

### Text & Content
| Token | Value | Usage |
|-------|-------|-------|
| text-primary | `#111827` | 제목, 이름, 금액 등 핵심 정보 |
| text-secondary | `#4b5563` | 본문, 설명, 주소 등 보조 정보 |
| text-tertiary | `#9ca3af` | 라벨, 힌트, 비활성 텍스트, 날짜 |
| text-quaternary | `#d1d5db` | 플레이스홀더, 빈 값 표시 |
| text-inverse | `#f9fafb` | 사이드바, 다크 배경 위 텍스트 |

### Status Colors (접수대장 10단계 + 현장)
| Status | Background | Text | Usage |
|--------|-----------|------|-------|
| 문의/실사 | `#f1f3f5` | `#4b5563` | 초기 단계 (회색) |
| 견적/동의서/신청서 | `#e0e7ff` | `#3730a3` | 서류 진행 (인디고) |
| 승인 | `#d1fae5` | `#065f46` | 승인 완료 (초록) |
| 착공계/공사 | `#ffedd5` | `#9a3412` | 공사 진행 (주황) |
| 완료서류 | `#ede9fe` | `#5b21b6` | 완료서류 (보라) |
| 입금/완료 | `#d1fae5` | `#065f46` | 최종 완료 (초록) |
| 취소 | `#fee2e2` | `#991b1b` | 취소 (빨강) |
| 문의(예약) | `#fef3c7` | `#92400e` | 예약/대기 (노랑) |
| 긴급 | `#fee2e2` | `#dc2626` | 마감 임박, 미수금 초과 |
| 정상 | `#d1fae5` | `#16a34a` | 이상 없음 |
| 주의 | `#fef3c7` | `#d97706` | 확인 필요 |

### Accent & Interactive
| Token | Value | Usage |
|-------|-------|-------|
| accent-primary | `#5e6ad2` | 주요 CTA 배경 (Linear 인디고) |
| accent-hover | `#4f56b3` | CTA 호버 |
| accent-light | `#e0e7ff` | 선택된 행, 활성 필터 배경 |
| accent-text | `#3730a3` | 액센트 텍스트 |
| link | `#4f46e5` | 텍스트 링크 |

### Financial
| Token | Value | Usage |
|-------|-------|-------|
| money-positive | `#059669` | 수금 완료, 잔액 양호 |
| money-negative | `#dc2626` | 미수금, 초과 지출, 이상치 |
| money-neutral | `#111827` | 일반 금액 |

### Border & Divider
| Token | Value | Usage |
|-------|-------|-------|
| border-primary | `#e5e7eb` | 카드 테두리, 입력 필드 |
| border-secondary | `#d1d5db` | 호버 시 테두리 강조 |
| border-tertiary | `#f3f4f6` | 테이블 행 구분, 가장 연한 선 |
| border-accent | `#5e6ad2` | 활성 탭 밑줄, 선택 상태 |
| border-dashed | `#d1d5db` | 드래그앤드롭 영역 점선 |

## 3. Typography Rules

### Font Family
- **한글**: `Pretendard Variable`, fallback: `Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif`
- **영문/숫자**: `Inter Variable`, fallback: `Inter, system-ui, sans-serif`
- **모노스페이스**: `Berkeley Mono, SF Mono, Consolas, monospace`
- **OpenType**: `"cv01", "ss03"` — Inter에 적용, 더 깔끔한 글자 형태
- **숫자**: `font-variant-numeric: tabular-nums` — 금액/숫자 열 정렬용

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Usage |
|------|------|--------|------------|----------------|-------|
| Page Title | 22px | 600 | 1.2 | -0.4px | 페이지 제목 ("소규모 접수대장") |
| Section Title | 16px | 600 | 1.3 | -0.2px | 섹션 제목 ("기본정보", "실측") |
| Card Title | 14px | 600 | 1.4 | -0.1px | 카드 헤더, 현장명, 빌라명 |
| Body | 13px | 400 | 1.6 | normal | 일반 텍스트, 테이블 셀 |
| Body Medium | 13px | 500 | 1.6 | normal | 담당자 이름, 강조 텍스트 |
| Small | 12px | 400 | 1.5 | normal | 주소, 메모, 보조 정보 |
| Label | 11px | 500 | 1.4 | 0.3px | 필드 라벨, 그룹명, 필터명 |
| Caption | 11px | 400 | 1.4 | normal | 날짜, 시간, 메타 정보 |
| Badge | 11px | 500 | 1.0 | normal | 상태 뱃지, 태그 |
| Money | 13~15px | 600 | 1.0 | normal | 금액 (tabular-nums 필수) |
| Micro | 10px | 400 | 1.3 | normal | 프로그레스 바 라벨, 최소 텍스트 |

**핵심 규칙:**
- 600 이상 굵기 쓰지 않음. 500이 기본 강조, 600이 최대.
- 페이지 제목만 22px, 나머지는 16px 이하. 큰 글씨 남발 금지.
- 금액은 반드시 tabular-nums + 오른쪽 정렬 + 천단위 콤마.
- 라벨은 항상 text-tertiary 색. 값은 text-primary 또는 text-secondary.

## 4. Layout Structure

### 사이드바 (왼쪽 고정)
- 너비: 240px (접으면 64px)
- 배경: bg-sidebar (#111827)
- 메뉴 텍스트: 13px, weight 400, text-inverse
- 활성 메뉴: bg-sidebar-hover + 오른쪽 2px accent-primary 보더
- 그룹 라벨: 11px, weight 500, text-quaternary, uppercase, letter-spacing 0.5px
- 하단: 공지사항, 설정

### 메인 영역
- 왼쪽 마진: 240px
- 패딩: 24px 32px
- 최대 너비 제한 없음

### AI 비서 (오른쪽)
- 플로팅 버튼: 48px 원형, accent-primary, 오른쪽 하단 고정
- 열면: 오른쪽 320px 패널, bg-primary, 왼쪽 1px border-primary

## 5. Component Specifications

### 테이블 (접수대장, 목록 등)
- 헤더: bg-secondary, 11px Label, text-tertiary
- 행: bg-primary, 13px Body, border-bottom border-tertiary
- 행 호버: bg-tertiary
- 선택된 행: accent-light (#e0e7ff)
- 행 높이: 44px (터치 가능)
- 금액 컬럼: 오른쪽 정렬, tabular-nums

### 상세 패널 (접수대장 상세)
- 목록 55% / 패널 45% 비율
- 패널 배경: bg-primary
- 패널 왼쪽: 1px border-primary
- 상시표시: bg-secondary, 패딩 16px 24px
- 탭: border-bottom 1.5px accent-primary (활성), text-tertiary (비활성)

### 카드
- 배경: bg-primary
- 테두리: 1px border-primary
- 모서리: 10px
- 패딩: 16px 20px
- 호버: border-secondary로 테두리 진해짐

### 금액 요약 카드 (총공사비/자부담/시지원/미수금)
- 라벨: 11px, text-tertiary
- 금액: 15px, weight 600, tabular-nums
- 미수금 있으면: bg `#fee2e2`, text `#dc2626`, border `#fecaca`

### 버튼
- Primary: bg accent-primary, text white, 패딩 8px 20px, radius 8px, 13px weight 500
- Secondary: bg transparent, border 1px border-primary, text text-secondary, 패딩 8px 16px, radius 8px
- Danger: bg transparent, border 1px #fecaca, text #dc2626
- Ghost: bg transparent, no border, text text-tertiary, 호버 시 bg-tertiary
- 최소 높이: 36px

### 뱃지/태그
- 상태 뱃지: 패딩 2px 10px, radius 999px, 11px weight 500
- 색은 Status Colors 표 참조
- 공사종류 태그: bg-secondary, text-secondary (중립)

### 필터 칩 (상태 필터, 시 필터)
- 비활성: bg transparent, border 1px border-primary, text-secondary, radius 999px
- 활성: bg text-primary (#111827), text white
- 시 필터 활성: bg accent-light (#e0e7ff), text accent-text (#3730a3), border accent-primary
- 패딩: 4px 14px, 11px weight 400 (비활성) / 500 (활성)

### 프로그레스 바 (접수대장 10단계)
- 바 높이: 3px, radius 1.5px
- 완료: accent-primary (#5e6ad2)
- 현재: accent-primary
- 미래: border-tertiary (#f3f4f6)
- 라벨: 9px, Micro
- 현재 단계 라벨: accent-primary 색, weight 500
- 완료 단계 라벨: text-secondary
- 미래 단계 라벨: text-quaternary

### 입력 필드
- 높이: 36px
- 배경: bg-primary
- 테두리: 1px border-primary
- 모서리: 8px
- 폰트: 13px Body
- 포커스: border accent-primary, ring 0 0 0 2px accent-light
- 라벨: 위에 11px Label, text-tertiary, margin-bottom 4px

### 드래그앤드롭 영역
- 테두리: 1.5px dashed border-dashed (#d1d5db)
- 모서리: 10px
- 패딩: 24px
- 텍스트: 12px, text-tertiary, 가운데 정렬
- 호버: border accent-primary, bg accent-light, text accent-text

### 아코디언 (현장관리)
- 접힌 상태: 카드 스타일 (border-primary, radius 10px)
- 헤더: 패딩 14px 20px, 현장명(14px 600) + 뱃지 + 담당자(12px) + 공정률바 + 예산(13px 600)
- 펼쳐진 상태: 헤더 아래 border-top border-tertiary
- 공정 캘린더: bg-secondary, 패딩 14px 20px

### 공정 캘린더 바
- 확정: 해당 공종 색 채움, 흰 텍스트, radius 4px, 높이 20px
- 미확정: bg-primary, 점선 테두리 (1.5px dashed 공종색), 텍스트 공종색
- 바 텍스트: 9px, weight 500, 말줄임

### 모달
- 배경 오버레이: rgba(0,0,0,0.3)
- 모달: bg-primary, radius 12px, 패딩 24px
- 그림자: 0 20px 60px rgba(0,0,0,0.12)
- 제목: 16px weight 600
- 닫기: text-tertiary, 호버 text-secondary

### 메모/알림 박스
- 메모: bg `#fffbeb`, border `#fef3c7`, text `#92400e` (노란 톤)
- 긴급: bg `#fee2e2`, border `#fecaca`, text `#dc2626` (빨간 톤)
- 정보: bg `#eff6ff`, border `#bfdbfe`, text `#1e40af` (파란 톤)
- 성공: bg `#d1fae5`, border `#a7f3d0`, text `#065f46` (초록 톤)

## 6. Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| space-xs | 4px | 뱃지 내부, 아이콘 간격 |
| space-sm | 8px | 필드 간격, 카드 내부 간격 |
| space-md | 12px | 섹션 내부 간격 |
| space-lg | 16px | 카드 패딩, 섹션 간 간격 |
| space-xl | 24px | 페이지 패딩, 큰 섹션 간격 |
| space-2xl | 32px | 좌우 패딩, 최상위 여백 |

## 7. Do's and Don'ts

### Do
- Pretendard 한글 + Inter 영문 조합 일관 사용
- 금액에 항상 tabular-nums + 천단위 콤마 + 오른쪽 정렬
- 상태는 색깔 뱃지로 즉시 구분 (위 Status Colors 표 참조)
- 미수금/이상치는 빨간색 즉시 강조
- 라벨(text-tertiary)과 값(text-primary)의 색깔 대비 유지
- 테이블 행은 44px 이상 (터치 대응)
- 여백으로 구조를 만들기. 선(border)은 최소화.
- 미래 단계/비활성 요소는 opacity 또는 text-quaternary로 흐릿하게

### Don't
- 700 이상 볼드 사용 금지. 최대 600.
- 순수 검정(#000) 텍스트 사용 금지. #111827 사용.
- 순수 흰색(#fff) 배경만 쓰지 말고 #f8f9fa 페이지 배경 위에 #fff 카드.
- 그라디언트, 그림자 남발 금지. 플랫하게.
- 한 화면에 3개 이상 강조색 동시 사용 금지.
- 아이콘만으로 의미 전달 금지. 텍스트 병행.
- 모달 안에 모달 금지.
- 14px 이상 폰트를 본문에 사용 금지 (제목만 16px+).

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Changes |
|------|-------|---------|
| Mobile | <768px | 사이드바→햄버거, 테이블→카드, AI비서→풀스크린 |
| Tablet | 768~1024px | 사이드바 접힘(64px), 2컬럼 |
| Desktop | 1024~1280px | 풀 레이아웃 |
| Wide | >1280px | 여유 있는 여백 |

### Mobile 규칙
- 사이드바: 햄버거 메뉴 전환
- 테이블: 카드 형태로 변환 (핵심 정보만 표시)
- 상세 패널: 전체 화면 슬라이드
- 드래그앤드롭: 탭/클릭으로 전환
- 사진 업로드: 카메라 직접 연결
- 버튼: 최소 44px 높이 (터치)
- AI 비서: 풀스크린 모달

## 9. FIELDON 원칙 (항상 기억할 것)

1. **열면 바로 안다** — 교육 없이, 설명서 없이, 화면 보면 뭘 해야 하는지 안다
2. **3클릭 안에 도달** — 사이드바 → 메뉴 → 원하는 데이터
3. **물어보기 전에 보여준다** — AI가 부족한 서류, 마감 임박, 빈 일정을 먼저 알린다
4. **현장에서 한 손으로** — 모바일에서 한 손으로 조작 가능
5. **복잡하면 안 쓴다** — 직원이 안 쓰면 의미 없다
