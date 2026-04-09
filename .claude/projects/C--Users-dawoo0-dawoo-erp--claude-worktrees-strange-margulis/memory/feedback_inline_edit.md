---
name: Inline edit rule
description: 입력 필드 항상 표시 금지, 읽기 모드 기본 + 클릭 시 인라인 편집
type: feedback
---

입력 필드를 항상 보여주지 않는다. 평소엔 텍스트로 표시하고, 클릭하면 그 자리에서 수정 가능한 인라인 편집 방식.
네모 테두리 input 박스 남발 금지. 읽기 모드가 기본, 편집은 클릭했을 때만.

**Why:** 사장님이 UI에서 input 박스가 항상 노출되는 것을 싫어함. 깔끔한 읽기 뷰 선호.
**How to apply:** 새 페이지 만들 때 상세/편집 뷰는 InlineEdit 컴포넌트(src/components/common/InlineEdit.tsx) 사용. 모달 폼(신규 생성)은 일반 input 유지 가능.
