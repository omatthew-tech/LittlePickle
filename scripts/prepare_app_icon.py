from __future__ import annotations

import argparse
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageCms, ImageDraw, ImageFilter, ImageFont


IOS_CORNER_RADIUS_RATIO = 0.2237


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Normalize a square app icon and create an iOS mask preview."
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("asset", type=Path)
    parser.add_argument("preview", type=Path)
    return parser.parse_args()


def convert_to_srgb(source: Image.Image) -> tuple[Image.Image, bytes]:
    srgb_profile = ImageCms.createProfile("sRGB")
    srgb_bytes = ImageCms.ImageCmsProfile(srgb_profile).tobytes()
    embedded_profile = source.info.get("icc_profile")

    if embedded_profile:
        converted = ImageCms.profileToProfile(
            source,
            ImageCms.ImageCmsProfile(BytesIO(embedded_profile)),
            srgb_profile,
            outputMode="RGB",
        )
    else:
        converted = source.convert("RGB")

    return converted, srgb_bytes


def ios_mask(size: int) -> Image.Image:
    scale = 4
    mask = Image.new("L", (size * scale, size * scale), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * scale - 1, size * scale - 1),
        radius=round(size * scale * IOS_CORNER_RADIUS_RATIO),
        fill=255,
    )
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def load_font(filename: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_path = Path("C:/Windows/Fonts") / filename
    if font_path.exists():
        return ImageFont.truetype(str(font_path), size)
    return ImageFont.load_default()


def create_preview(icon: Image.Image, srgb_bytes: bytes, preview_path: Path) -> None:
    sheet = Image.new("RGB", (1600, 720), "#EEF1F5")
    draw = ImageDraw.Draw(sheet)
    regular = load_font("segoeui.ttf", 26)
    small = load_font("segoeui.ttf", 21)
    title = load_font("seguisb.ttf", 42)

    draw.text(
        (72, 48),
        "LittlePickle app icon · iOS mask preview",
        fill="#15233B",
        font=title,
    )
    draw.text(
        (74, 108),
        "Preview mask only — the shipping 1024×1024 PNG remains square and fully opaque.",
        fill="#53627A",
        font=regular,
    )

    sizes = [256, 180, 120, 60, 40, 29]
    centers = [188, 500, 760, 980, 1170, 1350]
    baseline = 450

    for size, center_x in zip(sizes, centers):
        mask = ios_mask(size)
        preview_icon = icon.resize((size, size), Image.Resampling.LANCZOS)
        left = center_x - size // 2
        top = baseline - size

        shadow_mask = Image.new("L", (size + 40, size + 40), 0)
        shadow_mask.paste(mask, (20, 16))
        shadow_mask = shadow_mask.filter(
            ImageFilter.GaussianBlur(max(2, size // 28))
        )
        shadow_alpha = shadow_mask.point(lambda value: round(value * 0.24))
        shadow = Image.new("RGBA", shadow_mask.size, "#1F314E")
        shadow.putalpha(shadow_alpha)
        sheet.paste(shadow, (left - 20, top - 12), shadow)
        sheet.paste(preview_icon, (left, top), mask)

        label = f"{size} px"
        label_box = draw.textbbox((0, 0), label, font=small)
        label_width = label_box[2] - label_box[0]
        draw.text(
            (center_x - label_width / 2, 486),
            label,
            fill="#33435C",
            font=small,
        )

    draw.rounded_rectangle((70, 575, 1530, 665), radius=24, fill="#16233A")
    draw.text((102, 601), "Small-size check", fill="#FFFFFF", font=regular)

    for size, left in zip([60, 40, 29], [520, 700, 850]):
        preview_icon = icon.resize((size, size), Image.Resampling.LANCZOS)
        sheet.paste(
            preview_icon,
            (left, 590 + (60 - size) // 2),
            ios_mask(size),
        )

    draw.text(
        (980, 604),
        "Subjects remain clear; no edge clipping",
        fill="#DCE5F5",
        font=small,
    )
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(
        preview_path,
        format="PNG",
        optimize=True,
        compress_level=9,
        icc_profile=srgb_bytes,
    )


def main() -> None:
    args = parse_args()
    with Image.open(args.source) as source:
        source.load()
        converted, srgb_bytes = convert_to_srgb(source)

    icon = converted.resize((1024, 1024), Image.Resampling.LANCZOS)
    args.asset.parent.mkdir(parents=True, exist_ok=True)
    icon.save(
        args.asset,
        format="PNG",
        optimize=True,
        compress_level=9,
        icc_profile=srgb_bytes,
    )
    create_preview(icon, srgb_bytes, args.preview)

    with Image.open(args.asset) as verified:
        verified.load()
        if verified.size != (1024, 1024):
            raise ValueError(f"Expected 1024×1024, got {verified.size}")
        if verified.mode != "RGB" or "A" in verified.getbands():
            raise ValueError(
                f"Expected opaque RGB output, got mode {verified.mode}"
            )
        if not verified.info.get("icc_profile"):
            raise ValueError("Expected an embedded sRGB color profile")

        print(
            {
                "asset": str(args.asset.resolve()),
                "size": verified.size,
                "mode": verified.mode,
                "has_alpha": "A" in verified.getbands(),
                "icc_profile_bytes": len(verified.info["icc_profile"]),
                "preview": str(args.preview.resolve()),
            }
        )


if __name__ == "__main__":
    main()
