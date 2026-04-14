# design-lint

> 디자인 규칙 위반(이모지, 아이콘, 색상 토큰) 검사

## 트리거 조건
- "디자인 검사", "디자인 규칙", "디자인 린트" 등의 요청
- UI 컴포넌트 수정 후 검증 시

## 허용 도구
Read, Grep, Glob

## 기준
- `docs/DESIGN.md` — 디자인 시스템 전체 규칙
- `CLAUDE.md` "공통 UI 규칙" 섹션

## 검사 항목

### 1. 이모지/이모티콘 검출
- `src/components/**/*.tsx` 에서 유니코드 이모지 패턴 검색
- HTML 엔티티 이모지도 포함 (`&#x1F4DE;` 등)
- 허용 예외: 없음 (이모지 사용 완전 금지)

```bash
# 검색 패턴 (Grep 사용)
[\x{1F600}-\x{1F64F}\x{1F300}-\x{1F5FF}\x{1F680}-\x{1F6FF}\x{1F1E0}-\x{1F1FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]
```

### 2. 아이콘 라이브러리 검사
- `lucide-react` 외 아이콘 라이브러리 import 검출
- 금지: `react-icons`, `@heroicons`, `@mui/icons-material`, `font-awesome` 등

```bash
# 검색 패턴
import.*from ['"](?!lucide-react)(react-icons|@heroicons|@mui/icons|font-awesome)
```

### 3. 하드코딩 색상 검출
- `className` 내 `#` 으로 시작하는 hex 컬러 검출
- `style` 속성 내 직접 색상값 검출
- 디자인 토큰(`text-primary`, `bg-surface` 등) 사용 강제

### 4. 아이콘 색상 검사
- Lucide 아이콘에 `text-tertiary` 외 색상 클래스 적용된 경우 검출
- 규칙: 아이콘 색은 `text-tertiary` 단색 통일

### 5. 결과 보고
```
위반 항목 | 파일 | 줄 | 내용 | 수정 제안
---------|------|-----|------|--------
이모지    | Button.tsx | 42 | 📞 전화 | Lucide Phone 아이콘으로 교체
색상 토큰 | Card.tsx | 18 | #ff0000 | text-danger 사용
```

## 주의사항
- 자동 수정은 하지 않음 — 보고만 (사용자가 확인 후 수정)
- `globals.css` 내 디자인 토큰 정의는 검사 대상 아님
- `tailwind.config` 관련 설정도 제외
