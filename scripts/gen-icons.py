"""앱 아이콘 생성 — Sidebar 로고(터라코타 라운드 사각형 + 흰색 D)를 PNG로 래스터화.

재생성: python scripts/gen-icons.py
Pillow 필요. 결과물은 public/ 아래에 쓴다.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ACCENT = "#c96442"
WHITE = "#ffffff"
OUT = Path(__file__).resolve().parent.parent / "public"

# 글자를 그릴 때 쓸 굵은 산세리프 후보. 없으면 기본 폰트로 떨어진다.
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def draw_letter(img: Image.Image, box: int, glyph_ratio: float) -> None:
    """중앙에 흰색 D를 그린다. glyph_ratio는 캔버스 대비 글자 크기 비율."""
    draw = ImageDraw.Draw(img)
    font = load_font(int(box * glyph_ratio))
    left, top, right, bottom = draw.textbbox((0, 0), "D", font=font)
    draw.text(
        ((box - (right - left)) / 2 - left, (box - (bottom - top)) / 2 - top),
        "D",
        font=font,
        fill=WHITE,
    )


def rounded_icon(size: int, radius_ratio: float = 0.22) -> Image.Image:
    """모서리가 둥근 아이콘. 바깥은 투명."""
    scale = 4  # 안티에일리어싱용 초과 샘플링
    box = size * scale
    img = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle(
        (0, 0, box - 1, box - 1), radius=int(box * radius_ratio), fill=ACCENT
    )
    draw_letter(img, box, 0.5)
    return img.resize((size, size), Image.LANCZOS)


def maskable_icon(size: int) -> Image.Image:
    """maskable용. 안드로이드가 원형/스퀘어클로 잘라내므로 배경을 가장자리까지
    꽉 채우고, 글자는 중앙 안전영역(80%) 안에 작게 둔다."""
    scale = 4
    box = size * scale
    img = Image.new("RGBA", (box, box), ACCENT)
    draw_letter(img, box, 0.36)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = [
        ("icon-192.png", rounded_icon(192)),
        ("icon-512.png", rounded_icon(512)),
        ("icon-maskable-512.png", maskable_icon(512)),
        ("apple-touch-icon.png", rounded_icon(180)),
    ]
    for name, image in targets:
        path = OUT / name
        image.save(path, "PNG")
        print(f"wrote {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
