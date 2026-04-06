# DAWOO ERP - 다우건설 AI 기반 ERP 시스템

## 개요
정부 지원사업(수도/소규모) 접수부터 수금까지 전 과정을 AI가 자동화하는 ERP 시스템.

## 기술 스택
- **Frontend**: Next.js 14+ / React / Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Storage + Auth)
- **AI**: Claude API (Anthropic)
- **PDF**: pypdf (폼필드 자동입력)
- **배포**: Vercel

## 프로젝트 구조
```
CLAUDE.md                    # 개발 매뉴얼 (핵심 지도)
docs/
├── REGISTER.md              # 접수대장 상세 스펙
├── SITE.md                  # 현장관리 상세 스펙
├── ESTIMATE.md              # 견적서 상세 스펙
├── DOCUMENTS.md             # 서류함 상세 스펙
├── CALENDAR.md              # 캘린더 상세 스펙
├── REPORT.md                # 보고서/KPI 상세 스펙
├── AGENT.md                 # AI 에이전트 상세 스펙
└── DAWOO_DESIGN_FINAL.md    # 전체 설계문서
dawoo_db_schema.sql          # DB 스키마
```

## 개발 순서
1. Supabase DB + Auth
2. 레이아웃 + 사이드바 + AI 사이드 패널
3. 접수대장
4. 서류함 + PDF 자동화
5. 견적서 (웹 스프레드시트)
6. 현장관리 (아코디언 + 캘린더)
7. 업무 캘린더 + AI 교정
8. 대시보드 + 보고서 + KPI
9. 나머지 페이지
