# Design System: DAWOO ERP
> 라이트모드 기반. 직원이 교육 없이 쓸 수 있어야 한다.
> Pretendard(한글) + Inter(영문) + Berkeley Mono(코드). Lucide React 아이콘.

## Color Tokens
### Surfaces
| Token | Value | Usage |
|-------|-------|-------|
| bg-page | `#f8f9fa` | 페이지 배경 |
| bg-primary | `#ffffff` | 카드/패널/모달 |
| bg-secondary | `#f1f3f5` | 테이블헤더, 비활성 |
| bg-tertiary | `#e9ecef` | 호버 |
| bg-sidebar | `#111827` | 사이드바 |

### Text
| Token | Value | Usage |
|-------|-------|-------|
| text-primary | `#111827` | 제목, 핵심정보 |
| text-secondary | `#4b5563` | 본문, 보조 |
| text-tertiary | `#9ca3af` | 라벨, 힌트 |
| text-quaternary | `#d1d5db` | 플레이스홀더 |

### Status (10단계 + 현장)
| 상태 | BG | Text |
|------|-----|------|
| 문의/실사 | `#f1f3f5` | `#4b5563` |
| 견적/동의/신청 | `#e0e7ff` | `#3730a3` |
| 승인/완료 | `#d1fae5` | `#065f46` |
| 착공/공사 | `#ffedd5` | `#9a3412` |
| 완료서류 | `#ede9fe` | `#5b21b6` |
| 취소 | `#fee2e2` | `#991b1b` |
| 문의(예약) | `#fef3c7` | `#92400e` |

### Accent / Financial / Border
- accent: `#5e6ad2` (hover `#4f56b3`, light `#e0e7ff`)
- money: positive `#059669`, negative `#dc2626`, neutral `#111827`
- border: primary `#e5e7eb`, secondary `#d1d5db`, tertiary `#f3f4f6`

## Typography
| Role | Size | Weight | Usage |
|------|------|--------|-------|
| Page Title | 22px | 600 | 페이지 제목 |
| Section | 16px | 600 | 섹션 제목 |
| Card Title | 14px | 600 | 카드 헤더, 빌라명 |
| Body | 13px | 400/500 | 일반 텍스트 |
| Label | 11px | 500 | 필드 라벨 (0.3px spacing) |
| Badge | 11px | 500 | 상태 뱃지 |
| Money | 13~15px | 600 | 금액 (tabular-nums 필수) |
| Micro | 10px | 400 | 프로그레스 라벨 |
**규칙**: 600 이상 안 씀. 금액은 tabular-nums+오른쪽정렬+콤마. 라벨=text-tertiary.

## Components
- **테이블**: 헤더 bg-secondary, 행 44px, 선택행 accent-light, 금액 오른쪽정렬
- **버튼**: Primary=accent bg / Secondary=border / Danger=#dc2626 / 최소높이 36px
- **뱃지**: 2px 10px padding, radius 999px, 11px 500
- **입력**: 36px높이, 8px radius, 포커스시 accent border+ring
- **카드**: 1px border, 10px radius, 16px 20px padding
- **드래그앤드롭**: 1.5px dashed, 호버시 accent
- **모달**: rgba(0,0,0,0.3) overlay, 12px radius, 24px padding

## Layout
- 사이드바: 240px (접으면 64px)
- 메인: left-margin 240px, padding 24px 32px
- AI비서: 48px 플로팅 → 320px 패널
- 상세패널: 목록55% / 패널45%

## Spacing
xs=4px, sm=8px, md=12px, lg=16px, xl=24px, 2xl=32px

## Responsive
| 구간 | 변화 |
|------|------|
| <768px | 사이드바→햄버거, 테이블→카드, AI→풀스크린 |
| 768~1024 | 사이드바 접힘(64px) |
| 1024+ | 풀 레이아웃 |
**모바일**: 버튼 44px+, 드래그앤드롭→탭/클릭, 사진→카메라 연결

## Do / Don't
- **Do**: tabular-nums+콤마+우정렬, 상태는 색뱃지, 미수금 빨강, 여백으로 구조
- **Don't**: 700+볼드 금지, 순수검정(#000) 금지, 그라디언트 금지, 14px+본문 금지, 모달in모달 금지
