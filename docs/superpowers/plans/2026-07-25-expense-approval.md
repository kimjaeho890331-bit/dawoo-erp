# 지출결의서 전자결재 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오워크에서 운영하던 지출결의서 전자결재를 ERP `/approval`로 옮기고, 최종 승인 시 `expenses`에 자동 등록되게 한다.

**Architecture:** 문서(`expense_reports`) 1건에 지급정보·상세내용·결재선·첨부를 자식 테이블로 매단다. 조회는 프론트가 anon 클라이언트로 직접 읽고, **상태를 바꾸는 모든 액션은 `/api/approval/*` 서버 라우트로만** 처리한다(로그인 사용자를 `staff.email`로 특정해 권한을 서버에서 검증). 상태 전이 규칙은 `src/lib/approval/status.ts` 한 곳에 두고 화면과 API가 같은 함수를 공유한다.

**Tech Stack:** Next.js 16 App Router / TypeScript / Supabase(PostgreSQL) / Tailwind v4 / exceljs(이미 설치됨) / web-push / Vitest

## Global Constraints

- 설계 근거는 `docs/superpowers/specs/2026-07-25-expense-approval-design.md`. 충돌하면 스펙이 우선이다.
- **새 테이블에 RLS를 켜지 않는다.** 프론트가 anon 키로 직접 읽는 현행 구조에서 `authenticated` 전용 정책을 켜면 화면이 통째로 막힌다. `supabase/migrations/010_labor_records.sql`과 같은 주석을 남긴다.
- 마이그레이션은 `supabase/migrations/NNN_<설명>.sql` 형식. 다음 번호는 **012**. 적용은 `npx supabase db push`(CLI 링크 완료 상태), 롤백 SQL은 파일 하단에 주석으로 남긴다.
- 새 테이블·컬럼은 `dawoo_db_schema.sql`에도 반영한다.
- 아이콘은 Lucide React 단색(`text-tertiary` 계열). **이모지 금지.**
- 인라인 편집 우선, `input` 남발 금지. 파일은 드래그앤드롭 + 미리보기.
- 날짜는 `YYYY-MM-DD`만 허용. 숫자는 숫자만. `src/lib/utils/validate.ts` 규칙과 맞춘다.
- 금액 표시는 `src/lib/utils/format.ts`의 `formatMoney(value: string | number): string` / `parseMoney(value: string): number`를 쓴다. 둘 다 순수 함수라 서버 라우트에서도 안전하다.
- Tailwind 토큰은 `src/app/globals.css`에 정의된 것만 쓴다. **Tailwind 기본 팔레트(`blue-600`, `red-600` 등)를 쓰지 않는다** — 이 프로젝트의 브랜드색은 파랑이 아니라 테라코타(`#c96442`)다.
  - 면: `bg-surface` · `bg-surface-secondary` · `bg-surface-tertiary`
  - 글자: `text-txt-primary` · `text-txt-secondary` · `text-txt-tertiary` · `text-txt-quaternary` · `text-txt-inverse`
  - 테두리: **`border-border-primary`**(`border-border`가 아니다) · `border-border-secondary`
  - 강조(주요 버튼·활성 상태·승인): `bg-accent` · `bg-accent-hover` · `bg-accent-light` · `text-accent-text` · `border-accent`
  - 위험(에러·필수 표시·반려): `text-danger` · `bg-danger-bg` · `border-danger`
- 계정과목 후보는 `식대 / 교통비 / 자재비 / 현장경비 / 노무비 / 사무용품 / 기타` (기존 `ExpensesPage.tsx:65`의 `EXPENSE_CATS`와 동일해야 한다).
- 문서번호 형식은 `CDV-26-000158` — `양식약어-년2자리-순번6자리`. 2026년 시작값은 `157`.
- 첨부 제한: 20MB 미만, 이미지(jpg·jpeg·png·gif)·문서(doc·docx·ppt·pptx·xls·xlsx·pdf·hwp), 최대 10개.
- 테스트는 순수 로직만. UI는 `npm run build` + 브라우저 확인으로 검증한다.

## File Structure

**신규**

| 파일 | 책임 |
|---|---|
| `supabase/migrations/012_expense_approval.sql` | 테이블 7개 + `doc_sequences` + `next_doc_no()` 함수 |
| `src/types/approval.ts` | 상태·역할 상수와 DB 행 타입 |
| `src/lib/approval/status.ts` | 상태 전이 규칙. 화면·API 공유 (순수함수) |
| `src/lib/approval/docNo.ts` | 문서번호 포맷 + 채번 RPC 호출 |
| `src/lib/approval/toExpense.ts` | 지급정보 → `expenses` 매핑 (순수함수) |
| `src/lib/approval/excel.ts` | 엑셀 양식 생성·파싱 |
| `src/lib/approval/guard.ts` | API 공통 인증·권한 가드 |
| `src/lib/push/send.ts` | 웹푸시 발송 |
| `src/app/api/approval/{save,delete,submit,withdraw,approve,reject,cancel}/route.ts` | 액션 라우트 |
| `src/app/api/approval/excel-template/route.ts` · `excel-parse/route.ts` | 엑셀 |
| `src/app/api/push/subscribe/route.ts` | 푸시 구독 등록 |
| `src/app/approval/page.tsx` · `src/app/approval/[id]/page.tsx` · `src/app/approval/new/page.tsx` | 라우트 (import만) |
| `src/components/approval/ApprovalPage.tsx` | 문서함 사이드 + 목록 |
| `src/components/approval/ApprovalDetail.tsx` | 문서 상세 + 액션 버튼 |
| `src/components/approval/DraftForm.tsx` | 기안 작성/편집 |
| `src/components/approval/PaymentTable.tsx` | 지급 정보 표 |
| `src/components/approval/DetailTable.tsx` | 상세 내용 표 (일괄 적용) |
| `src/components/approval/ApprovalLineModal.tsx` | 결재선 설정 팝업 |
| `src/components/approval/ApprovalLineView.tsx` | 결재선 카드 (목록·상세 공용) |
| `src/components/approval/ApproveModal.tsx` | 승인/반려 팝업 |
| `src/components/approval/FileAttach.tsx` | 첨부 드래그앤드롭 |
| `src/components/settings/PushToggle.tsx` | 알림 켜기 토글 |
| `vitest.config.ts` | 테스트 설정 |

**수정**

| 파일 | 변경 |
|---|---|
| `package.json` | `vitest`·`web-push` 추가, `test` 스크립트 |
| `src/components/Sidebar.tsx:24` | 기존 `/expenses` 라벨을 `지출관리`로 바꾸고 `지출결의서 → /approval` 추가 |
| `src/app/api/storage/upload/route.ts` | `ALLOWED_PATH_PREFIXES`에 `'approval/'` 추가 |
| `src/components/dashboard/*` | `결재할 문서 N건` 카드 |
| `src/components/settings/*` | 알림 토글 배치 |
| `dawoo_db_schema.sql` | 새 테이블 반영 |
| `CLAUDE.md` | 페이지 구조·테이블 목록 갱신 |

**스펙과 다른 점 하나:** 스펙은 `/api/push/send`를 라우트로 적었지만, 여기서는 `src/lib/push/send.ts`의 `sendPush()` 함수로 만든다. 어차피 결재 라우트 안에서만 호출하므로 HTTP 한 번을 더 태울 이유가 없고, 라우트로 두면 외부에서 임의의 푸시를 쏘는 통로가 생긴다.

**중요 — 이름 충돌:** 현재 `Sidebar.tsx:24`에서 `/expenses`가 이미 `지출결의서`라는 이름을 달고 있다. 실제 내용은 지출 기록장(지출·고정비·카드)이므로 **`지출관리`로 고치고**, 새로 만드는 `/approval`이 `지출결의서` 이름을 가져간다. Task 2에서 처리한다.

---

### Task 1: 테스트 환경 + 타입 + 상태 전이 규칙

결재 전체가 이 규칙 위에 선다. 여기가 틀리면 남이 내 문서를 승인하거나, 이미 처리된 문서를 회수할 수 있다.

**Files:**
- Create: `vitest.config.ts`
- Create: `src/types/approval.ts`
- Create: `src/lib/approval/status.ts`
- Create: `src/lib/approval/status.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `ApprovalStatus`, `LineRole`, `LineState`, `ExpenseReport`, `ExpenseReportPayment`, `ExpenseReportDetail`, `ExpenseReportLine`, `ExpenseReportFile` 타입. `currentTurnLine()`, `canSubmit()`, `canWithdraw()`, `canDelete()`, `canApprove()`, `canCancel()`, `isFinalApprover()`, `validateApprovalLine()` 함수.

- [ ] **Step 1: Vitest 설치**

```bash
npm install -D vitest
```

- [ ] **Step 2: `vitest.config.ts` 생성**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

- [ ] **Step 3: `package.json`에 test 스크립트 추가**

`"scripts"` 안에 추가한다.

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: `src/types/approval.ts` 생성**

```ts
// ============================================
// 지출결의서 전자결재 타입
// DB: supabase/migrations/012_expense_approval.sql
// ============================================

export const APPROVAL_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'withdrawn'] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  draft: '저장된',
  pending: '진행중',
  approved: '완료',
  rejected: '반려된',
  withdrawn: '회수된',
}

export const LINE_ROLES = ['approval', 'cooperation'] as const
export type LineRole = (typeof LINE_ROLES)[number]

export const LINE_ROLE_LABEL: Record<LineRole, string> = {
  approval: '결재',
  cooperation: '협조',
}

export const LINE_STATES = ['waiting', 'approved', 'rejected'] as const
export type LineState = (typeof LINE_STATES)[number]

export const LINE_STATE_LABEL: Record<LineState, string> = {
  waiting: '대기',
  approved: '승인',
  rejected: '반려',
}

// 계정과목 — ExpensesPage.tsx의 EXPENSE_CATS와 동일해야 한다
export const EXPENSE_CATEGORIES = [
  '식대', '교통비', '자재비', '현장경비', '노무비', '사무용품', '기타',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const FORM_ABBR = 'CDV'

export interface ExpenseReport {
  id: string
  doc_no: string | null
  title: string
  status: ApprovalStatus
  drafter_staff_id: string
  submitted_at: string | null
  completed_at: string | null
  total_amount: number
  category: string | null
  body_html: string | null
  retention_years: number
  created_at: string
  updated_at: string
}

export interface ExpenseReportPayment {
  id: string
  report_id: string
  seq: number
  vendor_name: string
  amount: number
  pay_request_date: string
  bank: string
  account_no: string
  business_no: string | null
  expense_id: string | null
}

export interface ExpenseReportDetail {
  id: string
  report_id: string
  seq: number
  vendor_name: string | null
  account: string | null
  content: string | null
  dept_name: string | null
  amount: number | null
  note: string | null
}

export interface ExpenseReportLine {
  id: string
  report_id: string
  seq: number
  staff_id: string
  role: LineRole
  state: LineState
  acted_at: string | null
  comment: string | null
}

export interface ExpenseReportFile {
  id: string
  report_id: string
  file_name: string
  file_url: string
  size: number
  uploaded_at: string
}

export interface ExpenseReportRef {
  id: string
  report_id: string
  ref_report_id: string
}

// --- 화면 입력용 행 ---
// 컴포넌트가 아니라 여기에 둔다. 서버 전용 모듈(excel.ts)이 'use client' 파일을
// import 하면 모듈 그래프가 섞인다.

export interface PaymentRow {
  vendor_name: string
  amount: number
  pay_request_date: string
  bank: string
  account_no: string
  business_no: string
}

export interface DetailRow {
  vendor_name: string
  account: string
  content: string
  dept_name: string
  amount: number
  note: string
}

export const EMPTY_PAYMENT: PaymentRow = {
  vendor_name: '', amount: 0, pay_request_date: '',
  bank: '', account_no: '', business_no: '',
}

export const EMPTY_DETAIL: DetailRow = {
  vendor_name: '', account: '', content: '', dept_name: '', amount: 0, note: '',
}
```

- [ ] **Step 5: 실패하는 테스트 작성 — `src/lib/approval/status.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  currentTurnLine, canSubmit, canWithdraw, canDelete,
  canApprove, canCancel, isFinalApprover, validateApprovalLine,
} from './status'
import type { ExpenseReport, ExpenseReportLine } from '@/types/approval'

const DRAFTER = 'staff-kim'
const A = 'staff-choi'
const B = 'staff-cho'

function report(over: Partial<ExpenseReport> = {}): ExpenseReport {
  return {
    id: 'r1', doc_no: null, title: '테스트', status: 'pending',
    drafter_staff_id: DRAFTER, submitted_at: null, completed_at: null,
    total_amount: 0, category: null, body_html: null, retention_years: 5,
    created_at: '', updated_at: '', ...over,
  }
}

function line(seq: number, staff_id: string, over: Partial<ExpenseReportLine> = {}): ExpenseReportLine {
  return {
    id: `l${seq}`, report_id: 'r1', seq, staff_id,
    role: 'approval', state: 'waiting', acted_at: null, comment: null, ...over,
  }
}

describe('currentTurnLine', () => {
  it('대기 중인 행 가운데 seq가 가장 작은 행을 고른다', () => {
    const lines = [line(2, B), line(1, A, { state: 'approved' }), line(3, B)]
    expect(currentTurnLine(lines)?.seq).toBe(2)
  })

  it('전부 처리됐으면 null', () => {
    expect(currentTurnLine([line(1, A, { state: 'approved' })])).toBeNull()
  })
})

describe('canApprove', () => {
  const lines = [line(1, A), line(2, B)]

  it('현재 차례인 사람은 승인할 수 있다', () => {
    expect(canApprove(report(), lines, A)).toBe(true)
  })

  it('차례가 아닌 사람은 승인할 수 없다', () => {
    expect(canApprove(report(), lines, B)).toBe(false)
  })

  it('진행중이 아니면 아무도 승인할 수 없다', () => {
    expect(canApprove(report({ status: 'approved' }), lines, A)).toBe(false)
  })

  it('결재선에 없는 사람은 승인할 수 없다', () => {
    expect(canApprove(report(), lines, 'staff-outsider')).toBe(false)
  })
})

describe('isFinalApprover', () => {
  it('seq가 가장 큰 사람이 최종 결재자다', () => {
    const lines = [line(1, A), line(2, B)]
    expect(isFinalApprover(lines, B)).toBe(true)
    expect(isFinalApprover(lines, A)).toBe(false)
  })
})

describe('canWithdraw', () => {
  it('아무도 처리하지 않았으면 기안자가 회수할 수 있다', () => {
    expect(canWithdraw(report(), [line(1, A)], DRAFTER)).toBe(true)
  })

  it('1차 결재자가 이미 처리했으면 회수할 수 없다', () => {
    const lines = [line(1, A, { state: 'approved' }), line(2, B)]
    expect(canWithdraw(report(), lines, DRAFTER)).toBe(false)
  })

  it('기안자가 아니면 회수할 수 없다', () => {
    expect(canWithdraw(report(), [line(1, A)], A)).toBe(false)
  })
})

describe('canDelete', () => {
  it('저장된·회수된·반려된만 삭제할 수 있다', () => {
    expect(canDelete(report({ status: 'draft' }), DRAFTER)).toBe(true)
    expect(canDelete(report({ status: 'withdrawn' }), DRAFTER)).toBe(true)
    expect(canDelete(report({ status: 'rejected' }), DRAFTER)).toBe(true)
  })

  it('진행중과 완료는 삭제할 수 없다', () => {
    expect(canDelete(report({ status: 'pending' }), DRAFTER)).toBe(false)
    expect(canDelete(report({ status: 'approved' }), DRAFTER)).toBe(false)
  })
})

describe('canSubmit', () => {
  it('기안자가 저장된·회수된·반려된 문서를 상신한다', () => {
    expect(canSubmit(report({ status: 'draft' }), DRAFTER)).toBe(true)
    expect(canSubmit(report({ status: 'rejected' }), DRAFTER)).toBe(true)
  })

  it('이미 진행중이면 다시 상신할 수 없다', () => {
    expect(canSubmit(report({ status: 'pending' }), DRAFTER)).toBe(false)
  })
})

describe('canCancel', () => {
  it('내가 승인했고 뒷사람이 아직이면 취소할 수 있다', () => {
    const lines = [line(1, A, { state: 'approved' }), line(2, B)]
    expect(canCancel(report(), lines, A)).toBe(true)
  })

  it('뒷사람이 이미 처리했으면 취소할 수 없다', () => {
    const lines = [line(1, A, { state: 'approved' }), line(2, B, { state: 'approved' })]
    expect(canCancel(report(), lines, A)).toBe(false)
  })

  it('문서가 완료됐으면 취소할 수 없다', () => {
    const lines = [line(1, A, { state: 'approved' })]
    expect(canCancel(report({ status: 'approved' }), lines, A)).toBe(false)
  })
})

describe('validateApprovalLine', () => {
  it('정상 결재선은 null을 돌려준다', () => {
    expect(validateApprovalLine([line(1, A, { role: 'cooperation' }), line(2, B)], DRAFTER)).toBeNull()
  })

  it('빈 결재선은 막는다', () => {
    expect(validateApprovalLine([], DRAFTER)).toBe('결재선을 설정해 주세요.')
  })

  it('기안자 본인은 결재선에 넣을 수 없다', () => {
    expect(validateApprovalLine([line(1, DRAFTER)], DRAFTER)).toBe('기안자는 본인을 결재자로 지정할 수 없습니다.')
  })

  it('마지막이 협조자면 막는다', () => {
    expect(validateApprovalLine([line(1, A), line(2, B, { role: 'cooperation' })], DRAFTER))
      .toBe('마지막은 결재 역할이어야 합니다.')
  })

  it('같은 사람을 두 번 넣을 수 없다', () => {
    expect(validateApprovalLine([line(1, A), line(2, A)], DRAFTER))
      .toBe('같은 사람을 두 번 지정할 수 없습니다.')
  })
})
```

- [ ] **Step 6: 테스트가 실패하는지 확인**

```bash
npm test
```

기대: `Failed to resolve import "./status"` — 아직 파일이 없다.

- [ ] **Step 7: `src/lib/approval/status.ts` 구현**

```ts
import type { ExpenseReport, ExpenseReportLine } from '@/types/approval'

type LineLike = Pick<ExpenseReportLine, 'seq' | 'staff_id' | 'role' | 'state'>
type ReportLike = Pick<ExpenseReport, 'status' | 'drafter_staff_id'>

const EDITABLE: ExpenseReport['status'][] = ['draft', 'withdrawn', 'rejected']

/** 지금 결재할 차례인 행. 대기 중인 행 가운데 seq가 가장 작은 것. */
export function currentTurnLine<T extends LineLike>(lines: T[]): T | null {
  const waiting = lines.filter(l => l.state === 'waiting').sort((a, b) => a.seq - b.seq)
  return waiting[0] ?? null
}

/** seq가 가장 큰 사람이 최종 결재자다. */
export function isFinalApprover(lines: LineLike[], staffId: string): boolean {
  if (lines.length === 0) return false
  const last = [...lines].sort((a, b) => a.seq - b.seq)[lines.length - 1]
  return last.staff_id === staffId
}

export function canSubmit(report: ReportLike, staffId: string): boolean {
  return report.drafter_staff_id === staffId && EDITABLE.includes(report.status)
}

export function canDelete(report: ReportLike, staffId: string): boolean {
  return report.drafter_staff_id === staffId && EDITABLE.includes(report.status)
}

/** 회수는 아무도 결재를 처리하지 않았을 때만 가능하다. */
export function canWithdraw(report: ReportLike, lines: LineLike[], staffId: string): boolean {
  if (report.status !== 'pending') return false
  if (report.drafter_staff_id !== staffId) return false
  return lines.every(l => l.state === 'waiting')
}

export function canApprove(report: ReportLike, lines: LineLike[], staffId: string): boolean {
  if (report.status !== 'pending') return false
  const turn = currentTurnLine(lines)
  return turn !== null && turn.staff_id === staffId
}

/** 완료된 문서는 이미 지출이 생성돼 취소할 수 없다. */
export function canCancel(report: ReportLike, lines: LineLike[], staffId: string): boolean {
  if (report.status !== 'pending') return false
  const mine = lines.find(l => l.staff_id === staffId && l.state === 'approved')
  if (!mine) return false
  return !lines.some(l => l.seq > mine.seq && l.state !== 'waiting')
}

/** 저장·상신 전 결재선 검증. 문제가 없으면 null. */
export function validateApprovalLine(lines: LineLike[], drafterStaffId: string): string | null {
  if (lines.length === 0) return '결재선을 설정해 주세요.'
  if (lines.some(l => l.staff_id === drafterStaffId)) {
    return '기안자는 본인을 결재자로 지정할 수 없습니다.'
  }
  const ids = lines.map(l => l.staff_id)
  if (new Set(ids).size !== ids.length) return '같은 사람을 두 번 지정할 수 없습니다.'
  const sorted = [...lines].sort((a, b) => a.seq - b.seq)
  if (sorted[sorted.length - 1].role !== 'approval') return '마지막은 결재 역할이어야 합니다.'
  return null
}
```

- [ ] **Step 8: 테스트 통과 확인**

```bash
npm test
```

기대: PASS, 20개 내외 전부 통과.

- [ ] **Step 9: 커밋**

```bash
git add package.json package-lock.json vitest.config.ts src/types/approval.ts src/lib/approval/status.ts src/lib/approval/status.test.ts
git commit -m "feat(approval): 결재 상태 전이 규칙과 타입 정의, Vitest 도입"
```

---

### Task 2: DB 마이그레이션 + 사이드바 이름 정리

**Files:**
- Create: `supabase/migrations/012_expense_approval.sql`
- Modify: `dawoo_db_schema.sql`
- Modify: `src/components/Sidebar.tsx:24`

**Interfaces:**
- Consumes: Task 1의 타입 (컬럼명이 일치해야 한다)
- Produces: `expense_reports`, `expense_report_payments`, `expense_report_details`, `expense_report_lines`, `expense_report_files`, `expense_report_refs`, `doc_sequences`, `push_subscriptions` 테이블. `next_doc_no(text, int) → text` 함수.

- [ ] **Step 1: 마이그레이션 파일 작성 — `supabase/migrations/012_expense_approval.sql`**

```sql
-- 012_expense_approval.sql
-- 지출결의서 전자결재 (카카오워크 전자결재 대체)
-- 문서 1건 = expense_reports 1행 + 지급정보/상세내용/결재선/첨부 자식 행
-- RLS 미적용: 현행 구조(프론트 anon 클라이언트, 타 테이블 RLS off)와 동일.
--             쓰기 보호는 /api/approval/* 서버 라우트에서 수행한다.

-- 적용

CREATE TABLE IF NOT EXISTS expense_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no TEXT UNIQUE,                          -- CDV-26-000158. 결재 완료 시 채번
  title TEXT NOT NULL,                         -- 기안제목 (50자)
  status TEXT NOT NULL DEFAULT 'draft',        -- draft/pending/approved/rejected/withdrawn
  drafter_staff_id UUID NOT NULL REFERENCES staff(id),
  submitted_at TIMESTAMPTZ,                    -- 상신일시
  completed_at TIMESTAMPTZ,                    -- 결재완료일시
  total_amount BIGINT NOT NULL DEFAULT 0,      -- 지급 총계 = payments 합계
  category TEXT,                               -- 계정과목. 최종 승인 시 결재자가 선택
  body_html TEXT,                              -- 본문 에디터
  retention_years INT NOT NULL DEFAULT 5,      -- 보존연한 (표시용)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_report_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  seq INT NOT NULL DEFAULT 0,
  vendor_name TEXT NOT NULL,
  amount BIGINT NOT NULL,
  pay_request_date DATE NOT NULL,
  bank TEXT NOT NULL,
  account_no TEXT NOT NULL,
  business_no TEXT,
  expense_id UUID REFERENCES expenses(id)      -- 승인 시 생성된 지출. 중복 생성 방지 키
);

CREATE TABLE IF NOT EXISTS expense_report_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  seq INT NOT NULL DEFAULT 0,
  vendor_name TEXT,
  account TEXT,
  content TEXT,
  dept_name TEXT,
  amount BIGINT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS expense_report_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  seq INT NOT NULL,                            -- 결재 순서. 작을수록 먼저
  staff_id UUID NOT NULL REFERENCES staff(id),
  role TEXT NOT NULL,                          -- approval / cooperation
  state TEXT NOT NULL DEFAULT 'waiting',       -- waiting / approved / rejected
  acted_at TIMESTAMPTZ,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS expense_report_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_report_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  ref_report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS doc_sequences (
  form_abbr TEXT NOT NULL,
  year INT NOT NULL,
  last_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (form_abbr, year)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_er_status ON expense_reports(status);
CREATE INDEX IF NOT EXISTS idx_er_drafter ON expense_reports(drafter_staff_id);
CREATE INDEX IF NOT EXISTS idx_er_submitted ON expense_reports(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_report ON expense_report_payments(report_id);
CREATE INDEX IF NOT EXISTS idx_erd_report ON expense_report_details(report_id);
CREATE INDEX IF NOT EXISTS idx_erl_report ON expense_report_lines(report_id);
CREATE INDEX IF NOT EXISTS idx_erl_staff ON expense_report_lines(staff_id, state);
CREATE INDEX IF NOT EXISTS idx_erf_report ON expense_report_files(report_id);
CREATE INDEX IF NOT EXISTS idx_push_staff ON push_subscriptions(staff_id);

-- 카카오워크 마지막 문서번호가 CDV-26-000157이므로 158부터 이어간다
INSERT INTO doc_sequences (form_abbr, year, last_no)
VALUES ('CDV', 2026, 157)
ON CONFLICT (form_abbr, year) DO NOTHING;

-- 문서번호 원자적 채번. 동시에 두 명이 승인해도 번호가 겹치지 않는다.
CREATE OR REPLACE FUNCTION next_doc_no(p_form_abbr TEXT, p_year INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_no INT;
BEGIN
  INSERT INTO doc_sequences (form_abbr, year, last_no)
  VALUES (p_form_abbr, p_year, 0)
  ON CONFLICT (form_abbr, year) DO NOTHING;

  UPDATE doc_sequences
     SET last_no = last_no + 1
   WHERE form_abbr = p_form_abbr AND year = p_year
  RETURNING last_no INTO v_no;

  RETURN p_form_abbr || '-' || lpad((p_year % 100)::TEXT, 2, '0') || '-' || lpad(v_no::TEXT, 6, '0');
END
$$;

COMMENT ON TABLE expense_reports IS '지출결의서 문서 본체';
COMMENT ON TABLE expense_report_payments IS '지급 정보 — 실제 송금 대상 1행';
COMMENT ON TABLE expense_report_details IS '상세 내용 — 비용 내역 (선택)';
COMMENT ON TABLE expense_report_lines IS '결재선 — seq 순서대로 결재/협조';
COMMENT ON TABLE doc_sequences IS '문서번호 순번. 2026년 CDV는 157부터 시작(카카오워크 이어받기)';
COMMENT ON FUNCTION next_doc_no IS '문서번호 원자적 채번 — CDV-26-000158 형식';

-- 롤백 (필요 시 수동 실행)
-- DROP FUNCTION IF EXISTS next_doc_no(TEXT, INT);
-- DROP TABLE IF EXISTS push_subscriptions;
-- DROP TABLE IF EXISTS doc_sequences;
-- DROP TABLE IF EXISTS expense_report_refs;
-- DROP TABLE IF EXISTS expense_report_files;
-- DROP TABLE IF EXISTS expense_report_lines;
-- DROP TABLE IF EXISTS expense_report_details;
-- DROP TABLE IF EXISTS expense_report_payments;
-- DROP TABLE IF EXISTS expense_reports;
```

- [ ] **Step 2: 마이그레이션 적용**

```bash
npx supabase db push
```

기대: `Applying migration 012_expense_approval.sql...` 후 에러 없이 종료.

`expenses` 테이블이 없다는 에러가 나면 중단하고 사람에게 알린다 — `expense_report_payments.expense_id`가 참조하는 테이블이다.

- [ ] **Step 3: 채번 함수가 실제로 158을 내는지 확인**

```bash
npx supabase db execute --query "SELECT next_doc_no('CDV', 2026);"
```

기대: `CDV-26-000158`

한 번 더 실행하면 `CDV-26-000159`가 나와야 한다. 확인 후 시드값을 되돌린다.

```bash
npx supabase db execute --query "UPDATE doc_sequences SET last_no = 157 WHERE form_abbr='CDV' AND year=2026; SELECT last_no FROM doc_sequences;"
```

기대: `157`

- [ ] **Step 4: `dawoo_db_schema.sql`에 반영**

파일 맨 끝에 `012_expense_approval.sql`의 `CREATE TABLE` 블록 8개와 `next_doc_no` 함수를 그대로 덧붙인다. 주석 헤더를 앞에 둔다.

```sql
-- ============================================
-- 23. 지출결의서 전자결재 (012_expense_approval.sql)
-- ============================================
```

- [ ] **Step 5: 사이드바 이름 정리 — `src/components/Sidebar.tsx`**

`업무` 그룹에서 기존 항목의 이름을 바꾸고 새 항목을 그 위에 넣는다.

```tsx
      { name: '업무 캘린더', path: '/calendar/work', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
      { name: '지출결의서', path: '/approval', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { name: '지출관리', path: '/expenses', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
```

- [ ] **Step 6: 빌드 확인**

```bash
npm run build
```

기대: 에러 없이 완료.

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/012_expense_approval.sql dawoo_db_schema.sql src/components/Sidebar.tsx
git commit -m "feat(approval): 지출결의서 테이블 8개와 채번 함수 추가, 사이드바 메뉴 정리"
```

---

### Task 3: 문서번호 채번 래퍼

**Files:**
- Create: `src/lib/approval/docNo.ts`
- Create: `src/lib/approval/docNo.test.ts`

**Interfaces:**
- Consumes: Task 2의 `next_doc_no(text, int)` RPC, Task 1의 `FORM_ABBR`
- Produces: `formatDocNo(formAbbr, year, seq) → string`, `issueDocNo(admin, year?) → Promise<string>`

- [ ] **Step 1: 실패하는 테스트 작성 — `src/lib/approval/docNo.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { formatDocNo } from './docNo'

describe('formatDocNo', () => {
  it('양식약어-년2자리-순번6자리로 만든다', () => {
    expect(formatDocNo('CDV', 2026, 158)).toBe('CDV-26-000158')
  })

  it('순번을 6자리로 채운다', () => {
    expect(formatDocNo('CDV', 2026, 1)).toBe('CDV-26-000001')
  })

  it('연도가 2자리 미만이면 0을 채운다', () => {
    expect(formatDocNo('CDV', 2100, 7)).toBe('CDV-00-000007')
  })

  it('6자리를 넘으면 자르지 않는다', () => {
    expect(formatDocNo('CDV', 2026, 1234567)).toBe('CDV-26-1234567')
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
npm test -- docNo
```

기대: FAIL — `Failed to resolve import "./docNo"`

- [ ] **Step 3: `src/lib/approval/docNo.ts` 구현**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { FORM_ABBR } from '@/types/approval'

/** CDV-26-000158 형식으로 조립한다. 채번 자체는 DB 함수가 한다. */
export function formatDocNo(formAbbr: string, year: number, seq: number): string {
  const yy = String(year % 100).padStart(2, '0')
  return `${formAbbr}-${yy}-${String(seq).padStart(6, '0')}`
}

/**
 * 문서번호를 발급한다. 동시 승인에도 번호가 겹치지 않도록 DB 함수에서 원자적으로 증가시킨다.
 * service_role 클라이언트로만 호출한다.
 */
export async function issueDocNo(
  admin: SupabaseClient,
  year: number = new Date().getFullYear(),
): Promise<string> {
  const { data, error } = await admin.rpc('next_doc_no', {
    p_form_abbr: FORM_ABBR,
    p_year: year,
  })
  if (error) throw new Error(`문서번호 채번 실패: ${error.message}`)
  if (typeof data !== 'string') throw new Error('문서번호 채번 실패: 응답이 문자열이 아닙니다')
  return data
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm test -- docNo
```

기대: PASS 4건

- [ ] **Step 5: 커밋**

```bash
git add src/lib/approval/docNo.ts src/lib/approval/docNo.test.ts
git commit -m "feat(approval): 문서번호 채번 래퍼"
```

---

### Task 4: 승인 → 지출 매핑

지출이 두 번 생기는 걸 막는 유일한 방어선이 여기 있다.

**Files:**
- Create: `src/lib/approval/toExpense.ts`
- Create: `src/lib/approval/toExpense.test.ts`

**Interfaces:**
- Consumes: Task 1의 `ExpenseReport`, `ExpenseReportPayment`
- Produces: `ExpenseInsert` 타입, `paymentsToExpenses(args) → { payment_id, expense }[]`

- [ ] **Step 1: 실패하는 테스트 작성 — `src/lib/approval/toExpense.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { paymentsToExpenses } from './toExpense'
import type { ExpenseReportPayment } from '@/types/approval'

function payment(over: Partial<ExpenseReportPayment> = {}): ExpenseReportPayment {
  return {
    id: 'p1', report_id: 'r1', seq: 0,
    vendor_name: '나래이앤씨', amount: 9900000, pay_request_date: '2026-07-24',
    bank: '농협은행', account_no: '352-0373-7807-13', business_no: '507-27-20974',
    expense_id: null, ...over,
  }
}

const report = { title: '잠원초 인방보수공사 계약금 30%', doc_no: 'CDV-26-000158', drafter_staff_id: 'staff-kim' }

describe('paymentsToExpenses', () => {
  it('지급정보 1행을 지출 1건으로 바꾼다', () => {
    const out = paymentsToExpenses({ report, payments: [payment()], category: '자재비', firstFileUrl: null })
    expect(out).toHaveLength(1)
    expect(out[0].payment_id).toBe('p1')
    expect(out[0].expense).toEqual({
      title: '잠원초 인방보수공사 계약금 30%',
      amount: 9900000,
      expense_date: '2026-07-24',
      category: '자재비',
      staff_id: 'staff-kim',
      site_id: null,
      receipt_url: null,
      memo: '[CDV-26-000158] 나래이앤씨 / 농협은행 352-0373-7807-13',
    })
  })

  it('지급정보가 2행 이상이면 제목에 거래처명을 덧붙인다', () => {
    const payments = [
      payment({ id: 'p1', vendor_name: '신성공사 [단독]', amount: 9100000 }),
      payment({ id: 'p2', vendor_name: '신성공사 [새한]', amount: 2800000 }),
    ]
    const out = paymentsToExpenses({ report, payments, category: '자재비', firstFileUrl: null })
    expect(out[0].expense.title).toBe('잠원초 인방보수공사 계약금 30% (신성공사 [단독])')
    expect(out[1].expense.title).toBe('잠원초 인방보수공사 계약금 30% (신성공사 [새한])')
  })

  it('이미 지출이 만들어진 행은 건너뛴다', () => {
    const payments = [payment({ id: 'p1', expense_id: 'exp-1' }), payment({ id: 'p2' })]
    const out = paymentsToExpenses({ report, payments, category: '자재비', firstFileUrl: null })
    expect(out).toHaveLength(1)
    expect(out[0].payment_id).toBe('p2')
  })

  it('전부 이미 만들어졌으면 빈 배열', () => {
    const payments = [payment({ expense_id: 'exp-1' })]
    expect(paymentsToExpenses({ report, payments, category: '자재비', firstFileUrl: null })).toEqual([])
  })

  it('첫 번째 첨부파일을 영수증으로 붙인다', () => {
    const out = paymentsToExpenses({ report, payments: [payment()], category: '자재비', firstFileUrl: 'https://x/a.jpg' })
    expect(out[0].expense.receipt_url).toBe('https://x/a.jpg')
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
npm test -- toExpense
```

기대: FAIL — 모듈 없음

- [ ] **Step 3: `src/lib/approval/toExpense.ts` 구현**

```ts
import type { ExpenseReport, ExpenseReportPayment } from '@/types/approval'

/** expenses 테이블에 넣을 행. site_id는 항상 null — 양식에 현장 칸이 없다. */
export interface ExpenseInsert {
  title: string
  amount: number
  expense_date: string
  category: string
  staff_id: string
  site_id: null
  receipt_url: string | null
  memo: string
}

interface Args {
  report: Pick<ExpenseReport, 'title' | 'doc_no' | 'drafter_staff_id'>
  payments: ExpenseReportPayment[]
  category: string
  firstFileUrl: string | null
}

/**
 * 지급정보 1행 = 지출 1건.
 * expense_id가 이미 있는 행은 건너뛴다 — 재처리·중복 호출로 지출이 두 번 생기는 것을 막는다.
 */
export function paymentsToExpenses({
  report, payments, category, firstFileUrl,
}: Args): { payment_id: string; expense: ExpenseInsert }[] {
  const multi = payments.length > 1

  return payments
    .filter(p => p.expense_id === null)
    .map(p => ({
      payment_id: p.id,
      expense: {
        title: multi ? `${report.title} (${p.vendor_name})` : report.title,
        amount: p.amount,
        expense_date: p.pay_request_date,
        category,
        staff_id: report.drafter_staff_id,
        site_id: null,
        receipt_url: firstFileUrl,
        memo: `[${report.doc_no ?? ''}] ${p.vendor_name} / ${p.bank} ${p.account_no}`,
      },
    }))
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm test
```

기대: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/approval/toExpense.ts src/lib/approval/toExpense.test.ts
git commit -m "feat(approval): 승인 시 지출 자동등록 매핑 (중복 생성 방지 포함)"
```

---

### Task 5: API 공통 인증 가드 + 저장/삭제 라우트

여기부터가 보안의 핵심이다. 클라이언트가 보낸 `staff_id`는 절대 믿지 않는다.

**Files:**
- Create: `src/lib/approval/guard.ts`
- Create: `src/app/api/approval/save/route.ts`
- Create: `src/app/api/approval/delete/route.ts`

**Interfaces:**
- Consumes: 기존 `getAuthUser()` (`src/lib/auth.ts`), Task 1의 `validateApprovalLine`·`canDelete`
- Produces: `requireStaff() → Promise<{ staff, admin } | Response>`, `admin` (service_role 클라이언트). `POST /api/approval/save`는 `{ id }`를 반환한다.

- [ ] **Step 1: `src/lib/approval/guard.ts` 작성**

```ts
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'

export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export interface Staff {
  id: string
  name: string
  role: string
}

/**
 * 로그인 사용자를 staff 행으로 바꾼다.
 * 클라이언트가 보낸 staff_id는 쓰지 않는다 — 위조를 막는 유일한 지점이다.
 * 실패하면 Response를 돌려주므로 호출부에서 `instanceof Response`로 분기한다.
 */
export async function requireStaff(): Promise<Staff | Response> {
  const user = await getAuthUser()
  if (!user?.email) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { data } = await admin
    .from('staff')
    .select('id, name, role')
    .eq('email', user.email)
    .maybeSingle()

  if (!data) {
    return Response.json({ error: '등록된 직원이 아닙니다' }, { status: 403 })
  }
  return data as Staff
}

/** 문서 + 결재선을 한 번에 읽는다. 권한 검증은 항상 DB의 현재 상태로 한다. */
export async function loadReport(reportId: string) {
  const { data: report } = await admin
    .from('expense_reports')
    .select('*')
    .eq('id', reportId)
    .maybeSingle()

  if (!report) return null

  const { data: lines } = await admin
    .from('expense_report_lines')
    .select('*')
    .eq('report_id', reportId)
    .order('seq')

  return { report, lines: lines ?? [] }
}
```

- [ ] **Step 2: `src/app/api/approval/save/route.ts` 작성**

```ts
import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { validateApprovalLine, canSubmit } from '@/lib/approval/status'

interface PaymentInput {
  vendor_name: string; amount: number; pay_request_date: string
  bank: string; account_no: string; business_no?: string | null
}
interface DetailInput {
  vendor_name?: string | null; account?: string | null; content?: string | null
  dept_name?: string | null; amount?: number | null; note?: string | null
}
interface LineInput { staff_id: string; role: 'approval' | 'cooperation' }

interface Body {
  id?: string
  title: string
  body_html?: string | null
  payments: PaymentInput[]
  details: DetailInput[]
  lines: LineInput[]
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const body = (await request.json()) as Body

  if (!body.title?.trim()) {
    return Response.json({ error: '기안제목을 입력해 주세요' }, { status: 400 })
  }
  if (body.title.length > 50) {
    return Response.json({ error: '기안제목은 50자까지 입력할 수 있습니다' }, { status: 400 })
  }

  // 결재선은 비어 있어도 임시저장은 되지만, 내용이 있으면 규칙을 지켜야 한다
  if (body.lines.length > 0) {
    const err = validateApprovalLine(
      body.lines.map((l, i) => ({ ...l, seq: i, state: 'waiting' as const })),
      staff.id,
    )
    if (err) return Response.json({ error: err }, { status: 400 })
  }

  const total = body.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)

  let reportId = body.id

  if (reportId) {
    // 기존 문서 수정 — 본인이 기안자이고 편집 가능한 상태여야 한다
    const loaded = await loadReport(reportId)
    if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })
    if (!canSubmit(loaded.report, staff.id)) {
      return Response.json({ error: '수정할 수 없는 문서입니다' }, { status: 403 })
    }

    await admin.from('expense_reports').update({
      title: body.title,
      body_html: body.body_html ?? null,
      total_amount: total,
      updated_at: new Date().toISOString(),
    }).eq('id', reportId)

    // 자식 행은 통째로 갈아끼운다. 부분 갱신은 seq 정합성을 깨뜨린다.
    await admin.from('expense_report_payments').delete().eq('report_id', reportId)
    await admin.from('expense_report_details').delete().eq('report_id', reportId)
    await admin.from('expense_report_lines').delete().eq('report_id', reportId)
  } else {
    const { data, error } = await admin.from('expense_reports').insert({
      title: body.title,
      body_html: body.body_html ?? null,
      status: 'draft',
      drafter_staff_id: staff.id,   // 클라이언트 값이 아니라 로그인 사용자로 강제
      total_amount: total,
    }).select('id').single()

    if (error || !data) {
      return Response.json({ error: `저장 실패: ${error?.message}` }, { status: 500 })
    }
    reportId = data.id
  }

  if (body.payments.length > 0) {
    await admin.from('expense_report_payments').insert(
      body.payments.map((p, i) => ({
        report_id: reportId, seq: i,
        vendor_name: p.vendor_name, amount: p.amount,
        pay_request_date: p.pay_request_date, bank: p.bank,
        account_no: p.account_no, business_no: p.business_no ?? null,
      })),
    )
  }

  if (body.details.length > 0) {
    await admin.from('expense_report_details').insert(
      body.details.map((d, i) => ({ report_id: reportId, seq: i, ...d })),
    )
  }

  if (body.lines.length > 0) {
    await admin.from('expense_report_lines').insert(
      body.lines.map((l, i) => ({
        report_id: reportId, seq: i,
        staff_id: l.staff_id, role: l.role, state: 'waiting',
      })),
    )
  }

  return Response.json({ id: reportId })
}
```

- [ ] **Step 3: `src/app/api/approval/delete/route.ts` 작성**

```ts
import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { canDelete } from '@/lib/approval/status'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const { id } = (await request.json()) as { id: string }

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canDelete(loaded.report, staff.id)) {
    return Response.json(
      { error: '저장된·회수된·반려된 문서만 삭제할 수 있습니다' },
      { status: 403 },
    )
  }

  // 자식 행은 ON DELETE CASCADE로 함께 지워진다
  const { error } = await admin.from('expense_reports').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
```

- [ ] **Step 4: 빌드 확인**

```bash
npm run build
```

기대: 타입 에러 없이 완료.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/approval/guard.ts src/app/api/approval/save src/app/api/approval/delete
git commit -m "feat(approval): API 인증 가드와 저장/삭제 라우트"
```

---

### Task 6: 상신 / 회수 라우트

**Files:**
- Create: `src/app/api/approval/submit/route.ts`
- Create: `src/app/api/approval/withdraw/route.ts`

**Interfaces:**
- Consumes: Task 5의 `requireStaff`·`loadReport`·`admin`, Task 1의 `canSubmit`·`canWithdraw`·`validateApprovalLine`·`currentTurnLine`
- Produces: `POST /api/approval/submit` `{ id }` → `{ ok: true }`. 알림 훅 자리(`notifyTurn`)는 Task 16에서 채운다.

- [ ] **Step 1: `src/app/api/approval/submit/route.ts` 작성**

```ts
import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { canSubmit, validateApprovalLine } from '@/lib/approval/status'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const { id } = (await request.json()) as { id: string }

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canSubmit(loaded.report, staff.id)) {
    return Response.json({ error: '상신할 수 없는 문서입니다' }, { status: 403 })
  }

  const lineErr = validateApprovalLine(loaded.lines, staff.id)
  if (lineErr) return Response.json({ error: lineErr }, { status: 400 })

  const { count } = await admin
    .from('expense_report_payments')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', id)

  if (!count) {
    return Response.json({ error: '지급 정보를 한 행 이상 입력해 주세요' }, { status: 400 })
  }

  // 재상신: state만 되돌리고 acted_at·comment는 남긴다
  // — 결재자가 자기가 왜 반려했는지(누가, 언제, 무슨 의견) 다시 볼 수 있어야 한다
  await admin
    .from('expense_report_lines')
    .update({ state: 'waiting' })
    .eq('report_id', id)

  const { error } = await admin.from('expense_reports').update({
    status: 'pending',
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
```

- [ ] **Step 2: `src/app/api/approval/withdraw/route.ts` 작성**

```ts
import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { canWithdraw } from '@/lib/approval/status'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const { id } = (await request.json()) as { id: string }

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canWithdraw(loaded.report, loaded.lines, staff.id)) {
    return Response.json(
      { error: '결재자가 이미 처리한 문서는 회수할 수 없습니다' },
      { status: 403 },
    )
  }

  const { error } = await admin.from('expense_reports').update({
    status: 'withdrawn',
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

기대: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/approval/submit src/app/api/approval/withdraw
git commit -m "feat(approval): 상신/회수 라우트"
```

---

### Task 7: 승인 / 반려 / 결재취소 라우트

최종 승인에서 채번과 지출 생성이 함께 일어난다. 이 태스크가 계획 전체에서 가장 위험하다.

**Files:**
- Create: `src/app/api/approval/approve/route.ts`
- Create: `src/app/api/approval/reject/route.ts`
- Create: `src/app/api/approval/cancel/route.ts`

**Interfaces:**
- Consumes: Task 3의 `issueDocNo`, Task 4의 `paymentsToExpenses`, Task 5의 가드, Task 1의 `canApprove`·`canCancel`·`currentTurnLine`·`isFinalApprover`
- Produces: `POST /api/approval/approve` 는 `{ id, category? , comment? }`를 받아 `{ ok, doc_no?, expenses_created? }`를 반환한다.

- [ ] **Step 1: `src/app/api/approval/approve/route.ts` 작성**

```ts
import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { canApprove, currentTurnLine, isFinalApprover } from '@/lib/approval/status'
import { issueDocNo } from '@/lib/approval/docNo'
import { paymentsToExpenses } from '@/lib/approval/toExpense'
import { EXPENSE_CATEGORIES } from '@/types/approval'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const { id, category, comment } = (await request.json()) as {
    id: string; category?: string; comment?: string
  }

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canApprove(loaded.report, loaded.lines, staff.id)) {
    return Response.json({ error: '지금 결재할 차례가 아닙니다' }, { status: 403 })
  }

  const turn = currentTurnLine(loaded.lines)!
  const final = isFinalApprover(loaded.lines, staff.id)

  if (final && !(EXPENSE_CATEGORIES as readonly string[]).includes(category ?? '')) {
    return Response.json({ error: '계정과목을 선택해 주세요' }, { status: 400 })
  }

  const now = new Date().toISOString()

  await admin.from('expense_report_lines').update({
    state: 'approved', acted_at: now, comment: comment ?? null,
  }).eq('id', turn.id)

  if (!final) {
    return Response.json({ ok: true, final: false })
  }

  // --- 최종 승인 ---
  const docNo = await issueDocNo(admin)

  const { data: payments } = await admin
    .from('expense_report_payments')
    .select('*')
    .eq('report_id', id)
    .order('seq')

  const { data: files } = await admin
    .from('expense_report_files')
    .select('file_url')
    .eq('report_id', id)
    .order('uploaded_at')
    .limit(1)

  const rows = paymentsToExpenses({
    report: { ...loaded.report, doc_no: docNo },
    payments: payments ?? [],
    category: category!,
    firstFileUrl: files?.[0]?.file_url ?? null,
  })

  let created = 0
  for (const row of rows) {
    const { data: exp, error } = await admin
      .from('expenses')
      .insert(row.expense)
      .select('id')
      .single()

    if (error || !exp) {
      // 여기서 멈춘다. 이미 만든 건 expense_id가 박혀 있어 재시도해도 중복되지 않는다.
      return Response.json(
        { error: `지출 등록 실패: ${error?.message}. 생성 ${created}건까지 반영됨` },
        { status: 500 },
      )
    }

    await admin
      .from('expense_report_payments')
      .update({ expense_id: exp.id })
      .eq('id', row.payment_id)

    created++
  }

  await admin.from('expense_reports').update({
    status: 'approved',
    doc_no: docNo,
    category,
    completed_at: now,
    updated_at: now,
  }).eq('id', id)

  return Response.json({ ok: true, final: true, doc_no: docNo, expenses_created: created })
}
```

- [ ] **Step 2: `src/app/api/approval/reject/route.ts` 작성**

```ts
import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { canApprove, currentTurnLine } from '@/lib/approval/status'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const { id, comment } = (await request.json()) as { id: string; comment?: string }

  if (!comment?.trim()) {
    return Response.json({ error: '반려 사유를 입력해 주세요' }, { status: 400 })
  }

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canApprove(loaded.report, loaded.lines, staff.id)) {
    return Response.json({ error: '지금 결재할 차례가 아닙니다' }, { status: 403 })
  }

  const turn = currentTurnLine(loaded.lines)!
  const now = new Date().toISOString()

  await admin.from('expense_report_lines').update({
    state: 'rejected', acted_at: now, comment,
  }).eq('id', turn.id)

  const { error } = await admin.from('expense_reports').update({
    status: 'rejected', updated_at: now,
  }).eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
```

- [ ] **Step 3: `src/app/api/approval/cancel/route.ts` 작성**

```ts
import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { canCancel } from '@/lib/approval/status'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const { id } = (await request.json()) as { id: string }

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canCancel(loaded.report, loaded.lines, staff.id)) {
    return Response.json(
      { error: '다음 결재자가 이미 처리했거나 완료된 문서는 취소할 수 없습니다' },
      { status: 403 },
    )
  }

  const mine = loaded.lines.find(l => l.staff_id === staff.id && l.state === 'approved')!

  const { error } = await admin.from('expense_report_lines').update({
    state: 'waiting', acted_at: null,
  }).eq('id', mine.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  await admin.from('expense_reports')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)

  return Response.json({ ok: true })
}
```

- [ ] **Step 4: 빌드 확인**

```bash
npm run build
```

기대: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/approval/approve src/app/api/approval/reject src/app/api/approval/cancel
git commit -m "feat(approval): 승인/반려/결재취소 라우트 — 최종 승인 시 채번과 지출 자동등록"
```

---

### Task 8: 결재선 설정 팝업

**Files:**
- Create: `src/components/approval/ApprovalLineModal.tsx`
- Create: `src/components/approval/ApprovalLineView.tsx`

**Interfaces:**
- Consumes: Task 1의 `LineRole`·`LINE_ROLE_LABEL`·`LINE_STATE_LABEL`·`validateApprovalLine`, 기존 `supabase` 클라이언트
- Produces: `<ApprovalLineModal open drafterStaffId value onChange onClose />` — `value`/`onChange`는 `{ staff_id, name, role }[]`. `<ApprovalLineView lines />` — 카드 표시 전용.

- [ ] **Step 1: `src/components/approval/ApprovalLineView.tsx` 작성**

```tsx
'use client'

import { LINE_ROLE_LABEL, LINE_STATE_LABEL, type LineRole, type LineState } from '@/types/approval'

export interface LineCard {
  staff_id: string
  name: string
  role: LineRole
  state?: LineState
  acted_at?: string | null
}

interface Props {
  drafterName: string
  drafterActedAt?: string | null
  lines: LineCard[]
}

const STATE_COLOR: Record<LineState, string> = {
  waiting: 'text-txt-tertiary',
  approved: 'text-accent-text',
  rejected: 'text-danger',
}

export default function ApprovalLineView({ drafterName, drafterActedAt, lines }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="w-28 border border-border-primary rounded-lg overflow-hidden">
        <div className="bg-surface-secondary text-xs text-center py-1.5 text-txt-secondary border-b border-border-primary">
          기안
        </div>
        <div className="py-3 px-2 text-center">
          <div className="text-sm">{drafterName}</div>
          <div className="text-xs text-txt-tertiary mt-1">
            {drafterActedAt ? new Date(drafterActedAt).toLocaleString('ko-KR') : ' '}
          </div>
        </div>
      </div>

      {lines.map(l => (
        <div key={l.staff_id} className="w-28 border border-border-primary rounded-lg overflow-hidden">
          <div className="bg-surface-secondary text-xs text-center py-1.5 text-txt-secondary border-b border-border-primary">
            {LINE_ROLE_LABEL[l.role]}
          </div>
          <div className="py-3 px-2 text-center">
            <div className="text-sm">{l.name}</div>
            <div className={`text-xs mt-1 ${STATE_COLOR[l.state ?? 'waiting']}`}>
              {LINE_STATE_LABEL[l.state ?? 'waiting']}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: `src/components/approval/ApprovalLineModal.tsx` 작성**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { X, Search, GripVertical, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { validateApprovalLine } from '@/lib/approval/status'
import type { LineRole } from '@/types/approval'

export interface LineDraft {
  staff_id: string
  name: string
  role: LineRole
}

interface StaffRow { id: string; name: string }

interface Props {
  open: boolean
  drafterStaffId: string
  value: LineDraft[]
  onChange: (lines: LineDraft[]) => void
  onClose: () => void
}

export default function ApprovalLineModal({ open, drafterStaffId, value, onChange, onClose }: Props) {
  const [staffList, setStaffList] = useState<StaffRow[]>([])
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<LineDraft[]>(value)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setDraft(value) }, [value, open])

  useEffect(() => {
    if (!open) return
    supabase.from('staff').select('id, name').order('name').then(({ data }) => {
      setStaffList((data ?? []) as StaffRow[])
    })
  }, [open])

  if (!open) return null

  const candidates = staffList.filter(
    s => s.id !== drafterStaffId && s.name.includes(keyword) && !draft.some(d => d.staff_id === s.id),
  )

  const add = (role: LineRole) => {
    const s = staffList.find(x => x.id === selected)
    if (!s) return
    setDraft([...draft, { staff_id: s.id, name: s.name, role }])
    setSelected(null)
    setError(null)
  }

  const remove = (staffId: string) => setDraft(draft.filter(d => d.staff_id !== staffId))

  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.length) return
    const next = [...draft]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setDraft(next)
  }

  const apply = () => {
    const err = validateApprovalLine(
      draft.map((d, i) => ({ ...d, seq: i, state: 'waiting' as const })),
      drafterStaffId,
    )
    if (err) { setError(err); return }
    onChange(draft)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <div className="bg-surface w-full max-w-3xl rounded-xl border border-border-primary overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary">
          <span className="text-base font-medium">결재선 설정</span>
          <button onClick={onClose} aria-label="닫기"><X size={18} className="text-txt-tertiary" /></button>
        </div>

        <div className="grid grid-cols-2 gap-4 p-5">
          <div>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary" />
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="이름 검색"
                className="w-full pl-9 pr-3 py-2 text-sm border border-border-primary rounded-lg"
              />
            </div>
            <div className="border border-border-primary rounded-lg h-64 overflow-y-auto">
              {candidates.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className={`w-full text-left px-3 py-2 text-sm ${selected === s.id ? 'bg-surface-secondary' : ''}`}
                >
                  {s.name}
                </button>
              ))}
              {candidates.length === 0 && (
                <div className="px-3 py-4 text-sm text-txt-tertiary">선택할 직원이 없습니다</div>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => add('approval')} disabled={!selected}
                className="flex-1 py-2 text-sm border border-border-primary rounded-lg disabled:opacity-40">결재</button>
              <button onClick={() => add('cooperation')} disabled={!selected}
                className="flex-1 py-2 text-sm border border-border-primary rounded-lg disabled:opacity-40">협조</button>
            </div>
          </div>

          <div>
            <div className="text-sm mb-3 text-txt-secondary">
              아래로 갈수록 상위 결재자입니다. 마지막은 결재 역할이어야 합니다.
            </div>
            <div className="border border-border-primary rounded-lg h-64 overflow-y-auto">
              {draft.map((d, i) => (
                <div key={d.staff_id} className="flex items-center gap-2 px-3 py-2 border-b border-border-primary last:border-0">
                  <button onClick={() => move(i, i - 1)} aria-label="위로">
                    <GripVertical size={14} className="text-txt-tertiary" />
                  </button>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-surface-secondary text-txt-secondary">
                    {d.role === 'approval' ? '결재' : '협조'}
                  </span>
                  <span className="text-sm flex-1">{d.name}</span>
                  <button onClick={() => remove(d.staff_id)} aria-label="삭제">
                    <Trash2 size={14} className="text-txt-tertiary" />
                  </button>
                </div>
              ))}
              {draft.length === 0 && (
                <div className="px-3 py-4 text-sm text-txt-tertiary">왼쪽에서 직원을 골라 추가하세요</div>
              )}
            </div>
            {error && <div className="mt-2 text-sm text-danger">{error}</div>}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border-primary">
          <button onClick={onClose} className="px-5 py-2 text-sm border border-border-primary rounded-lg">취소</button>
          <button onClick={apply} className="px-5 py-2 text-sm rounded-lg bg-accent text-txt-inverse">적용</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

기대: 에러 없음. 쓰인 토큰(`bg-surface`, `bg-surface-secondary`, `border-border-primary`, `text-txt-secondary`, `text-txt-tertiary`)은 모두 `src/app/globals.css`에 정의돼 있고 `ExpensesPage.tsx`에서도 같은 이름을 쓴다.

- [ ] **Step 4: 커밋**

```bash
git add src/components/approval/ApprovalLineModal.tsx src/components/approval/ApprovalLineView.tsx
git commit -m "feat(approval): 결재선 설정 팝업과 결재선 카드"
```

---

### Task 9: 지급 정보 표 + 상세 내용 표

**Files:**
- Create: `src/components/approval/PaymentTable.tsx`
- Create: `src/components/approval/DetailTable.tsx`

**Interfaces:**
- Consumes: 기존 `formatMoney`·`parseMoney` (`src/lib/utils/format.ts`)
- Produces: `<PaymentTable rows onChange />` — `rows`는 `PaymentRow[]`. `<DetailTable rows vendors onChange />` — `vendors`는 지급정보에서 뽑은 거래처명 배열.

- [ ] **Step 1: `src/components/approval/PaymentTable.tsx` 작성**

```tsx
'use client'

import { Trash2, Plus } from 'lucide-react'
import { formatMoney, parseMoney } from '@/lib/utils/format'
import { EMPTY_PAYMENT, type PaymentRow } from '@/types/approval'

interface Props {
  rows: PaymentRow[]
  onChange: (rows: PaymentRow[]) => void
}

export default function PaymentTable({ rows, onChange }: Props) {
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0)

  const set = (i: number, patch: Partial<PaymentRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const cell = 'w-full px-2 py-1.5 text-xs bg-transparent outline-none'

  return (
    <div className="border border-border-primary rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-3 border-b border-border-primary">
        <span className="text-xs text-txt-secondary">지급 총계(원)</span>
        <span className="text-lg font-medium">{formatMoney(total)}</span>
        <span className="text-xs text-txt-tertiary">지급 정보 합계 자동계산</span>
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-medium">지급 정보</span>
        <button
          onClick={() => onChange([...rows, { ...EMPTY_PAYMENT }])}
          className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border-primary rounded"
        >
          <Plus size={12} /> 추가
        </button>
      </div>

      <table className="w-full table-fixed text-xs">
        <thead className="bg-surface-secondary text-txt-secondary">
          <tr>
            <th className="w-[17%] px-2 py-2 text-left font-normal">거래처명 *</th>
            <th className="w-[15%] px-2 py-2 text-right font-normal">지급금액 *</th>
            <th className="w-[14%] px-2 py-2 text-left font-normal">지급요청일 *</th>
            <th className="w-[12%] px-2 py-2 text-left font-normal">은행 *</th>
            <th className="w-[20%] px-2 py-2 text-left font-normal">계좌번호 *</th>
            <th className="w-[16%] px-2 py-2 text-left font-normal">사업자번호</th>
            <th className="w-[6%] px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border-primary">
              <td><input className={cell} value={r.vendor_name}
                onChange={e => set(i, { vendor_name: e.target.value })} placeholder="거래처명" /></td>
              <td><input className={`${cell} text-right`} value={r.amount ? formatMoney(r.amount) : ''}
                onChange={e => set(i, { amount: parseMoney(e.target.value) })} placeholder="0" /></td>
              <td><input className={cell} type="date" value={r.pay_request_date}
                onChange={e => set(i, { pay_request_date: e.target.value })} /></td>
              <td><input className={cell} value={r.bank}
                onChange={e => set(i, { bank: e.target.value })} placeholder="은행명" /></td>
              <td><input className={cell} value={r.account_no}
                onChange={e => set(i, { account_no: e.target.value })} placeholder="계좌번호" /></td>
              <td><input className={cell} value={r.business_no}
                onChange={e => set(i, { business_no: e.target.value })} placeholder="선택" /></td>
              <td className="text-center">
                <button onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="행 삭제">
                  <Trash2 size={13} className="text-txt-tertiary" />
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="border-t border-border-primary">
              <td colSpan={7} className="px-2 py-4 text-txt-tertiary">추가를 눌러 지급 정보를 입력하세요</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: `src/components/approval/DetailTable.tsx` 작성**

첫 행은 일괄 적용용 템플릿이며 저장되지 않는다.

```tsx
'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { formatMoney, parseMoney } from '@/lib/utils/format'
import { EMPTY_DETAIL, type DetailRow } from '@/types/approval'

interface Props {
  rows: DetailRow[]
  vendors: string[]
  onChange: (rows: DetailRow[]) => void
}

export default function DetailTable({ rows, vendors, onChange }: Props) {
  const [template, setTemplate] = useState<DetailRow>({ ...EMPTY_DETAIL })
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const set = (i: number, patch: Partial<DetailRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const toggle = (i: number) => {
    const next = new Set(checked)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setChecked(next)
  }

  const applyTemplate = () => {
    onChange(rows.map((r, i) => (checked.has(i) ? { ...template } : r)))
    setChecked(new Set())
  }

  const cell = 'w-full px-2 py-1.5 text-xs bg-transparent outline-none'

  return (
    <div className="border border-border-primary rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-medium">상세 내용</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-txt-tertiary">
            첫 행에 값을 넣고 적용할 행을 체크한 뒤 일괄 적용 — 첫 행은 저장되지 않습니다
          </span>
          <button onClick={applyTemplate} disabled={checked.size === 0}
            className="px-2.5 py-1 text-xs border border-border-primary rounded disabled:opacity-40">일괄 적용</button>
          <button onClick={() => onChange([...rows, { ...EMPTY_DETAIL }])}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border-primary rounded">
            <Plus size={12} /> 추가
          </button>
        </div>
      </div>

      <table className="w-full table-fixed text-xs">
        <thead className="bg-surface-secondary text-txt-secondary">
          <tr>
            <th className="w-[6%] px-2 py-2"></th>
            <th className="w-[18%] px-2 py-2 text-left font-normal">거래처명</th>
            <th className="w-[13%] px-2 py-2 text-left font-normal">계정</th>
            <th className="w-[22%] px-2 py-2 text-left font-normal">내용</th>
            <th className="w-[13%] px-2 py-2 text-left font-normal">부서명</th>
            <th className="w-[14%] px-2 py-2 text-right font-normal">금액</th>
            <th className="w-[9%] px-2 py-2 text-left font-normal">비고</th>
            <th className="w-[5%] px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border-primary bg-accent-light">
            <td className="px-2 text-center text-[11px] text-accent-text">일괄</td>
            <td>
              <select className={cell} value={template.vendor_name}
                onChange={e => setTemplate({ ...template, vendor_name: e.target.value })}>
                <option value="">선택</option>
                {vendors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </td>
            <td><input className={cell} value={template.account}
              onChange={e => setTemplate({ ...template, account: e.target.value })} /></td>
            <td><input className={cell} value={template.content}
              onChange={e => setTemplate({ ...template, content: e.target.value })} /></td>
            <td><input className={cell} value={template.dept_name}
              onChange={e => setTemplate({ ...template, dept_name: e.target.value })} /></td>
            <td><input className={`${cell} text-right`} value={template.amount ? formatMoney(template.amount) : ''}
              onChange={e => setTemplate({ ...template, amount: parseMoney(e.target.value) })} /></td>
            <td><input className={cell} value={template.note}
              onChange={e => setTemplate({ ...template, note: e.target.value })} /></td>
            <td></td>
          </tr>

          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border-primary">
              <td className="px-2 text-center">
                <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} aria-label={`${i + 1}행 선택`} />
              </td>
              <td>
                <select className={cell} value={r.vendor_name}
                  onChange={e => set(i, { vendor_name: e.target.value })}>
                  <option value="">선택</option>
                  {vendors.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </td>
              <td><input className={cell} value={r.account} onChange={e => set(i, { account: e.target.value })} /></td>
              <td><input className={cell} value={r.content} onChange={e => set(i, { content: e.target.value })} /></td>
              <td><input className={cell} value={r.dept_name} onChange={e => set(i, { dept_name: e.target.value })} /></td>
              <td><input className={`${cell} text-right`} value={r.amount ? formatMoney(r.amount) : ''}
                onChange={e => set(i, { amount: parseMoney(e.target.value) })} /></td>
              <td><input className={cell} value={r.note} onChange={e => set(i, { note: e.target.value })} /></td>
              <td className="text-center">
                <button onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="행 삭제">
                  <Trash2 size={13} className="text-txt-tertiary" />
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="border-t border-border-primary">
              <td colSpan={8} className="px-2 py-4 text-txt-tertiary">비워두고 상신해도 됩니다</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 4: 커밋**

```bash
git add src/components/approval/PaymentTable.tsx src/components/approval/DetailTable.tsx
git commit -m "feat(approval): 지급 정보 표와 상세 내용 표(일괄 적용 포함)"
```

---

### Task 10: 첨부파일 + 기안 작성 화면

**Files:**
- Create: `src/components/approval/FileAttach.tsx`
- Create: `src/components/approval/DraftForm.tsx`
- Create: `src/app/approval/new/page.tsx`
- Modify: `src/app/api/storage/upload/route.ts` (`ALLOWED_PATH_PREFIXES`)

**Interfaces:**
- Consumes: Task 8의 `ApprovalLineModal`·`ApprovalLineView`, Task 9의 `PaymentTable`·`DetailTable`, Task 5의 `/api/approval/save`, Task 6의 `/api/approval/submit`, 기존 `useAuth()`
- Produces: `<DraftForm reportId? />` — 신규 작성과 기존 문서 편집을 겸한다.

- [ ] **Step 1: 스토리지 경로 허용 추가 — `src/app/api/storage/upload/route.ts`**

`ALLOWED_PATH_PREFIXES` 배열에 `'approval/'`을 더한다.

```ts
const ALLOWED_PATH_PREFIXES = ['projects/', 'templates/', 'attachments/', 'sites/', 'approval/']
```

- [ ] **Step 2: `src/components/approval/FileAttach.tsx` 작성**

```tsx
'use client'

import { useState, DragEvent } from 'react'
import { Paperclip, X, Plus } from 'lucide-react'

export interface AttachedFile {
  file_name: string
  file_url: string
  size: number
}

const MAX_FILES = 10
const MAX_SIZE = 20 * 1024 * 1024
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'pdf', 'hwp']

interface Props {
  files: AttachedFile[]
  onChange: (files: AttachedFile[]) => void
}

export default function FileAttach({ files, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    setError(null)

    if (files.length + list.length > MAX_FILES) {
      setError(`첨부는 최대 ${MAX_FILES}개까지 가능합니다`)
      return
    }

    setBusy(true)
    const added: AttachedFile[] = []

    for (const file of Array.from(list)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ALLOWED_EXT.includes(ext)) {
        setError(`${file.name}: 허용되지 않는 형식입니다`)
        continue
      }
      if (file.size >= MAX_SIZE) {
        setError(`${file.name}: 20MB를 넘습니다`)
        continue
      }

      const fd = new FormData()
      fd.append('file', file)
      fd.append('storagePath', `approval/${Date.now()}_${file.name}`)

      const res = await fetch('/api/storage/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? '업로드 실패'); continue }

      added.push({ file_name: file.name, file_url: json.url ?? json.publicUrl, size: file.size })
    }

    onChange([...files, ...added])
    setBusy(false)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    upload(e.dataTransfer.files)
  }

  return (
    <div onDrop={onDrop} onDragOver={e => e.preventDefault()}>
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => (
          <span key={i} className="flex items-center gap-1.5 px-2 py-1 text-xs bg-surface-secondary rounded">
            <Paperclip size={12} className="text-txt-tertiary" />
            {f.file_name}
            <button onClick={() => onChange(files.filter((_, idx) => idx !== i))} aria-label={`${f.file_name} 삭제`}>
              <X size={12} className="text-txt-tertiary" />
            </button>
          </span>
        ))}
        <label className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border-primary rounded cursor-pointer">
          <Plus size={12} /> {busy ? '올리는 중' : '추가'}
          <input type="file" multiple className="hidden" onChange={e => upload(e.target.files)} />
        </label>
      </div>
      <p className="mt-1.5 text-xs text-txt-tertiary">
        20MB 미만 이미지(jpg, jpeg, png, gif) 또는 문서(doc, docx, ppt, pptx, xls, xlsx, pdf, hwp), 최대 10개.
        드래그해서 놓아도 됩니다.
      </p>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: `src/components/approval/DraftForm.tsx` 작성**

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import ApprovalLineModal, { type LineDraft } from './ApprovalLineModal'
import ApprovalLineView from './ApprovalLineView'
import PaymentTable from './PaymentTable'
import DetailTable from './DetailTable'
import FileAttach, { type AttachedFile } from './FileAttach'
import type { PaymentRow, DetailRow } from '@/types/approval'

const DEFAULT_BODY = '※ 첨부 파일에 견적서, 세금계산서 첨부할 것!!'

export default function DraftForm({ reportId }: { reportId?: string }) {
  const router = useRouter()
  const { staff } = useAuth()

  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_BODY)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [details, setDetails] = useState<DetailRow[]>([])
  const [lines, setLines] = useState<LineDraft[]>([])
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [lineOpen, setLineOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!reportId) return
    const load = async () => {
      const { data: r } = await supabase.from('expense_reports').select('*').eq('id', reportId).maybeSingle()
      if (!r) return
      setTitle(r.title)
      setBodyHtml(r.body_html ?? DEFAULT_BODY)

      const [{ data: p }, { data: d }, { data: l }, { data: f }] = await Promise.all([
        supabase.from('expense_report_payments').select('*').eq('report_id', reportId).order('seq'),
        supabase.from('expense_report_details').select('*').eq('report_id', reportId).order('seq'),
        supabase.from('expense_report_lines').select('*, staff(name)').eq('report_id', reportId).order('seq'),
        supabase.from('expense_report_files').select('*').eq('report_id', reportId).order('uploaded_at'),
      ])

      setPayments((p ?? []).map(x => ({ ...x, business_no: x.business_no ?? '' })) as PaymentRow[])
      setDetails((d ?? []) as DetailRow[])
      setLines((l ?? []).map((x: Record<string, unknown>) => ({
        staff_id: x.staff_id as string,
        name: (x.staff as { name: string })?.name ?? '',
        role: x.role as LineDraft['role'],
      })))
      setFiles((f ?? []) as AttachedFile[])
    }
    load()
  }, [reportId])

  const save = useCallback(async (thenSubmit: boolean) => {
    if (!staff) return
    setBusy(true); setError(null)

    const res = await fetch('/api/approval/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: reportId, title, body_html: bodyHtml,
        payments, details,
        lines: lines.map(l => ({ staff_id: l.staff_id, role: l.role })),
      }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error); setBusy(false); return }

    // 첨부는 저장 후 문서 id가 나와야 붙일 수 있다
    await supabase.from('expense_report_files').delete().eq('report_id', json.id)
    if (files.length > 0) {
      await supabase.from('expense_report_files').insert(
        files.map(f => ({ report_id: json.id, ...f })),
      )
    }

    if (!thenSubmit) {
      setBusy(false)
      router.push(`/approval/${json.id}`)
      return
    }

    const sub = await fetch('/api/approval/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: json.id }),
    })
    const subJson = await sub.json()
    setBusy(false)
    if (!sub.ok) { setError(subJson.error); return }
    router.push(`/approval/${json.id}`)
  }, [staff, reportId, title, bodyHtml, payments, details, lines, files, router])

  const vendors = payments.map(p => p.vendor_name).filter(Boolean)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-lg font-medium mb-4">지출결의서</h1>

      <table className="w-full table-fixed text-xs mb-6">
        <tbody>
          <tr>
            <td className="w-[18%] px-2 py-2 text-txt-secondary border-b border-border-primary">기안양식</td>
            <td className="w-[32%] px-2 py-2 border-b border-border-primary">지출결의서</td>
            <td className="w-[18%] px-2 py-2 text-txt-secondary border-b border-border-primary">문서번호</td>
            <td className="px-2 py-2 text-txt-tertiary border-b border-border-primary">완료 시 부여</td>
          </tr>
          <tr>
            <td className="px-2 py-2 text-txt-secondary border-b border-border-primary">보존연한</td>
            <td className="px-2 py-2 border-b border-border-primary">5년</td>
            <td className="px-2 py-2 text-txt-secondary border-b border-border-primary">기안부서</td>
            <td className="px-2 py-2 border-b border-border-primary">주식회사 다우건설</td>
          </tr>
          <tr>
            <td className="px-2 py-2 text-txt-secondary">기안자</td>
            <td className="px-2 py-2">{staff?.name ?? ''}</td>
            <td /><td />
          </tr>
        </tbody>
      </table>

      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">결재선 <span className="text-danger">*</span></span>
        <button onClick={() => setLineOpen(true)} className="px-3 py-1.5 text-xs border border-border-primary rounded">
          결재선 설정
        </button>
      </div>
      <div className="mb-6">
        <ApprovalLineView drafterName={staff?.name ?? ''} lines={lines} />
      </div>

      <div className="bg-accent-light text-accent-text text-xs rounded-lg px-3 py-2.5 mb-6">
        결제 관련 지출결의서 입니다.
      </div>

      <div className="text-sm font-medium mb-2">기안내용</div>
      <div className="flex items-center gap-3 mb-3">
        <span className="w-16 text-xs text-txt-secondary">기안제목 <span className="text-danger">*</span></span>
        <input value={title} onChange={e => setTitle(e.target.value.slice(0, 50))}
          className="flex-1 px-3 py-2 text-sm border border-border-primary rounded-lg" placeholder="기안제목 입력" />
        <span className="text-xs text-txt-tertiary">{title.length}/50</span>
      </div>
      <div className="flex gap-3 mb-6">
        <span className="w-16 text-xs text-txt-secondary pt-1.5">파일첨부</span>
        <div className="flex-1"><FileAttach files={files} onChange={setFiles} /></div>
      </div>

      <div className="mb-5"><PaymentTable rows={payments} onChange={setPayments} /></div>
      <div className="mb-5"><DetailTable rows={details} vendors={vendors} onChange={setDetails} /></div>

      <textarea value={bodyHtml} onChange={e => setBodyHtml(e.target.value)}
        className="w-full min-h-32 px-3 py-3 text-sm border border-border-primary rounded-lg mb-6" />

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}

      <div className="flex justify-center gap-2 border-t border-border-primary pt-5">
        <button disabled={busy} onClick={() => save(false)}
          className="px-6 py-2 text-sm border border-border-primary rounded-lg disabled:opacity-40">임시저장</button>
        <button disabled={busy} onClick={() => save(true)}
          className="px-6 py-2 text-sm rounded-lg bg-accent text-txt-inverse disabled:opacity-40">상신하기</button>
      </div>

      <ApprovalLineModal
        open={lineOpen}
        drafterStaffId={staff?.id ?? ''}
        value={lines}
        onChange={setLines}
        onClose={() => setLineOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 4: `src/app/approval/new/page.tsx` 작성**

```tsx
import DraftForm from '@/components/approval/DraftForm'

export default function Page() {
  return <DraftForm />
}
```

- [ ] **Step 5: 빌드 후 브라우저 확인**

```bash
npm run build
```

이어서 `preview_start`로 dev 서버를 띄우고 `/approval/new`에 들어가 확인한다.
- 결재선 설정을 눌러 직원 2명을 결재/협조로 추가하고 적용
- 기안제목 입력, 지급 정보 1행 입력(거래처·금액·날짜·은행·계좌)
- 지급 총계가 자동으로 합산되는지 확인
- 임시저장 → `/approval/{id}`로 이동하는지 확인

콘솔 에러가 있으면 `read_console_messages`로 확인해 고친다.

- [ ] **Step 6: 커밋**

```bash
git add src/components/approval/FileAttach.tsx src/components/approval/DraftForm.tsx src/app/approval/new src/app/api/storage/upload/route.ts
git commit -m "feat(approval): 기안 작성 화면과 첨부파일 업로드"
```

---

### Task 11: 문서함 목록

**Files:**
- Create: `src/components/approval/ApprovalPage.tsx`
- Create: `src/app/approval/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `APPROVAL_STATUS_LABEL`, 기존 `useAuth()`·`formatMoney`
- Produces: `<ApprovalPage />` — 좌측 문서함 사이드 + 우측 목록.

- [ ] **Step 1: `src/components/approval/ApprovalPage.tsx` 작성**

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PenLine } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { formatMoney } from '@/lib/utils/format'
import { APPROVAL_STATUS_LABEL, type ApprovalStatus } from '@/types/approval'

type BoxKey =
  | 'draft' | 'submitted' | 'withdrawn' | 'rejected' | 'completed'
  | 'toApprove' | 'inProgress' | 'myRejected' | 'myCompleted'
  | 'ledger'

const BOXES: { group: string; items: { key: BoxKey; label: string }[] }[] = [
  { group: '기안함', items: [
    { key: 'draft', label: '저장된' },
    { key: 'submitted', label: '상신한' },
    { key: 'withdrawn', label: '회수된' },
    { key: 'rejected', label: '반려된' },
    { key: 'completed', label: '완료된' },
  ]},
  { group: '결재함', items: [
    { key: 'toApprove', label: '결재전' },
    { key: 'inProgress', label: '진행중' },
    { key: 'myRejected', label: '반려된' },
    { key: 'myCompleted', label: '완료된' },
  ]},
  { group: '문서대장', items: [{ key: 'ledger', label: '전체' }] },
]

interface Row {
  id: string
  doc_no: string | null
  title: string
  status: ApprovalStatus
  total_amount: number
  submitted_at: string | null
  staff: { name: string } | null
}

export default function ApprovalPage() {
  const { staff } = useAuth()
  const [box, setBox] = useState<BoxKey>('toApprove')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!staff) return
    setLoading(true)

    const select = 'id, doc_no, title, status, total_amount, submitted_at, staff:drafter_staff_id(name)'
    let query = supabase.from('expense_reports').select(select)

    const mine = ['draft', 'submitted', 'withdrawn', 'rejected', 'completed'] as const
    if ((mine as readonly string[]).includes(box)) {
      query = query.eq('drafter_staff_id', staff.id)
      const statusMap: Record<string, ApprovalStatus> = {
        draft: 'draft', submitted: 'pending', withdrawn: 'withdrawn',
        rejected: 'rejected', completed: 'approved',
      }
      query = query.eq('status', statusMap[box])
    } else if (box === 'ledger') {
      query = query.eq('status', 'approved')
    } else {
      // 결재함 — 내가 결재선에 들어 있는 문서
      const { data: myLines } = await supabase
        .from('expense_report_lines')
        .select('report_id, state')
        .eq('staff_id', staff.id)

      const ids = (myLines ?? []).map(l => l.report_id)
      if (ids.length === 0) { setRows([]); setLoading(false); return }

      query = query.in('id', ids)
      if (box === 'toApprove') query = query.eq('status', 'pending')
      if (box === 'inProgress') query = query.eq('status', 'pending')
      if (box === 'myRejected') query = query.eq('status', 'rejected')
      if (box === 'myCompleted') query = query.eq('status', 'approved')
    }

    const { data } = await query.order('submitted_at', { ascending: false, nullsFirst: false })
    setRows((data ?? []) as unknown as Row[])
    setLoading(false)
  }, [staff, box])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex min-h-screen">
      <aside className="w-48 border-r border-border-primary py-6 shrink-0">
        <Link href="/approval/new"
          className="flex items-center gap-2 mx-4 mb-6 px-3 py-2 text-sm border border-border-primary rounded-lg">
          <PenLine size={14} className="text-txt-tertiary" /> 기안작성
        </Link>
        {BOXES.map(g => (
          <div key={g.group} className="mb-5">
            <div className="px-4 mb-1.5 text-xs text-txt-tertiary">{g.group}</div>
            {g.items.map(it => (
              <button key={it.key} onClick={() => setBox(it.key)}
                className={`w-full text-left px-4 py-1.5 text-sm ${box === it.key ? 'bg-surface-secondary font-medium' : 'text-txt-secondary'}`}>
                {it.label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <main className="flex-1 px-8 py-6">
        <div className="text-sm text-txt-secondary mb-4">총 {rows.length}건</div>
        <table className="w-full table-fixed text-xs">
          <thead className="bg-surface-secondary text-txt-secondary">
            <tr>
              <th className="w-[18%] px-3 py-2.5 text-left font-normal">문서번호</th>
              <th className="px-3 py-2.5 text-left font-normal">기안제목</th>
              <th className="w-[12%] px-3 py-2.5 text-left font-normal">기안자</th>
              <th className="w-[14%] px-3 py-2.5 text-right font-normal">지급총계</th>
              <th className="w-[14%] px-3 py-2.5 text-left font-normal">상신일시</th>
              <th className="w-[10%] px-3 py-2.5 text-left font-normal">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border-primary">
                <td className="px-3 py-3 text-txt-tertiary">{r.doc_no ?? '-'}</td>
                <td className="px-3 py-3">
                  <Link href={`/approval/${r.id}`} className="hover:underline">{r.title}</Link>
                </td>
                <td className="px-3 py-3">{r.staff?.name ?? ''}</td>
                <td className="px-3 py-3 text-right">{formatMoney(r.total_amount)}</td>
                <td className="px-3 py-3 text-txt-secondary">
                  {r.submitted_at ? new Date(r.submitted_at).toLocaleString('ko-KR') : '-'}
                </td>
                <td className="px-3 py-3">{APPROVAL_STATUS_LABEL[r.status]}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-txt-tertiary">문서가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: `src/app/approval/page.tsx` 작성**

```tsx
import ApprovalPage from '@/components/approval/ApprovalPage'

export default function Page() {
  return <ApprovalPage />
}
```

- [ ] **Step 3: 빌드 + 브라우저 확인**

```bash
npm run build
```

`/approval`에서 Task 10으로 만든 임시저장 문서가 `기안함 > 저장된`에 보이는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add src/components/approval/ApprovalPage.tsx src/app/approval/page.tsx
git commit -m "feat(approval): 문서함 목록 화면"
```

---

### Task 12: 문서 상세 + 승인/반려 팝업

**Files:**
- Create: `src/components/approval/ApproveModal.tsx`
- Create: `src/components/approval/ApprovalDetail.tsx`
- Create: `src/app/approval/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 1의 판정 함수 전부, Task 7의 approve/reject/cancel 라우트, Task 6의 submit/withdraw, Task 5의 delete
- Produces: `<ApprovalDetail reportId />`

- [ ] **Step 1: `src/components/approval/ApproveModal.tsx` 작성**

```tsx
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'
import { EXPENSE_CATEGORIES } from '@/types/approval'

interface Props {
  open: boolean
  title: string
  drafterName: string
  totalAmount: number
  paymentCount: number
  isFinal: boolean
  onClose: () => void
  onDone: () => void
  reportId: string
}

export default function ApproveModal({
  open, title, drafterName, totalAmount, paymentCount, isFinal, onClose, onDone, reportId,
}: Props) {
  const [mode, setMode] = useState<'approve' | 'reject'>('approve')
  const [category, setCategory] = useState<string>('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const submit = async () => {
    setBusy(true); setError(null)
    const url = mode === 'approve' ? '/api/approval/approve' : '/api/approval/reject'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reportId, category: category || undefined, comment }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) { setError(json.error); return }
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <div className="bg-surface w-full max-w-md rounded-xl border border-border-primary overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary">
          <span className="text-base font-medium">결재하기</span>
          <button onClick={onClose} aria-label="닫기"><X size={17} className="text-txt-tertiary" /></button>
        </div>

        <div className="px-5 py-4">
          <div className="bg-surface-secondary rounded-lg px-3 py-2.5 mb-4">
            <div className="text-xs mb-1">{title}</div>
            <div className="text-xs text-txt-secondary">
              기안 {drafterName} · 지급 총계 {formatMoney(totalAmount)}원 · {paymentCount}건
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setMode('approve')}
              className={`flex-1 py-2 text-sm rounded-lg border ${mode === 'approve' ? 'border-accent border-2' : 'border-border-primary text-txt-secondary'}`}>
              승인
            </button>
            <button onClick={() => setMode('reject')}
              className={`flex-1 py-2 text-sm rounded-lg border ${mode === 'reject' ? 'border-danger border-2' : 'border-border-primary text-txt-secondary'}`}>
              반려
            </button>
          </div>

          {mode === 'approve' && isFinal && (
            <>
              <div className="text-xs text-txt-secondary mb-1.5">계정과목 <span className="text-danger">*</span></div>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border-primary rounded-lg mb-1.5">
                <option value="">선택</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="text-xs text-txt-tertiary mb-4">
                승인하면 문서번호가 부여되고 지급정보 {paymentCount}건이 지출관리에 등록됩니다
              </p>
            </>
          )}

          <div className="text-xs text-txt-secondary mb-1.5">
            결재의견 {mode === 'reject' && <span className="text-danger">*</span>}
          </div>
          <textarea value={comment} onChange={e => setComment(e.target.value)}
            className="w-full h-20 px-3 py-2 text-sm border border-border-primary rounded-lg" />

          {error && <div className="mt-3 text-sm text-danger">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border-primary">
          <button onClick={onClose} className="px-5 py-2 text-sm border border-border-primary rounded-lg">취소</button>
          <button onClick={submit} disabled={busy}
            className="px-5 py-2 text-sm rounded-lg bg-accent text-txt-inverse disabled:opacity-40">결재</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `src/components/approval/ApprovalDetail.tsx` 작성**

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Paperclip } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { formatMoney } from '@/lib/utils/format'
import ApprovalLineView, { type LineCard } from './ApprovalLineView'
import ApproveModal from './ApproveModal'
import {
  canApprove, canWithdraw, canDelete, canSubmit, canCancel, isFinalApprover,
} from '@/lib/approval/status'
import {
  APPROVAL_STATUS_LABEL, LINE_ROLE_LABEL, LINE_STATE_LABEL,
  type ExpenseReport, type ExpenseReportPayment, type ExpenseReportDetail,
  type ExpenseReportLine, type ExpenseReportFile,
} from '@/types/approval'

type LineWithStaff = ExpenseReportLine & { staff: { name: string } | null }

export default function ApprovalDetail({ reportId }: { reportId: string }) {
  const router = useRouter()
  const { staff } = useAuth()

  const [report, setReport] = useState<ExpenseReport | null>(null)
  const [drafterName, setDrafterName] = useState('')
  const [payments, setPayments] = useState<ExpenseReportPayment[]>([])
  const [details, setDetails] = useState<ExpenseReportDetail[]>([])
  const [lines, setLines] = useState<LineWithStaff[]>([])
  const [files, setFiles] = useState<ExpenseReportFile[]>([])
  const [modal, setModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: r } = await supabase
      .from('expense_reports')
      .select('*, staff:drafter_staff_id(name)')
      .eq('id', reportId)
      .maybeSingle()

    if (!r) return
    const { staff: drafter, ...rest } = r as ExpenseReport & { staff: { name: string } | null }
    setReport(rest as ExpenseReport)
    setDrafterName(drafter?.name ?? '')

    const [{ data: p }, { data: d }, { data: l }, { data: f }] = await Promise.all([
      supabase.from('expense_report_payments').select('*').eq('report_id', reportId).order('seq'),
      supabase.from('expense_report_details').select('*').eq('report_id', reportId).order('seq'),
      supabase.from('expense_report_lines').select('*, staff(name)').eq('report_id', reportId).order('seq'),
      supabase.from('expense_report_files').select('*').eq('report_id', reportId).order('uploaded_at'),
    ])
    setPayments((p ?? []) as ExpenseReportPayment[])
    setDetails((d ?? []) as ExpenseReportDetail[])
    setLines((l ?? []) as LineWithStaff[])
    setFiles((f ?? []) as ExpenseReportFile[])
  }, [reportId])

  useEffect(() => { load() }, [load])

  const act = async (path: string) => {
    setError(null)
    const res = await fetch(`/api/approval/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reportId }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error); return }
    if (path === 'delete') { router.push('/approval'); return }
    load()
  }

  if (!report || !staff) return <div className="px-8 py-10 text-sm text-txt-tertiary">불러오는 중</div>

  const cards: LineCard[] = lines.map(l => ({
    staff_id: l.staff_id, name: l.staff?.name ?? '', role: l.role, state: l.state, acted_at: l.acted_at,
  }))

  const showApprove = canApprove(report, lines, staff.id)
  const final = isFinalApprover(lines, staff.id)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-lg font-medium mb-4">{report.title}</h1>

      <table className="w-full table-fixed text-xs mb-6">
        <tbody>
          <tr>
            <td className="w-[18%] px-2 py-2 text-txt-secondary border-b border-border-primary">기안양식</td>
            <td className="w-[32%] px-2 py-2 border-b border-border-primary">지출결의서</td>
            <td className="w-[18%] px-2 py-2 text-txt-secondary border-b border-border-primary">문서번호</td>
            <td className="px-2 py-2 border-b border-border-primary">{report.doc_no ?? '-'}</td>
          </tr>
          <tr>
            <td className="px-2 py-2 text-txt-secondary border-b border-border-primary">보존연한</td>
            <td className="px-2 py-2 border-b border-border-primary">{report.retention_years}년</td>
            <td className="px-2 py-2 text-txt-secondary border-b border-border-primary">상태</td>
            <td className="px-2 py-2 border-b border-border-primary">{APPROVAL_STATUS_LABEL[report.status]}</td>
          </tr>
          <tr>
            <td className="px-2 py-2 text-txt-secondary">기안자</td>
            <td className="px-2 py-2">{drafterName}</td>
            <td className="px-2 py-2 text-txt-secondary">기안부서</td>
            <td className="px-2 py-2">주식회사 다우건설</td>
          </tr>
        </tbody>
      </table>

      <div className="text-sm font-medium mb-2">결재선</div>
      <div className="mb-6">
        <ApprovalLineView drafterName={drafterName} drafterActedAt={report.submitted_at} lines={cards} />
      </div>

      {files.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-medium mb-2">파일첨부</div>
          <div className="flex flex-col gap-1">
            {files.map(f => (
              <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-accent-text hover:underline">
                <Paperclip size={12} /> {f.file_name}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="border border-border-primary rounded-lg overflow-hidden mb-5">
        <div className="flex items-center gap-3 px-3 py-3 border-b border-border-primary">
          <span className="text-xs text-txt-secondary">지급 총계(원)</span>
          <span className="text-lg font-medium">{formatMoney(report.total_amount)}</span>
        </div>
        <table className="w-full table-fixed text-xs">
          <thead className="bg-surface-secondary text-txt-secondary">
            <tr>
              <th className="w-[18%] px-2 py-2 text-left font-normal">거래처명</th>
              <th className="w-[16%] px-2 py-2 text-right font-normal">지급금액</th>
              <th className="w-[14%] px-2 py-2 text-left font-normal">지급요청일</th>
              <th className="w-[13%] px-2 py-2 text-left font-normal">은행</th>
              <th className="w-[22%] px-2 py-2 text-left font-normal">계좌번호</th>
              <th className="w-[17%] px-2 py-2 text-left font-normal">사업자번호</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id} className="border-t border-border-primary">
                <td className="px-2 py-2.5">{p.vendor_name}</td>
                <td className="px-2 py-2.5 text-right">{formatMoney(p.amount)}</td>
                <td className="px-2 py-2.5">{p.pay_request_date}</td>
                <td className="px-2 py-2.5">{p.bank}</td>
                <td className="px-2 py-2.5">{p.account_no}</td>
                <td className="px-2 py-2.5">{p.business_no ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {details.length > 0 && (
        <div className="border border-border-primary rounded-lg overflow-hidden mb-5">
          <div className="px-3 py-2 border-b border-border-primary text-xs font-medium">상세 내용</div>
          <table className="w-full table-fixed text-xs">
            <thead className="bg-surface-secondary text-txt-secondary">
              <tr>
                <th className="px-2 py-2 text-left font-normal">거래처명</th>
                <th className="px-2 py-2 text-left font-normal">계정</th>
                <th className="px-2 py-2 text-left font-normal">내용</th>
                <th className="px-2 py-2 text-left font-normal">부서명</th>
                <th className="px-2 py-2 text-right font-normal">금액</th>
                <th className="px-2 py-2 text-left font-normal">비고</th>
              </tr>
            </thead>
            <tbody>
              {details.map(d => (
                <tr key={d.id} className="border-t border-border-primary">
                  <td className="px-2 py-2.5">{d.vendor_name ?? ''}</td>
                  <td className="px-2 py-2.5">{d.account ?? ''}</td>
                  <td className="px-2 py-2.5">{d.content ?? ''}</td>
                  <td className="px-2 py-2.5">{d.dept_name ?? ''}</td>
                  <td className="px-2 py-2.5 text-right">{d.amount ? formatMoney(d.amount) : ''}</td>
                  <td className="px-2 py-2.5">{d.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.body_html && (
        <div className="border border-border-primary rounded-lg px-3 py-3 text-xs mb-6">{report.body_html}</div>
      )}

      <div className="text-sm font-medium mb-2">결재의견</div>
      <table className="w-full table-fixed text-xs mb-6">
        <thead className="bg-surface-secondary text-txt-secondary">
          <tr>
            <th className="w-[12%] px-2 py-2 text-left font-normal">결재구분</th>
            <th className="w-[18%] px-2 py-2 text-left font-normal">결재자</th>
            <th className="w-[12%] px-2 py-2 text-left font-normal">상태</th>
            <th className="w-[20%] px-2 py-2 text-left font-normal">일시</th>
            <th className="px-2 py-2 text-left font-normal">결재의견</th>
          </tr>
        </thead>
        <tbody>
          {lines.filter(l => l.acted_at).map(l => (
            <tr key={l.id} className="border-t border-border-primary">
              <td className="px-2 py-2.5">{LINE_ROLE_LABEL[l.role]}</td>
              <td className="px-2 py-2.5">{l.staff?.name ?? ''}</td>
              <td className="px-2 py-2.5">{LINE_STATE_LABEL[l.state]}</td>
              <td className="px-2 py-2.5">{l.acted_at ? new Date(l.acted_at).toLocaleString('ko-KR') : ''}</td>
              <td className="px-2 py-2.5">{l.comment ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}

      <div className="flex justify-center gap-2 border-t border-border-primary pt-5">
        <Link href="/approval" className="px-5 py-2 text-sm border border-border-primary rounded-lg">목록</Link>

        {canSubmit(report, staff.id) && (
          <Link href={`/approval/${reportId}/edit`} className="px-5 py-2 text-sm border border-border-primary rounded-lg">
            수정
          </Link>
        )}
        {canWithdraw(report, lines, staff.id) && (
          <button onClick={() => act('withdraw')} className="px-5 py-2 text-sm border border-border-primary rounded-lg">회수</button>
        )}
        {canDelete(report, staff.id) && (
          <button onClick={() => act('delete')} className="px-5 py-2 text-sm border border-border-primary rounded-lg text-danger">삭제</button>
        )}
        {canCancel(report, lines, staff.id) && (
          <button onClick={() => act('cancel')} className="px-5 py-2 text-sm border border-border-primary rounded-lg">결재취소</button>
        )}
        {showApprove && (
          <button onClick={() => setModal(true)} className="px-5 py-2 text-sm rounded-lg bg-accent text-txt-inverse">결재</button>
        )}
      </div>

      <ApproveModal
        open={modal}
        reportId={reportId}
        title={report.title}
        drafterName={drafterName}
        totalAmount={report.total_amount}
        paymentCount={payments.length}
        isFinal={final}
        onClose={() => setModal(false)}
        onDone={() => { setModal(false); load() }}
      />
    </div>
  )
}
```

- [ ] **Step 3: `src/app/approval/[id]/page.tsx` 작성**

```tsx
import ApprovalDetail from '@/components/approval/ApprovalDetail'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ApprovalDetail reportId={id} />
}
```

- [ ] **Step 4: 편집 라우트 추가 — `src/app/approval/[id]/edit/page.tsx`**

```tsx
import DraftForm from '@/components/approval/DraftForm'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DraftForm reportId={id} />
}
```

- [ ] **Step 5: 빌드 + 결재 한 바퀴 실제로 돌려보기**

```bash
npm run build
```

dev 서버에서 다음 순서로 확인한다.

1. `/approval/new`에서 문서를 만들고 **상신**
2. 결재자 계정으로 로그인해 `/approval` → `결재함 > 결재전`에 뜨는지
3. 문서를 열고 **결재** → 계정과목 선택 → 승인
4. 문서번호가 `CDV-26-000158`로 붙는지
5. `/expenses`에서 지출이 자동 등록됐는지 (금액·날짜·계정과목·메모 확인)
6. 같은 문서에서 다시 승인이 안 되는지 (버튼이 사라져야 한다)

`npx supabase db execute --query "SELECT id, expense_id FROM expense_report_payments WHERE report_id='<문서id>';"`로 `expense_id`가 채워졌는지도 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add src/components/approval/ApproveModal.tsx src/components/approval/ApprovalDetail.tsx src/app/approval
git commit -m "feat(approval): 문서 상세와 승인/반려 팝업 — 결재 한 바퀴 동작"
```

---

### Task 13: 재기안 + 참조문서

**Files:**
- Modify: `src/app/api/approval/save/route.ts` (참조문서 저장 추가)
- Modify: `src/components/approval/DraftForm.tsx` (복제 로드 + 참조문서 선택)
- Modify: `src/components/approval/ApprovalDetail.tsx` (재기안 버튼 + 참조문서 표시)
- Create: `src/app/approval/[id]/reissue/page.tsx`

**Interfaces:**
- Consumes: Task 10의 `DraftForm`, Task 12의 `ApprovalDetail`, Task 2의 `expense_report_refs`
- Produces: `<DraftForm copyFromId />` — 완료 문서 내용을 복제한 새 문서를 만든다. 결재선·첨부·참조문서는 복제하지 않는다. `/api/approval/save`가 `refs: string[]`를 받는다.

- [ ] **Step 1: `DraftForm`에 `copyFromId` prop 추가**

`src/components/approval/DraftForm.tsx`의 시그니처와 로드 로직을 바꾼다.

```tsx
export default function DraftForm({ reportId, copyFromId }: { reportId?: string; copyFromId?: string }) {
```

`useEffect` 안의 `if (!reportId) return`을 다음으로 바꾼다.

```tsx
    const sourceId = reportId ?? copyFromId
    if (!sourceId) return
```

이후 `reportId`를 참조하던 부분을 `sourceId`로 바꾸되, **결재선과 첨부는 복제하지 않는다.**

```tsx
      if (copyFromId) {
        setLines([])
        setFiles([])
      } else {
        setLines((l ?? []).map((x: Record<string, unknown>) => ({
          staff_id: x.staff_id as string,
          name: (x.staff as { name: string })?.name ?? '',
          role: x.role as LineDraft['role'],
        })))
        setFiles((f ?? []) as AttachedFile[])
      }
```

`useEffect` 의존성 배열을 `[reportId, copyFromId]`로 바꾼다.

`save()`에서 `body`의 `id`는 `reportId`만 보낸다(복제일 때는 새 문서를 만들어야 하므로 `copyFromId`를 넣지 않는다). 이미 `id: reportId`로 되어 있으므로 그대로 두면 된다.

- [ ] **Step 2: `src/app/approval/[id]/reissue/page.tsx` 작성**

```tsx
import DraftForm from '@/components/approval/DraftForm'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DraftForm copyFromId={id} />
}
```

- [ ] **Step 3: `ApprovalDetail`에 재기안 버튼 추가**

버튼 영역의 `목록` 링크 바로 다음에 넣는다.

```tsx
        {report.status === 'approved' && (
          <Link href={`/approval/${reportId}/reissue`} className="px-5 py-2 text-sm border border-border-primary rounded-lg">
            재기안
          </Link>
        )}
```

- [ ] **Step 4: `save` 라우트가 참조문서를 받도록 수정**

`src/app/api/approval/save/route.ts`의 `Body` 인터페이스에 한 줄 더한다. 선택 필드로 둔다 — 참조문서 없이 저장하는 경우가 대부분이다.

```ts
  refs?: string[]
```

기존 문서 수정 분기에서 자식 행을 지우는 곳에 한 줄 더한다.

```ts
    await admin.from('expense_report_refs').delete().eq('report_id', reportId)
```

결재선을 insert 하는 블록 다음에 더한다.

```ts
  if (body.refs && body.refs.length > 0) {
    await admin.from('expense_report_refs').insert(
      body.refs.map(refId => ({ report_id: reportId, ref_report_id: refId })),
    )
  }
```

- [ ] **Step 5: `DraftForm`에 참조문서 선택 붙이기**

상태를 더한다.

```tsx
  const [refs, setRefs] = useState<{ id: string; doc_no: string | null; title: string }[]>([])
  const [refPool, setRefPool] = useState<{ id: string; doc_no: string | null; title: string }[]>([])

  useEffect(() => {
    supabase
      .from('expense_reports')
      .select('id, doc_no, title')
      .eq('status', 'approved')
      .order('completed_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setRefPool(data ?? []))
  }, [])
```

`save()`의 `body`에 `refs: refs.map(r => r.id)`를 더한다.

파일첨부 블록 바로 아래에 UI를 넣는다.

```tsx
      <div className="flex gap-3 mb-6">
        <span className="w-16 text-xs text-txt-secondary pt-1.5">참조문서</span>
        <div className="flex-1">
          <div className="flex flex-wrap gap-2 mb-2">
            {refs.map(r => (
              <span key={r.id} className="flex items-center gap-1.5 px-2 py-1 text-xs bg-surface-secondary rounded">
                {r.doc_no ?? ''} {r.title}
                <button onClick={() => setRefs(refs.filter(x => x.id !== r.id))} aria-label="참조 해제">×</button>
              </span>
            ))}
          </div>
          <select
            value=""
            onChange={e => {
              const found = refPool.find(r => r.id === e.target.value)
              if (found && !refs.some(x => x.id === found.id)) setRefs([...refs, found])
            }}
            className="px-3 py-1.5 text-xs border border-border-primary rounded-lg"
          >
            <option value="">완료된 문서 추가</option>
            {refPool.filter(r => r.id !== reportId).map(r => (
              <option key={r.id} value={r.id}>{r.doc_no ?? ''} {r.title}</option>
            ))}
          </select>
        </div>
      </div>
```

편집 모드일 때 기존 참조를 불러오도록, 문서 로드 `useEffect`의 `Promise.all` 뒤에 더한다.

```tsx
      if (!copyFromId) {
        const { data: rf } = await supabase
          .from('expense_report_refs')
          .select('ref_report_id, expense_reports!expense_report_refs_ref_report_id_fkey(id, doc_no, title)')
          .eq('report_id', sourceId)
        setRefs((rf ?? []).map((x: Record<string, unknown>) =>
          x.expense_reports as { id: string; doc_no: string | null; title: string }))
      }
```

- [ ] **Step 6: `ApprovalDetail`에 참조문서 표시**

파일첨부 블록 다음에 넣는다. 상태와 로드는 다른 자식 테이블과 같은 패턴이다.

```tsx
      {refs.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-medium mb-2">참조문서</div>
          <div className="flex flex-col gap-1">
            {refs.map(r => (
              <Link key={r.id} href={`/approval/${r.id}`} className="text-xs text-accent-text hover:underline">
                {r.doc_no ?? ''} {r.title}
              </Link>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 7: 빌드 + 확인**

```bash
npm run build
```

- 완료된 문서에서 재기안을 눌러 제목·지급정보·상세내용이 복제되고 **결재선·첨부·참조문서는 비어 있는지** 확인
- 기안 작성에서 참조문서를 하나 붙이고 저장한 뒤, 상세에서 링크가 뜨고 눌리면 그 문서로 가는지 확인

- [ ] **Step 8: 커밋**

```bash
git add src/components/approval/DraftForm.tsx src/components/approval/ApprovalDetail.tsx src/app/api/approval/save src/app/approval/\[id\]/reissue
git commit -m "feat(approval): 재기안과 참조문서"
```

---

### Task 14: 엑셀 양식 다운로드 + 업로드 파싱

**Files:**
- Create: `src/lib/approval/excel.ts`
- Create: `src/lib/approval/excel.test.ts`
- Create: `src/app/api/approval/excel-template/route.ts`
- Create: `src/app/api/approval/excel-parse/route.ts`
- Modify: `src/components/approval/DraftForm.tsx`

**Interfaces:**
- Consumes: `exceljs`(설치됨), Task 1의 `PaymentRow`·`DetailRow`
- Produces: `buildTemplate() → Promise<Buffer>`, `parseWorkbook(buffer) → Promise<{ payments, details, errors }>`. `errors`는 `{ sheet, row, message }[]`.

- [ ] **Step 1: 실패하는 테스트 작성 — `src/lib/approval/excel.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildTemplate, parseWorkbook, normalizeDate, toAmount } from './excel'

describe('normalizeDate', () => {
  it('Date를 YYYY-MM-DD로 바꾼다', () => {
    expect(normalizeDate(new Date('2026-07-24T00:00:00Z'))).toBe('2026-07-24')
  })

  it('2026.07.24 형식을 받아준다', () => {
    expect(normalizeDate('2026.07.24')).toBe('2026-07-24')
  })

  it('2026/7/4 형식을 받아준다', () => {
    expect(normalizeDate('2026/7/4')).toBe('2026-07-04')
  })

  it('알 수 없는 값은 null', () => {
    expect(normalizeDate('내일')).toBeNull()
    expect(normalizeDate(null)).toBeNull()
  })
})

describe('toAmount', () => {
  it('숫자를 그대로 돌려준다', () => {
    expect(toAmount(9900000)).toBe(9900000)
  })

  it('9,900,000 같은 문자열에서 숫자만 뽑는다', () => {
    expect(toAmount('9,900,000')).toBe(9900000)
  })

  it('숫자가 없으면 null', () => {
    expect(toAmount('없음')).toBeNull()
    expect(toAmount(null)).toBeNull()
  })
})

describe('buildTemplate + parseWorkbook 왕복', () => {
  it('빈 양식을 만들고 다시 읽으면 행이 0건이다', async () => {
    const buf = await buildTemplate()
    const out = await parseWorkbook(buf)
    expect(out.payments).toEqual([])
    expect(out.details).toEqual([])
    expect(out.errors).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
npm test -- excel
```

기대: FAIL — 모듈 없음

- [ ] **Step 3: `src/lib/approval/excel.ts` 구현**

```ts
import ExcelJS from 'exceljs'
import type { PaymentRow, DetailRow } from '@/types/approval'

const PAYMENT_SHEET = '지급정보'
const DETAIL_SHEET = '상세내용'

const PAYMENT_HEADERS = ['거래처명', '지급금액', '지급요청일', '은행', '계좌번호', '사업자등록번호']
const DETAIL_HEADERS = ['거래처명', '계정', '내용', '부서명', '금액', '비고']

export interface ParseError {
  sheet: string
  row: number
  message: string
}

/** 엑셀 날짜를 YYYY-MM-DD로 정규화한다. 실패하면 null. */
export function normalizeDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value !== 'string') return null

  const m = value.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/)
  if (!m) return null
  const [, y, mo, d] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** 금액을 숫자로. 쉼표는 무시한다. 실패하면 null. */
export function toAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const digits = value.replace(/[,\s원]/g, '')
  if (!/^-?\d+$/.test(digits)) return null
  return Number(digits)
}

/** 빈 업로드 양식을 만든다. */
export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  const ps = wb.addWorksheet(PAYMENT_SHEET)
  ps.addRow(PAYMENT_HEADERS)
  ps.getRow(1).font = { bold: true }
  ps.columns = PAYMENT_HEADERS.map(() => ({ width: 20 }))

  const ds = wb.addWorksheet(DETAIL_SHEET)
  ds.addRow(DETAIL_HEADERS)
  ds.getRow(1).font = { bold: true }
  ds.columns = DETAIL_HEADERS.map(() => ({ width: 18 }))

  return Buffer.from(await wb.xlsx.writeBuffer())
}

function cellText(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'text' in v) return String((v as { text: string }).text).trim()
  return String(v).trim()
}

/**
 * 업로드된 xlsx를 읽어 행 배열을 만든다.
 * DB에 바로 쓰지 않는다 — 화면 표에 채워 넣고 사용자가 확인·수정한 뒤 저장한다.
 * 실패한 행은 버리지 않고 errors에 어느 행이 왜 실패했는지 담아 돌려준다.
 */
export async function parseWorkbook(buffer: Buffer): Promise<{
  payments: PaymentRow[]
  details: DetailRow[]
  errors: ParseError[]
}> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)

  const payments: PaymentRow[] = []
  const details: DetailRow[] = []
  const errors: ParseError[] = []

  const ps = wb.getWorksheet(PAYMENT_SHEET)
  if (ps) {
    ps.eachRow((row, n) => {
      if (n === 1) return
      const vendor = cellText(row, 1)
      if (!vendor) return   // 완전히 빈 행은 조용히 건너뛴다

      const amount = toAmount(row.getCell(2).value)
      const date = normalizeDate(row.getCell(3).value)
      const bank = cellText(row, 4)
      const account = cellText(row, 5)

      const missing: string[] = []
      if (amount === null) missing.push('지급금액')
      if (date === null) missing.push('지급요청일')
      if (!bank) missing.push('은행')
      if (!account) missing.push('계좌번호')

      if (missing.length > 0) {
        errors.push({ sheet: PAYMENT_SHEET, row: n, message: `${missing.join(', ')} 확인 필요` })
        return
      }

      payments.push({
        vendor_name: vendor, amount: amount!, pay_request_date: date!,
        bank, account_no: account, business_no: cellText(row, 6),
      })
    })
  }

  const ds = wb.getWorksheet(DETAIL_SHEET)
  if (ds) {
    ds.eachRow((row, n) => {
      if (n === 1) return
      const cells = [1, 2, 3, 4, 6].map(c => cellText(row, c))
      const amountRaw = row.getCell(5).value
      if (cells.every(c => !c) && (amountRaw === null || amountRaw === undefined)) return

      const amount = amountRaw === null || amountRaw === undefined ? 0 : toAmount(amountRaw)
      if (amount === null) {
        errors.push({ sheet: DETAIL_SHEET, row: n, message: '금액이 숫자가 아닙니다' })
        return
      }

      details.push({
        vendor_name: cells[0], account: cells[1], content: cells[2],
        dept_name: cells[3], amount, note: cells[4],
      })
    })
  }

  return { payments, details, errors }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm test -- excel
```

기대: PASS

- [ ] **Step 5: `src/app/api/approval/excel-template/route.ts` 작성**

```ts
import { requireStaff } from '@/lib/approval/guard'
import { buildTemplate } from '@/lib/approval/excel'

export async function GET() {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const buf = await buildTemplate()

  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="expense-report-template.xlsx"',
    },
  })
}
```

- [ ] **Step 6: `src/app/api/approval/excel-parse/route.ts` 작성**

```ts
import { NextRequest } from 'next/server'
import { requireStaff } from '@/lib/approval/guard'
import { parseWorkbook } from '@/lib/approval/excel'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const fd = await request.formData()
  const file = fd.get('file') as File | null
  if (!file) return Response.json({ error: '파일이 없습니다' }, { status: 400 })

  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return Response.json({ error: 'xlsx 파일만 업로드할 수 있습니다' }, { status: 400 })
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const out = await parseWorkbook(buf)
    return Response.json(out)
  } catch (e) {
    return Response.json(
      { error: `엑셀을 읽지 못했습니다: ${e instanceof Error ? e.message : '알 수 없는 오류'}` },
      { status: 400 },
    )
  }
}
```

- [ ] **Step 7: `DraftForm`에 엑셀 버튼 붙이기**

`PaymentTable`을 감싼 `<div className="mb-5">` 바로 위에 넣는다.

```tsx
      <div className="flex justify-end gap-2 mb-2">
        <a href="/api/approval/excel-template"
          className="px-2.5 py-1 text-xs border border-border-primary rounded">양식 받기</a>
        <label className="px-2.5 py-1 text-xs border border-border-primary rounded cursor-pointer">
          엑셀 업로드
          <input type="file" accept=".xlsx" className="hidden" onChange={async e => {
            const f = e.target.files?.[0]
            if (!f) return
            const fd = new FormData()
            fd.append('file', f)
            const res = await fetch('/api/approval/excel-parse', { method: 'POST', body: fd })
            const json = await res.json()
            if (!res.ok) { setError(json.error); return }
            setPayments(json.payments)
            setDetails(json.details)
            setError(json.errors.length > 0
              ? json.errors.map((x: { sheet: string; row: number; message: string }) =>
                  `${x.sheet} ${x.row}행: ${x.message}`).join(' / ')
              : null)
          }} />
        </label>
      </div>
```

- [ ] **Step 8: 빌드 + 확인**

```bash
npm run build
```

`/approval/new`에서 `양식 받기`로 xlsx를 받고, 지급정보 시트에 2행을 채워 다시 업로드해 표가 채워지는지 확인한다. 금액 칸에 `abc`를 넣어 업로드하면 `지급정보 2행: 지급금액 확인 필요` 같은 문구가 나와야 한다.

- [ ] **Step 9: 커밋**

```bash
git add src/lib/approval/excel.ts src/lib/approval/excel.test.ts src/app/api/approval/excel-template src/app/api/approval/excel-parse src/components/approval/DraftForm.tsx
git commit -m "feat(approval): 엑셀 양식 다운로드와 업로드 파싱"
```

---

### Task 15: 웹푸시 발송 기반

수신 쪽(`public/sw.js:37`)은 이미 완성돼 있다. 보내는 쪽만 만든다.

**Files:**
- Create: `src/lib/push/send.ts`
- Create: `src/app/api/push/subscribe/route.ts`
- Create: `src/components/settings/PushToggle.tsx`
- Modify: `package.json`
- Modify: `.env.local` (사람이 직접)

**Interfaces:**
- Consumes: Task 2의 `push_subscriptions` 테이블, Task 5의 `admin`·`requireStaff`
- Produces: `sendPush(staffIds, payload) → Promise<void>`. `payload`는 `{ title, body, url, tag? }`.

- [ ] **Step 1: `web-push` 설치**

```bash
npm install web-push
npm install -D @types/web-push
```

- [ ] **Step 2: VAPID 키 생성**

```bash
npx web-push generate-vapid-keys
```

출력된 Public Key와 Private Key를 `.env.local`에 넣고, Vercel 프로젝트 환경변수에도 등록한다.

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<Public Key>
VAPID_PRIVATE_KEY=<Private Key>
VAPID_SUBJECT=mailto:dawooconstr@gmail.com
```

- [ ] **Step 3: `src/lib/push/send.ts` 작성**

```ts
import webpush from 'web-push'
import { admin } from '@/lib/approval/guard'

let configured = false

function configure() {
  if (configured) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:dawooconstr@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  configured = true
}

export interface PushPayload {
  title: string
  body: string
  url: string
  tag?: string
}

/**
 * 직원들에게 웹푸시를 보낸다. 실패해도 예외를 던지지 않는다 —
 * 알림이 안 갔다고 결재 처리 자체가 실패하면 안 된다.
 */
export async function sendPush(staffIds: string[], payload: PushPayload): Promise<void> {
  if (staffIds.length === 0) return
  if (!process.env.VAPID_PRIVATE_KEY) return   // 키 미설정 환경에서는 조용히 넘어간다

  configure()

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('staff_id', staffIds)

  const body = JSON.stringify(payload)
  const dead: string[] = []

  await Promise.all((subs ?? []).map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      )
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      // 410 Gone / 404 = 만료된 구독. 지워야 계속 재시도하지 않는다.
      if (code === 410 || code === 404) dead.push(s.id)
    }
  }))

  if (dead.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', dead)
  }
}
```

- [ ] **Step 4: `src/app/api/push/subscribe/route.ts` 작성**

```ts
import { NextRequest } from 'next/server'
import { admin, requireStaff } from '@/lib/approval/guard'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const { endpoint, keys, userAgent } = (await request.json()) as {
    endpoint: string
    keys: { p256dh: string; auth: string }
    userAgent?: string
  }

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return Response.json({ error: '구독 정보가 올바르지 않습니다' }, { status: 400 })
  }

  const { error } = await admin.from('push_subscriptions').upsert({
    staff_id: staff.id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: userAgent ?? null,
  }, { onConflict: 'endpoint' })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
```

- [ ] **Step 5: `src/components/settings/PushToggle.tsx` 작성**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff } from 'lucide-react'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function PushToggle() {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setOn(!!sub))
      .catch(() => {})
  }, [])

  const enable = async () => {
    setBusy(true); setMsg(null)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setMsg('이 브라우저는 알림을 지원하지 않습니다')
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setMsg('브라우저에서 알림을 차단했습니다. 사이트 설정에서 허용해 주세요')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })

      const json = sub.toJSON()
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      })

      if (!res.ok) { setMsg('등록에 실패했습니다'); return }
      setOn(true)
      setMsg('알림이 켜졌습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-border-primary rounded-lg px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {on ? <Bell size={16} className="text-txt-tertiary" /> : <BellOff size={16} className="text-txt-tertiary" />}
          <span className="text-sm">결재 알림</span>
        </div>
        <button onClick={enable} disabled={busy || on}
          className="px-3 py-1.5 text-xs border border-border-primary rounded-lg disabled:opacity-40">
          {on ? '켜짐' : busy ? '설정 중' : '알림 켜기'}
        </button>
      </div>
      <p className="mt-2 text-xs text-txt-tertiary">
        결재 요청·승인·반려를 휴대폰으로 받습니다.
        아이폰은 사파리 탭이 아니라 <span className="font-medium">공유 → 홈 화면에 추가</span>로 설치한 뒤에만 알림이 옵니다.
      </p>
      {msg && <p className="mt-1.5 text-xs text-accent-text">{msg}</p>}
    </div>
  )
}
```

- [ ] **Step 6: 설정 화면에 배치**

먼저 설정 페이지의 메인 컴포넌트를 찾는다.

```bash
ls src/components/settings/
```

찾은 컴포넌트 파일 상단에 import를 더한다.

```tsx
import PushToggle from '@/components/settings/PushToggle'
```

그리고 최상위 섹션들이 나열된 곳(보통 `return (` 바로 아래의 컨테이너 안)에 섹션 하나를 더한다. 주변 섹션의 제목 마크업이 다르면 그쪽에 맞춘다.

```tsx
      <section className="mb-6">
        <h2 className="text-sm font-medium mb-2">알림</h2>
        <PushToggle />
      </section>
```

- [ ] **Step 7: 빌드 + 확인**

```bash
npm run build
```

안드로이드 크롬(또는 데스크톱 크롬)에서 설정 화면의 `알림 켜기`를 누르고 권한 허용 후, `push_subscriptions`에 행이 생기는지 확인한다.

```bash
npx supabase db execute --query "SELECT staff_id, left(endpoint, 40) FROM push_subscriptions;"
```

- [ ] **Step 8: 커밋**

```bash
git add package.json package-lock.json src/lib/push src/app/api/push src/components/settings/PushToggle.tsx
git commit -m "feat(push): 웹푸시 발송 기반과 알림 켜기 토글"
```

---

### Task 16: 알림 연결 + 화면 배지

**Files:**
- Modify: `src/app/api/approval/submit/route.ts`
- Modify: `src/app/api/approval/approve/route.ts`
- Modify: `src/app/api/approval/reject/route.ts`
- Modify: `src/app/api/approval/cancel/route.ts`
- Modify: `src/components/approval/ApprovalPage.tsx` (사이드 배지)
- Modify: 대시보드 컴포넌트 (`결재할 문서 N건` 카드)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 15의 `sendPush`, Task 1의 `currentTurnLine`
- Produces: 없음 (마무리 태스크)

- [ ] **Step 1: 상신 시 1차 결재자에게 알림 — `submit/route.ts`**

`import`를 더한다.

```ts
import { sendPush } from '@/lib/push/send'
import { currentTurnLine } from '@/lib/approval/status'
import { formatMoney } from '@/lib/utils/format'
```

`return Response.json({ ok: true })` 직전에 넣는다.

```ts
  const turn = currentTurnLine(loaded.lines.map(l => ({ ...l, state: 'waiting' as const })))
  if (turn) {
    await sendPush([turn.staff_id], {
      title: '결재 요청',
      body: `${loaded.report.title} / ${formatMoney(loaded.report.total_amount)}원`,
      url: `/approval/${id}`,
      tag: `approval-${id}`,
    })
  }
```

- [ ] **Step 2: 승인 시 알림 — `approve/route.ts`**

`import { sendPush } from '@/lib/push/send'`를 더한다.

중간 승인(`if (!final)`) 블록을 다음으로 바꾼다.

```ts
  if (!final) {
    const next = currentTurnLine(
      loaded.lines.map(l => (l.id === turn.id ? { ...l, state: 'approved' as const } : l)),
    )
    if (next) {
      await sendPush([next.staff_id], {
        title: '결재 요청',
        body: loaded.report.title,
        url: `/approval/${id}`,
        tag: `approval-${id}`,
      })
    }
    return Response.json({ ok: true, final: false })
  }
```

최종 승인의 `return Response.json({ ok: true, final: true, ... })` 직전에 넣는다.

```ts
  await sendPush([loaded.report.drafter_staff_id], {
    title: '결재 완료',
    body: `${docNo} — ${loaded.report.title}`,
    url: `/approval/${id}`,
    tag: `approval-${id}`,
  })
```

- [ ] **Step 3: 반려 시 기안자에게 알림 — `reject/route.ts`**

`import { sendPush } from '@/lib/push/send'`를 더하고 `return` 직전에 넣는다.

```ts
  await sendPush([loaded.report.drafter_staff_id], {
    title: '결재 반려',
    body: `${loaded.report.title} — ${comment}`,
    url: `/approval/${id}`,
    tag: `approval-${id}`,
  })
```

- [ ] **Step 4: 결재취소 시 알림 — `cancel/route.ts`**

`import { sendPush } from '@/lib/push/send'`를 더하고 `return` 직전에 넣는다.

```ts
  const nextIds = loaded.lines
    .filter(l => l.seq > mine.seq && l.state === 'waiting')
    .slice(0, 1)
    .map(l => l.staff_id)

  await sendPush([loaded.report.drafter_staff_id, ...nextIds], {
    title: '결재 취소됨',
    body: loaded.report.title,
    url: `/approval/${id}`,
    tag: `approval-${id}`,
  })
```

- [ ] **Step 5: 사이드 배지 — `ApprovalPage.tsx`**

컴포넌트 안에 미처리 건수 상태와 조회를 더한다.

```tsx
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!staff) return
    supabase
      .from('expense_report_lines')
      .select('report_id, expense_reports!inner(status)')
      .eq('staff_id', staff.id)
      .eq('state', 'waiting')
      .eq('expense_reports.status', 'pending')
      .then(({ data }) => setPendingCount(data?.length ?? 0))
  }, [staff])
```

`결재전` 버튼 라벨 옆에 숫자를 붙인다. `BOXES`를 순회하는 부분의 버튼 내용을 바꾼다.

```tsx
                {it.label}
                {it.key === 'toApprove' && pendingCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[11px] rounded-full bg-accent text-txt-inverse">
                    {pendingCount}
                  </span>
                )}
```

- [ ] **Step 6: 대시보드 카드 추가**

먼저 대시보드 메인 컴포넌트를 찾는다.

```bash
ls src/components/dashboard/
```

찾은 컴포넌트에 상태와 조회를 더한다.

```tsx
  const [approvalCount, setApprovalCount] = useState(0)

  useEffect(() => {
    const staffId = localStorage.getItem('dawoo_current_staff_id')
    if (!staffId) return
    supabase
      .from('expense_report_lines')
      .select('report_id, expense_reports!inner(status)')
      .eq('staff_id', staffId)
      .eq('state', 'waiting')
      .eq('expense_reports.status', 'pending')
      .then(({ data }) => setApprovalCount(data?.length ?? 0))
  }, [])
```

기존 통계 카드들이 늘어선 그리드 안에 카드를 하나 더한다. 주변 카드의 클래스가 다르면 그쪽에 맞춘다.

```tsx
        <Link href="/approval"
          className="bg-surface border border-border-primary rounded-xl px-4 py-3 block">
          <div className="text-xs text-txt-secondary mb-1">결재할 문서</div>
          <div className="text-2xl font-medium">{approvalCount}건</div>
        </Link>
```

`Link`와 `supabase`가 이미 import 돼 있지 않으면 더한다.

```tsx
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
```

- [ ] **Step 7: `CLAUDE.md` 갱신**

`## 페이지 구조` 블록의 `[업무]` 줄을 바꾼다.

```
[업무]    /calendar/work 캘린더(2탭) | /approval 지출결의서(전자결재) | /expenses 지출관리(3탭) | /leave 연차
```

`## DB 테이블` 표 끝에 한 줄 더한다.

```
| expense_reports / _payments / _details / _lines / _files / _refs / doc_sequences | 지출결의서 전자결재 |
| push_subscriptions | 웹푸시 구독 기기 |
```

`## API 라우트` 표에 두 줄 더한다.

```
| `/api/approval/*` | 지출결의서 결재 액션 (상신·승인·반려·회수·취소·엑셀) |
| `/api/push/subscribe` | 웹푸시 구독 등록 |
```

- [ ] **Step 8: 전체 검증**

```bash
npm test
```

기대: 전체 PASS

```bash
npm run build
```

기대: 에러 없음

```bash
npm run lint
```

기대: 에러 없음

브라우저에서 마지막으로 한 바퀴 돈다: 기안 → 상신 → (푸시 도착 확인) → 승인 → 문서번호 확인 → `/expenses`에 지출 등록 확인.

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "feat(approval): 결재 알림 연결과 화면 배지, 문서 갱신"
```

---

## 남은 것 (이 계획 밖)

- 카카오워크 과거 876건 이관 — 관리자 백업 zip으로 별도 과제
- 지급정보에 현장(`site_id`) 추가 — 현장별 원가 집계가 필요해지면
- `공개여부` 칸 복원 — `expense_reports.visibility` 컬럼 + 상단 셀렉트
