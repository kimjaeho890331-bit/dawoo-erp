# 공문 자동채우기 PoC — hwpkit

**증명한 것**: 한글(한컴오피스) 없이 **순수 파이썬으로 정부 양식(.hwp/.hwpx)을 채울 수 있다.**

- 라이브러리: [hwpkit](https://hwpkit.ebstar.co/) — MIT, 순수 파이썬, 리눅스/윈도우/컨테이너 (한컴·pywin32·COM·LibreOffice 전부 불필요)
- 검증일: 2026-06-27 / 대상: `2026 수원시 소규모 공동주택 동의서(.hwpx)`
- 결과: 읽기 → `inject_text` 채우기 → 저장 → 재추출 검증 **성공**

## 의미
공문 자동생성을 **Hermes와 같은 리눅스 서버 한 대**에서 처리 가능. 윈도우/한글 워커·변환 단계 불필요.
설계 반영 위치: [`../2026-06-27-hermes-erp-automation-design-v2.md`](../2026-06-27-hermes-erp-automation-design-v2.md) §5.6 (문서 엔진).

## 실행
```bash
pip install hwpkit
python hwpkit_fill_poc.py "양식.hwpx"
```

## hwpkit API 요약 (구현 참고)
- `extract_text_from_hwp(path)` / `extract_text_from_hwpx(path)` — 텍스트 추출
- `HwpFile(path)` / `HwpxFile(path)` — 편집기 (둘 다 동일 API)
  - `paragraphs()` (제너레이터), `paragraph_text(index) -> str`
  - `inject_text(index, text)` — 빈칸 채우기
  - `replace_text(index, text)` — 문단 텍스트 교체
  - `place_image(index, path, width_mm=..)` — 도장/이미지 삽입
  - `save(out_path)`
- `.hwp`(바이너리, OLE2)·`.hwpx`(zip+XML) **동일 API**로 처리

## 남은 확인 (설계 §14)
- `hwpkit`으로 채운 파일을 한글에서 열어 **시각적 충실도** 사람 1회 검수
- 양식별 "index ↔ 필드" 1회 매핑 (복잡 내역서 345셀 포함) — Hermes 의미분석으로 보조
- 수원시 .hwpx/PDF 제출 허용 여부
