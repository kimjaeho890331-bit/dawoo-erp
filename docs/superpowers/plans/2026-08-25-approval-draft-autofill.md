# 지출결의서 기안 자동화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기안작성에서 반복 입력하던 세 가지(기안제목·결재선 후보 순서·거래처 서류 첨부)를 자동으로 채운다.

**Architecture:** 판단 로직은 전부 `src/lib/approval/`의 순수 함수로 빼고, 컴포넌트와 API 라우트는 그 함수를 부르기만 한다. 이 프로젝트의 vitest는 `environment: 'node'` / `include: ['src/**/*.test.ts']`라 `.tsx` 컴포넌트 테스트를 돌릴 수 없다. 그래서 로직을 순수 함수로 분리하는 것이 유일한 자동 검증 수단이다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase(JS 클라이언트 + REST), vitest

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-25-approval-draft-autofill-design.md`
- 기안제목 최대 50자 (`DraftForm`의 입력칸이 `slice(0, 50)`)
- 결재 순서(`expense_report_lines.seq`) 로직은 건드리지 않는다
- 거래처DB(`vendors`)는 읽기만 한다
- 새 마이그레이션 번호는 `021` (기존 최신은 `020_building_ledger_requests_anon_rls.sql`)
- 아이콘은 Lucide React 단색, 이모지 금지 (CLAUDE.md 공통 UI 규칙)
- 각 태스크 끝에서 `npx tsc --noEmit`과 `npx vitest run` 전체 통과

---

### Task 1: 결재선 후보 목록 고정 순서

**Files:**
- Create: `src/lib/approval/staffOrder.ts`
- Create: `src/lib/approval/staffOrder.test.ts`
- Modify: `src/components/approval/ApprovalLineModal.tsx` (43행 부근 staff 조회)

**Interfaces:**
- Consumes: 없음
- Produces: `sortStaffForApprovalLine<T extends { name: string }>(staff: T[]): T[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/approval/staffOrder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sortStaffForApprovalLine } from './staffOrder'

describe('sortStaffForApprovalLine', () => {
  it('지정한 5명을 정해진 순서로 앞세운다', () => {
    const input = [
      { name: '김지선' }, { name: '김재호' }, { name: '김용이' },
      { name: '송승란' }, { name: '조혜진' },
    ]
    expect(sortStaffForApprovalLine(input).map(s => s.name))
      .toEqual(['조혜진', '송승란', '김용이', '김재호', '김지선'])
  })

  it('목록에 없는 직원은 뒤에 이름순으로 붙인다', () => {
    const input = [
      { name: '한유빈' }, { name: '조혜진' }, { name: '고상준' }, { name: '김지선' },
    ]
    expect(sortStaffForApprovalLine(input).map(s => s.name))
      .toEqual(['조혜진', '김지선', '고상준', '한유빈'])
  })

  it('지정 목록이 하나도 없으면 이름순으로만 돌려준다', () => {
    const input = [{ name: '한유빈' }, { name: '고상준' }, { name: '임대진' }]
    expect(sortStaffForApprovalLine(input).map(s => s.name))
      .toEqual(['고상준', '임대진', '한유빈'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const input = [{ name: '한유빈' }, { name: '조혜진' }]
    sortStaffForApprovalLine(input)
    expect(input.map(s => s.name)).toEqual(['한유빈', '조혜진'])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/approval/staffOrder.test.ts`

Expected: FAIL — `Cannot find module './staffOrder'`

- [ ] **Step 3: 최소 구현**

`src/lib/approval/staffOrder.ts`:

```ts
/**
 * 결재선 설정 모달의 후보 목록 정렬 순서.
 *
 * 실제 결재 순서(expense_report_lines.seq)와는 무관하다 — 그건 사용자가 오른쪽
 * 패널에 추가한 순서로 정해진다. 여기는 "고르기 쉬운 순서"일 뿐이다.
 *
 * 직원 12명 규모라 이름 배열로 둔다. 화면에서 순서를 조정하고 싶어지면 그때
 * staff에 정렬 컬럼을 두는 게 맞지만 지금은 과하다.
 */
const PRIORITY = ['조혜진', '송승란', '김용이', '김재호', '김지선']

/** 지정 순서 먼저, 그 외는 이름순. 원본 배열은 건드리지 않는다. */
export function sortStaffForApprovalLine<T extends { name: string }>(staff: T[]): T[] {
  const rank = (name: string) => {
    const i = PRIORITY.indexOf(name)
    return i === -1 ? PRIORITY.length : i
  }
  return [...staff].sort((a, b) => {
    const d = rank(a.name) - rank(b.name)
    return d !== 0 ? d : a.name.localeCompare(b.name, 'ko')
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/approval/staffOrder.test.ts`

Expected: PASS — 4 tests

- [ ] **Step 5: 모달에 연결**

`src/components/approval/ApprovalLineModal.tsx` 상단에 import를 추가한다:

```ts
import { sortStaffForApprovalLine } from '@/lib/approval/staffOrder'
```

43행 부근의 조회를 바꾼다. 변경 전:

```ts
    supabase.from('staff').select('id, name').order('name').then(({ data }) => {
      setStaffList((data ?? []) as StaffRow[])
    })
```

변경 후 (`.order('name')` 제거 — 정렬은 함수가 맡는다):

```ts
    supabase.from('staff').select('id, name').then(({ data }) => {
      setStaffList(sortStaffForApprovalLine((data ?? []) as StaffRow[]))
    })
```

- [ ] **Step 6: 전체 검증**

Run: `npx tsc --noEmit && npx vitest run`

Expected: 타입 오류 없음, 전체 테스트 통과

- [ ] **Step 7: 커밋**

```bash
git add src/lib/approval/staffOrder.ts src/lib/approval/staffOrder.test.ts src/components/approval/ApprovalLineModal.tsx && git commit -m "feat(approval): 결재선 후보 목록을 자주 쓰는 순서로 정렬"
```

---

### Task 2: 현장·접수건 선택 시 기안제목 자동입력

**Files:**
- Create: `src/lib/approval/draftTitle.ts`
- Create: `src/lib/approval/draftTitle.test.ts`
- Modify: `src/components/approval/DraftForm.tsx` (WorkTargetPicker의 `onChange`, 283행 부근)

**Interfaces:**
- Consumes: 없음
- Produces: `draftTitleFromTarget(targetName: string): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/approval/draftTitle.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { draftTitleFromTarget } from './draftTitle'

describe('draftTitleFromTarget', () => {
  it('대상 이름 뒤에 집행 요청의 건을 붙인다', () => {
    expect(draftTitleFromTarget('아름학교 인방보수공사'))
      .toBe('아름학교 인방보수공사 집행 요청의 건')
  })

  it('50자를 넘으면 잘라낸다', () => {
    const long = '가'.repeat(60)
    expect(draftTitleFromTarget(long)).toHaveLength(50)
  })

  it('앞뒤 공백을 정리한다', () => {
    expect(draftTitleFromTarget('  한수중학교 옥상 방수공사  '))
      .toBe('한수중학교 옥상 방수공사 집행 요청의 건')
  })

  it('이름이 비어 있으면 빈 문자열을 돌려준다', () => {
    expect(draftTitleFromTarget('')).toBe('')
    expect(draftTitleFromTarget('   ')).toBe('')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/approval/draftTitle.test.ts`

Expected: FAIL — `Cannot find module './draftTitle'`

- [ ] **Step 3: 최소 구현**

`src/lib/approval/draftTitle.ts`:

```ts
/** 기안제목 입력칸의 최대 길이. DraftForm의 slice(0, 50)과 맞춘다. */
const MAX_TITLE = 50
const SUFFIX = ' 집행 요청의 건'

/**
 * 현장·접수건 이름으로 기안제목 초안을 만든다.
 *
 * 가운데 거래처명은 기안자가 직접 끼워 넣는다 — 거래처를 나중에 바꾸면 제목이
 * 어긋나므로 자동으로 조합하지 않는다.
 */
export function draftTitleFromTarget(targetName: string): string {
  const name = targetName.trim()
  if (!name) return ''
  return (name + SUFFIX).slice(0, MAX_TITLE)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/approval/draftTitle.test.ts`

Expected: PASS — 4 tests

- [ ] **Step 5: projects 목록의 이름 필드를 확인**

Run: `grep -n "setProjects\|projects\b" src/components/approval/DraftForm.tsx | head -8`

Expected: `projects` state의 원소 타입을 확인한다. `{ id, name }`이면 Step 6 코드를 그대로 쓰고, 이름 필드가 `name`이 아니면(예: `building_name`) Step 6의 `p.name`을 실제 필드명으로 바꾼다.

- [ ] **Step 6: DraftForm에 연결**

상단에 import를 추가한다:

```ts
import { draftTitleFromTarget } from '@/lib/approval/draftTitle'
```

283행 부근 `WorkTargetPicker`의 `onChange`를 바꾼다. 변경 전:

```tsx
            onChange={next => { setWorkKind(next.kind); setSiteId(next.siteId); setProjectId(next.projectId) }}
```

변경 후:

```tsx
            onChange={next => {
              setWorkKind(next.kind)
              setSiteId(next.siteId)
              setProjectId(next.projectId)
              // 제목이 비어 있을 때만 채운다 — 손으로 고친 제목이 날아가면 안 된다
              setTitle(prev => {
                if (prev.trim()) return prev
                const picked = next.siteId
                  ? sites.find(s => s.id === next.siteId)?.name
                  : projects.find(p => p.id === next.projectId)?.name
                return picked ? draftTitleFromTarget(picked) : prev
              })
            }}
```

- [ ] **Step 7: 전체 검증**

Run: `npx tsc --noEmit && npx vitest run`

Expected: 타입 오류 없음, 전체 테스트 통과

- [ ] **Step 8: 커밋**

```bash
git add src/lib/approval/draftTitle.ts src/lib/approval/draftTitle.test.ts src/components/approval/DraftForm.tsx && git commit -m "feat(approval): 현장·접수건을 고르면 기안제목을 채운다"
```

---

### Task 3: 첨부 출처 컬럼과 영수증 선정 규칙

Task 4에서 거래처 서류를 자동으로 붙이면 그게 항상 먼저 올라와 영수증 자리를 차지한다. 자동 첨부를 켜기 **전에** 출처 구분을 먼저 넣는다.

**Files:**
- Create: `supabase/migrations/021_expense_report_files_source.sql`
- Create: `src/lib/approval/receipt.ts`
- Create: `src/lib/approval/receipt.test.ts`
- Modify: `src/types/approval.ts` (`ExpenseReportFile`, 96행 부근)
- Modify: `src/components/approval/FileAttach.tsx` (`AttachedFile` 6행 부근, `added.push` 부근)
- Modify: `src/app/api/approval/save/route.ts` (`FileInput` 14행, files insert 218행 부근)
- Modify: `src/app/api/approval/approve/route.ts` (files 조회 92행 부근, `firstFileUrl` 부근)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `AttachedFile`에 `source: 'manual' | 'vendor'` 필드 추가
  - `pickReceiptUrl(files: { file_url: string; source: string }[]): string | null`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/021_expense_report_files_source.sql`:

```sql
-- 첨부 출처. 거래처DB에서 자동으로 붙은 서류와 기안자가 직접 올린 파일을 구분한다.
-- 승인 시 지출 영수증(expenses.receipt_url)은 직접 올린 것 중에서만 고른다 —
-- 자동 첨부(사업자등록증·통장사본)가 영수증으로 기록되면 회계 자료가 어긋난다.
ALTER TABLE expense_report_files
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- 기존 행은 전부 기안자가 직접 올린 것이므로 기본값이 사실과 맞는다.
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/approval/receipt.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pickReceiptUrl } from './receipt'

describe('pickReceiptUrl', () => {
  it('직접 올린 파일 중 첫 번째를 고른다', () => {
    expect(pickReceiptUrl([
      { file_url: 'vendors/사업자등록증.pdf', source: 'vendor' },
      { file_url: 'vendors/통장사본.pdf', source: 'vendor' },
      { file_url: 'approval/세금계산서.pdf', source: 'manual' },
      { file_url: 'approval/견적서.pdf', source: 'manual' },
    ])).toBe('approval/세금계산서.pdf')
  })

  it('거래처 서류밖에 없으면 null을 돌려준다', () => {
    expect(pickReceiptUrl([
      { file_url: 'vendors/사업자등록증.pdf', source: 'vendor' },
    ])).toBeNull()
  })

  it('첨부가 없으면 null을 돌려준다', () => {
    expect(pickReceiptUrl([])).toBeNull()
  })

  it('source가 비어 있는 예전 행은 직접 올린 것으로 본다', () => {
    expect(pickReceiptUrl([
      { file_url: 'approval/영수증.jpg', source: '' },
    ])).toBe('approval/영수증.jpg')
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/approval/receipt.test.ts`

Expected: FAIL — `Cannot find module './receipt'`

- [ ] **Step 4: 최소 구현**

`src/lib/approval/receipt.ts`:

```ts
/**
 * 지출 영수증으로 쓸 첨부를 고른다.
 *
 * 거래처DB에서 자동으로 붙은 서류(사업자등록증·통장사본)는 영수증이 아니다.
 * 기안자가 직접 올린 것(전자세금계산서·거래명세서·견적서) 중 첫 번째를 쓴다.
 * 직접 올린 게 없으면 비운다 — 잘못된 영수증보다 빈 영수증이 낫다.
 *
 * 입력은 uploaded_at 오름차순으로 정렬돼 있다고 가정한다(호출부 책임).
 */
export function pickReceiptUrl(
  files: { file_url: string; source: string }[],
): string | null {
  const manual = files.find(f => f.source !== 'vendor')
  return manual?.file_url ?? null
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/lib/approval/receipt.test.ts`

Expected: PASS — 4 tests

- [ ] **Step 6: 타입에 source 추가**

`src/types/approval.ts`의 `ExpenseReportFile`을 바꾼다:

```ts
export interface ExpenseReportFile {
  id: string
  report_id: string
  file_name: string
  file_url: string
  size: number
  /** 'manual' = 기안자가 직접 올림, 'vendor' = 거래처DB에서 자동 첨부 */
  source: 'manual' | 'vendor'
  uploaded_at: string
}
```

`src/components/approval/FileAttach.tsx`의 `AttachedFile`을 바꾼다:

```ts
export interface AttachedFile {
  file_name: string
  file_url: string
  size: number
  /** 'manual' = 직접 올림, 'vendor' = 거래처DB에서 자동 첨부 */
  source: 'manual' | 'vendor'
}
```

같은 파일에서 업로드 성공 시 목록에 넣는 줄에 `source`를 넣는다. 변경 전:

```ts
        added.push({ file_name: file.name, file_url: json.url, size: file.size })
```

변경 후:

```ts
        added.push({ file_name: file.name, file_url: json.url, size: file.size, source: 'manual' })
```

- [ ] **Step 7: save 라우트에 source 저장**

`src/app/api/approval/save/route.ts` 14행:

```ts
interface FileInput { file_name: string; file_url: string; size: number; source?: 'manual' | 'vendor' }
```

218행 부근 insert의 map에 필드를 추가한다. 변경 전:

```ts
      files.map(f => ({
        report_id: reportId,
        file_name: f.file_name, file_url: f.file_url, size: f.size,
```

변경 후:

```ts
      files.map(f => ({
        report_id: reportId,
        file_name: f.file_name, file_url: f.file_url, size: f.size,
        source: f.source ?? 'manual',
```

- [ ] **Step 8: approve 라우트의 영수증 선정 교체**

상단에 import를 추가한다:

```ts
import { pickReceiptUrl } from '@/lib/approval/receipt'
```

92행 부근 조회를 바꾼다. `limit(1)`을 없애야 한다 — 직접 올린 파일을 찾으려면 전부 봐야 한다. 변경 전:

```ts
  const { data: files, error: filesError } = await admin
    .from('expense_report_files')
    .select('file_url')
    .eq('report_id', id)
    .order('uploaded_at')
    .limit(1)
```

변경 후:

```ts
  const { data: files, error: filesError } = await admin
    .from('expense_report_files')
    .select('file_url, source')
    .eq('report_id', id)
    .order('uploaded_at')
```

`paymentsToExpenses` 호출부를 바꾼다. 변경 전:

```ts
    firstFileUrl: files?.[0]?.file_url ?? null,
```

변경 후:

```ts
    firstFileUrl: pickReceiptUrl(files ?? []),
```

- [ ] **Step 9: 마이그레이션 적용**

Run: `npx supabase db push`

Expected: `021_expense_report_files_source.sql` 적용 완료 메시지

적용됐는지 확인한다:

```bash
cd "C:/Users/dawoo/ERP 헤르메스/dawoo-erp" && URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL' .env.local | cut -d= -f2- | tr -d '"\r') && KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY' .env.local | cut -d= -f2- | tr -d '"\r') && curl -s "$URL/rest/v1/expense_report_files?select=file_name,source&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Expected: 응답에 `"source":"manual"`이 포함된다

- [ ] **Step 10: 전체 검증**

Run: `npx tsc --noEmit && npx vitest run && npm run build`

Expected: 전부 통과

- [ ] **Step 11: 커밋**

```bash
git add supabase/migrations/021_expense_report_files_source.sql src/lib/approval/receipt.ts src/lib/approval/receipt.test.ts src/types/approval.ts src/components/approval/FileAttach.tsx src/app/api/approval/save/route.ts src/app/api/approval/approve/route.ts && git commit -m "feat(approval): 첨부 출처를 구분하고 영수증은 직접 올린 파일에서 고른다"
```

---

### Task 4: 거래처 선택 시 서류 자동 첨부

**Files:**
- Create: `src/lib/approval/vendorDocs.ts`
- Create: `src/lib/approval/vendorDocs.test.ts`
- Modify: `src/components/approval/VendorNameCell.tsx` (`VendorOption` 8행 부근, `Props`, `pick()`)
- Modify: `src/components/approval/PaymentTable.tsx` (vendors 조회 컬럼, `Props`, `VendorNameCell` 사용부 전체)
- Modify: `src/components/approval/DraftForm.tsx` (420행 부근 `PaymentTable` 사용부)
- Modify: `src/components/approval/FileAttach.tsx` (첨부 칩에 거래처 배지)

**Interfaces:**
- Consumes: Task 3의 `AttachedFile.source`
- Produces: `vendorDocsToAttachments(vendor: VendorDocSource, existing: { file_url: string }[]): VendorAttachment[]` — 새로 붙일 것만 돌려준다. `VendorAttachment`는 `AttachedFile`과 구조가 같아 그대로 `setFiles`에 넣을 수 있다

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/approval/vendorDocs.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { vendorDocsToAttachments } from './vendorDocs'

const vendor = {
  name: '기원건설',
  biz_license_url: 'https://x/vendors/biz.pdf',
  bankbook_url: 'https://x/vendors/bank.pdf',
}

describe('vendorDocsToAttachments', () => {
  it('사업자등록증과 통장사본을 거래처 출처로 만든다', () => {
    expect(vendorDocsToAttachments(vendor, [])).toEqual([
      { file_name: '기원건설 사업자등록증', file_url: 'https://x/vendors/biz.pdf', size: 0, source: 'vendor' },
      { file_name: '기원건설 통장사본', file_url: 'https://x/vendors/bank.pdf', size: 0, source: 'vendor' },
    ])
  })

  it('이미 붙어 있는 파일은 다시 붙이지 않는다', () => {
    const existing = [
      { file_name: '기원건설 사업자등록증', file_url: 'https://x/vendors/biz.pdf', size: 0, source: 'vendor' as const },
    ]
    expect(vendorDocsToAttachments(vendor, existing).map(f => f.file_url))
      .toEqual(['https://x/vendors/bank.pdf'])
  })

  it('서류가 없는 거래처면 빈 배열을 돌려준다', () => {
    expect(vendorDocsToAttachments(
      { name: '노나', biz_license_url: null, bankbook_url: null }, [],
    )).toEqual([])
  })

  it('한쪽만 등록돼 있으면 그것만 돌려준다', () => {
    expect(vendorDocsToAttachments(
      { name: '노나', biz_license_url: null, bankbook_url: 'https://x/vendors/b.pdf' }, [],
    ).map(f => f.file_name)).toEqual(['노나 통장사본'])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/approval/vendorDocs.test.ts`

Expected: FAIL — `Cannot find module './vendorDocs'`

- [ ] **Step 3: 최소 구현**

`src/lib/approval/vendorDocs.ts`:

```ts
export interface VendorDocSource {
  name: string
  biz_license_url: string | null
  bankbook_url: string | null
}

/**
 * FileAttach의 AttachedFile과 구조가 같다. 여기서 따로 정의하는 이유는
 * src/lib이 컴포넌트를 import하면 의존 방향이 뒤집히기 때문이다 —
 * 이 파일은 순수 함수만 두고 vitest에서 컴포넌트 없이 돌아가야 한다.
 */
export interface VendorAttachment {
  file_name: string
  file_url: string
  size: number
  source: 'vendor'
}

/**
 * 거래처DB에 등록된 결제 서류를 첨부 목록에 붙일 형태로 바꾼다.
 *
 * 파일을 복사하지 않고 거래처DB의 URL을 그대로 가리킨다. size는 알 수 없어 0으로
 * 둔다(표시용일 뿐 계산에 쓰이지 않는다).
 * 신분증·안전교육증은 결제 서류가 아니라 넣지 않는다.
 *
 * 이미 붙어 있는 URL은 걸러낸다 — 거래처를 다시 고르거나 지급정보 행을 여러 개
 * 쓸 때 같은 파일이 쌓이면 안 된다.
 */
export function vendorDocsToAttachments(
  vendor: VendorDocSource,
  existing: { file_url: string }[],
): VendorAttachment[] {
  const already = new Set(existing.map(f => f.file_url))
  const candidates: { label: string; url: string | null }[] = [
    { label: '사업자등록증', url: vendor.biz_license_url },
    { label: '통장사본', url: vendor.bankbook_url },
  ]
  return candidates
    .filter((c): c is { label: string; url: string } => !!c.url && !already.has(c.url))
    .map(c => ({
      file_name: `${vendor.name} ${c.label}`,
      file_url: c.url,
      size: 0,
      source: 'vendor' as const,
    }))
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/approval/vendorDocs.test.ts`

Expected: PASS — 4 tests

- [ ] **Step 5: VendorOption에 서류 URL과 콜백 추가**

`src/components/approval/VendorNameCell.tsx`의 `VendorOption`을 바꾼다:

```ts
export interface VendorOption {
  id: string
  name: string
  business_number: string | null
  bank_name: string | null
  account_number: string | null
  bank_info: string | null
  biz_license_url: string | null
  bankbook_url: string | null
}
```

`Props`에 콜백을 추가한다:

```ts
interface Props {
  value: string
  vendors: VendorOption[]
  onInput: (value: string) => void
  onSelect: (patch: Partial<PaymentRow>) => void
  /** 거래처를 고른 순간, 그 업체의 결제 서류를 첨부에 붙이라고 알린다 */
  onPickVendor?: (vendor: VendorOption) => void
  className: string
  placeholder?: string
}
```

컴포넌트 시그니처의 구조분해에 `onPickVendor`를 넣는다:

```ts
export default function VendorNameCell({ value, vendors, onInput, onSelect, onPickVendor, className, placeholder }: Props) {
```

`pick()` 안에서 `setOpen(false)` 바로 앞에 호출을 넣는다:

```ts
    onPickVendor?.(v)
    setOpen(false)
```

- [ ] **Step 6: PaymentTable에서 위로 넘기기**

`src/components/approval/PaymentTable.tsx`의 vendors 조회 select 문자열 끝에 서류 컬럼 두 개를 덧붙인다. 예를 들어 현재가

```ts
.select('id, name, business_number, bank_name, account_number, bank_info')
```

이면 다음으로 바꾼다:

```ts
.select('id, name, business_number, bank_name, account_number, bank_info, biz_license_url, bankbook_url')
```

`Props`를 확장한다:

```ts
interface Props {
  rows: PaymentRow[]
  onChange: (rows: PaymentRow[]) => void
  onPickVendor?: (vendor: VendorOption) => void
}
```

컴포넌트 시그니처도 함께 바꾼다:

```ts
export default function PaymentTable({ rows, onChange, onPickVendor }: Props) {
```

`VendorNameCell`을 쓰는 **모든 곳**에 전달한다. 데스크톱 표와 모바일 카드에 각각 있을 수 있으므로 먼저 전부 찾는다:

Run: `grep -n "VendorNameCell" src/components/approval/PaymentTable.tsx`

찾은 사용처마다 아래 한 줄을 추가한다:

```tsx
                onPickVendor={onPickVendor}
```

- [ ] **Step 7: DraftForm에서 첨부에 붙이기**

상단에 import를 추가한다:

```ts
import { vendorDocsToAttachments } from '@/lib/approval/vendorDocs'
```

420행 부근 `PaymentTable` 사용부를 바꾼다. 변경 전:

```tsx
      <div className={`${stepBlock(1)} mb-8`}><PaymentTable rows={payments} onChange={setPayments} /></div>
```

변경 후:

```tsx
      <div className={`${stepBlock(1)} mb-8`}>
        <PaymentTable
          rows={payments}
          onChange={setPayments}
          onPickVendor={v => setFiles(prev => [...prev, ...vendorDocsToAttachments(v, prev)])}
        />
      </div>
```

- [ ] **Step 8: FileAttach에 거래처 배지**

`src/components/approval/FileAttach.tsx`의 첨부 칩 렌더링을 바꾼다. 변경 전:

```tsx
          <span key={i} className="flex items-center gap-1.5 px-2 py-1 text-xs bg-surface-secondary rounded">
            <Paperclip size={12} className="text-txt-tertiary" />
            {f.file_name}
```

변경 후:

```tsx
          <span key={i} className="flex items-center gap-1.5 px-2 py-1 text-xs bg-surface-secondary rounded">
            <Paperclip size={12} className="text-txt-tertiary" />
            {f.file_name}
            {f.source === 'vendor' && (
              <span className="rounded bg-surface-tertiary px-1 text-[10px] text-txt-tertiary">거래처</span>
            )}
```

- [ ] **Step 9: 전체 검증**

Run: `npx tsc --noEmit && npx vitest run && npx eslint src/lib/approval src/components/approval && npm run build`

Expected: 전부 통과. eslint 지적 건수가 작업 전과 같아야 한다(신규 0건).

- [ ] **Step 10: 커밋**

```bash
git add src/lib/approval/vendorDocs.ts src/lib/approval/vendorDocs.test.ts src/components/approval/VendorNameCell.tsx src/components/approval/PaymentTable.tsx src/components/approval/DraftForm.tsx src/components/approval/FileAttach.tsx && git commit -m "feat(approval): 거래처를 고르면 사업자등록증·통장사본을 자동 첨부한다"
```

---

### Task 5: 브라우저 실동작 확인

단위 테스트로는 화면 연결을 검증할 수 없다(이 프로젝트에는 컴포넌트 테스트 환경이 없다). 로컬 서버에서 사람이 직접 확인한다.

**Files:** 없음 (검증 전용)

**Interfaces:**
- Consumes: Task 1~4의 결과 전부
- Produces: 없음

- [ ] **Step 1: 개발 서버 실행**

Run: `npm run dev`

`http://localhost:3000/approval/new` 접속 (로그인 필요)

- [ ] **Step 2: 결재선 순서 확인**

`결재선 설정`을 연다. 왼쪽 후보 목록이 조혜진 → 송승란 → 김용이 → 김재호 → 김지선 → 나머지 이름순인지 확인한다.

이어서 오른쪽에 두 명을 차례로 추가하고, **추가한 순서 그대로** 결재선이 잡히는지 확인한다. 후보 목록 순서와 무관해야 한다.

- [ ] **Step 3: 기안제목 확인**

제목을 비운 채 현장을 고른다 → `{현장명} 집행 요청의 건`이 채워져야 한다.

제목에 아무 글자나 쓴 뒤 현장을 바꾼다 → 제목이 그대로여야 한다.

접수건(수도·소규모)을 골라도 같은 동작인지 확인한다.

- [ ] **Step 4: 거래처 자동 첨부 확인**

지급 정보 → 추가 → 거래처명에서 서류가 등록된 업체를 고른다. 첨부 목록에 `{업체명} 사업자등록증`과 `{업체명} 통장사본`이 "거래처" 배지와 함께 붙어야 한다.

같은 거래처를 다시 골라도 중복되지 않는지 확인한다.

서류가 없는 업체를 고르면 아무 일도 일어나지 않아야 한다(오류 없음).

직접 파일을 추가해도 정상 동작하는지, 자동 첨부된 것을 X로 지울 수 있는지 확인한다.

- [ ] **Step 5: 영수증 선정 확인**

거래처 자동 첨부 + 직접 올린 파일 1개가 있는 문서를 상신하고 승인한다.

**주의:** 이 검증은 실제 결재 문서와 지출을 만든다. 결재자를 본인으로 두거나 미리 양해를 구하고 진행한다. 승인된 문서는 화면에서 삭제할 수 없어 DB에서 직접 지워야 한다.

승인 후 생성된 지출의 영수증을 확인한다:

```bash
cd "C:/Users/dawoo/ERP 헤르메스/dawoo-erp" && URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL' .env.local | cut -d= -f2- | tr -d '"\r') && KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY' .env.local | cut -d= -f2- | tr -d '"\r') && curl -s "$URL/rest/v1/expenses?select=title,receipt_url&order=created_at.desc&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Expected: `receipt_url`이 직접 올린 파일(`approval/...` 경로)을 가리키고, 거래처 서류(`vendors/...`)가 아니어야 한다

- [ ] **Step 6: 테스트 문서 정리**

Step 5에서 만든 문서와 지출을 지운다. 승인된 문서는 화면에서 삭제되지 않으므로 DB에서 직접 지운다.

- [ ] **Step 7: 커밋 불필요**

검증 전용 태스크다. 문제가 발견되면 해당 태스크로 돌아가 고치고 다시 확인한다.
