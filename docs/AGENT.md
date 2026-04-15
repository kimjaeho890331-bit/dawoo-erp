# AI 에이전트 시스템
> AGENT_REGISTER/DOCS/QUERY 내용 통합

## 구조
단일 에이전트 + tool 15~20개 (multi-agent는 오버엔지니어링)
```
사용자 입력 (웹 사이드패널)
  ↓
단일 에이전트
  ├── 접수 tools: register_project, update_stage, search_projects, get_building_info
  ├── 서류 tools: trigger_cowork, list_templates, check_doc_status
  ├── 조회 tools: get_stats, get_kpi, search_schedules, get_report
  ├── 공통 tools: search_address, get_calendar, create_schedule
  └── 기억 tools: save_memory, update_preference, read_knowledge
```

## 공통 규칙
- 애매하면 되물어보기 (자의적 판단 금지)
- 필수 미입력 → 다음 단계 차단
- 서류 부족 → 프린트 차단
- 빌라명 앞글자 일치 → 정식명칭 확인 후 저장 + 별칭 메모
- 공사종류 자동분류: 소규모(방수/옥상/기와/도장/계단/담장/기타) vs 수도(수도/공용/아파트수도/옥내)

## 접수팀 도구
### 구현 완료 (5개)
- `search_address` — 도로명/지번 주소 검색
- `get_building_info` — 건축물대장 표제부
- `get_unit_info` — 건축물대장 전유부 (호별 면적)
- `register_project` — 접수대장 신규 등록
- `search_projects` — 접수대장 검색/조회

### 미구현 (계획)
- `update_project` — 접수 정보 수정
- `update_status` — 단계 변경
- `manage_schedule` — 캘린더 일정 관리
- `get_dashboard_stats` — 대시보드 통계

### 단계 자동 전환 규칙
| 현재→다음 | 필수 조건 |
|----------|----------|
| 문의→실사 | 빌라명, 주소, 실측일 예약 |
| 실사→견적 | 실측일, 담당자, 면적, 세대수 |
| 견적→동의서 | 견적서 생성, 총공사비 확정 |
| 동의서→신청서 | 동의서 수령 (수동) |
| 신청서→승인 | 신청서 PDF, 제출일 |
| 승인→착공 | 승인일 (수동), 시공일, 시공업체 |
| 착공→공사 | 착공계 제출 |
| 공사→완료 | 완료일, 전/후 사진 |
| 완료→입금 | 완료보고서, 제출일 |
| 입금 | 미수금=0 |

## 서류팀 도구 (Phase 2)
- PDF 폼필드 자동입력 (Cowork → 구글드라이브)
- 견적서 자동생성 (웹 스프레드시트 데이터 기반)
- 통장사본 OCR (Claude Vision) ✅ 구현완료
- 신규 템플릿: 양식 올리면 AI가 폼필드 자동 분석 → 확인 → 확정

## 조회팀 도구 (Phase 3)
- 현황 검색: 접수대장/현장/직원별 현황
- 보고서 생성: 12개 소스 → 4종(매일/주간/월간/현장마감)
- KPI 산출: 4대영역 100점 자동계산
- 알림: 서류만료 D-day, 미수금 30일+, 공정지연
