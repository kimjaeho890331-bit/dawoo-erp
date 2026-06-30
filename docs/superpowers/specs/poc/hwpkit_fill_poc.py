"""hwpkit 폼필드 자동채우기 PoC — 한글(한컴) 없이 순수 파이썬으로 HWP/HWPX 양식 채우기.

검증(2026-06-27): 실제 수원시 소규모 공동주택 동의서(.hwpx)를 한글 프로그램 없이
읽기 -> inject_text 채우기 -> 저장 -> 재확인 성공.

설치:  pip install hwpkit
실행:  python hwpkit_fill_poc.py "경로/양식.hwpx"
"""
import sys
import os
import hwpkit


def main(path: str) -> None:
    ext = os.path.splitext(path)[1].lower()
    is_hwpx = ext == ".hwpx"
    Doc = hwpkit.HwpxFile if is_hwpx else hwpkit.HwpFile
    extract = hwpkit.extract_text_from_hwpx if is_hwpx else hwpkit.extract_text_from_hwp

    print("== 읽기:", os.path.basename(path))
    print(extract(path)[:400])

    doc = Doc(path)
    paras = list(doc.paragraphs())
    print("== 문단 수:", len(paras))

    # 표의 빈 칸에 샘플 데이터 주입 (실제 구현에선 ERP 데이터 -> index 매핑)
    samples = ["101동 502호", "홍길동", "○ 동의(서명)"]
    si = 0
    for i in range(len(paras)):
        try:
            empty = (doc.paragraph_text(i) or "").strip() == ""
        except Exception:
            empty = False
        if empty and i > 12 and si < len(samples):
            doc.inject_text(i, samples[si])
            si += 1

    out = os.path.splitext(path)[0] + "_filled" + ext
    doc.save(out)
    ok = "홍길동" in extract(out)
    print("== 저장:", out)
    print("== 채움 검증 ('홍길동' 포함):", ok)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
