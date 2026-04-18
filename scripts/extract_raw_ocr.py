#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT
RAW_DIR = ROOT / "data" / "raw_ocr"
DEBUG_DIR = ROOT / "assets" / "debug"


@dataclass(frozen=True)
class FieldSpec:
    name: str
    box: tuple[float, float, float, float]
    psm: int = 7
    whitelist: str | None = None
    invert: bool = False
    scale: int = 2


FIELDS: list[FieldSpec] = [
    FieldSpec("chip", (0.08, 0.08, 0.40, 0.15), whitelist="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/-"),
    FieldSpec("date", (0.56, 0.08, 0.83, 0.14), whitelist="0123456789/"),
    FieldSpec("capture_time", (0.56, 0.13, 0.84, 0.18), whitelist="0123456789:"),
    FieldSpec(
        "new_logger",
        (0.08, 0.15, 0.57, 0.21),
        psm=6,
        whitelist="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ/- ",
        scale=3,
    ),
    FieldSpec("handler", (0.63, 0.17, 0.90, 0.22), whitelist="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ "),
    FieldSpec("collar", (0.12, 0.13, 0.50, 0.18), whitelist="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ>/- "),
    FieldSpec("site_group_location", (0.07, 0.20, 0.95, 0.27), psm=6),
    FieldSpec("sex_age", (0.07, 0.25, 0.62, 0.31), whitelist="MFJP/A?() "),
    FieldSpec("anesthesia", (0.10, 0.36, 0.93, 0.44), psm=6),
    FieldSpec("weight", (0.10, 0.41, 0.52, 0.48), whitelist="0123456789.,-=()bagkgo "),
    FieldSpec("body_girth", (0.58, 0.41, 0.93, 0.48), whitelist="0123456789.cm "),
    FieldSpec("head_tail_length", (0.10, 0.46, 0.52, 0.53), whitelist="0123456789.cm "),
    FieldSpec("head_diameter", (0.10, 0.51, 0.52, 0.58), whitelist="0123456789.mm "),
    FieldSpec("fur_coverage", (0.58, 0.51, 0.93, 0.58), whitelist="0123456789.% "),
    FieldSpec("activity", (0.10, 0.55, 0.93, 0.63), psm=6),
    FieldSpec("earring", (0.62, 0.59, 0.93, 0.69), whitelist="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ/-_ "),
    FieldSpec("collected", (0.10, 0.62, 0.45, 0.78), psm=6),
    FieldSpec("recognizable_marks", (0.10, 0.75, 0.93, 0.86), psm=6),
    FieldSpec("comments", (0.06, 0.82, 0.96, 0.97), psm=6),
]


def run_tesseract(image_path: Path, spec: FieldSpec) -> str:
    cmd = ["tesseract", str(image_path), "stdout", "--psm", str(spec.psm)]
    if spec.whitelist:
        cmd.extend(["-c", f"tessedit_char_whitelist={spec.whitelist}"])
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    return " ".join(result.stdout.split())


def prepare_crop(image: Image.Image, spec: FieldSpec, debug_path: Path) -> str:
    width, height = image.size
    left = int(spec.box[0] * width)
    top = int(spec.box[1] * height)
    right = int(spec.box[2] * width)
    bottom = int(spec.box[3] * height)

    crop = image.crop((left, top, right, bottom)).convert("L")
    crop = ImageOps.autocontrast(crop)
    crop = crop.filter(ImageFilter.MedianFilter(size=3))
    crop = ImageEnhance.Contrast(crop).enhance(2.4)
    if spec.invert:
        crop = ImageOps.invert(crop)
    if spec.scale > 1:
        crop = crop.resize((crop.width * spec.scale, crop.height * spec.scale))
    crop.save(debug_path)
    return run_tesseract(debug_path, spec)


def render_contact_sheet(field_name: str, crop_paths: list[tuple[str, Path]]) -> None:
    if not crop_paths:
        return

    crops = [(label, Image.open(path).convert("RGB")) for label, path in crop_paths]
    max_width = max(image.width for _, image in crops)
    max_height = max(image.height for _, image in crops)
    cols = 2
    rows = math.ceil(len(crops) / cols)
    label_height = 34
    padding = 16
    sheet = Image.new(
        "RGB",
        (
            cols * max_width + (cols + 1) * padding,
            rows * (max_height + label_height) + (rows + 1) * padding,
        ),
        "white",
    )
    draw = ImageDraw.Draw(sheet)

    for idx, (label, crop) in enumerate(crops):
        row = idx // cols
        col = idx % cols
        x = padding + col * (max_width + padding)
        y = padding + row * (max_height + label_height + padding)
        draw.text((x, y), label, fill="black")
        sheet.paste(crop, (x, y + label_height))

    sheet.save(DEBUG_DIR / f"{field_name}_contact_sheet.png")


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)

    per_field_debug: dict[str, list[tuple[str, Path]]] = {spec.name: [] for spec in FIELDS}

    for image_path in sorted(IMAGE_DIR.glob("*.jpg")):
        image = Image.open(image_path)
        record = {
            "image": image_path.name,
            "full_page_ocr": subprocess.run(
                ["tesseract", str(image_path), "stdout", "--psm", "6"],
                capture_output=True,
                text=True,
                check=False,
            ).stdout,
            "fields": {},
        }

        stem_dir = DEBUG_DIR / image_path.stem
        stem_dir.mkdir(exist_ok=True)

        for spec in FIELDS:
            debug_path = stem_dir / f"{spec.name}.png"
            text = prepare_crop(image, spec, debug_path)
            record["fields"][spec.name] = text
            per_field_debug[spec.name].append((image_path.stem, debug_path))

        (RAW_DIR / f"{image_path.stem}.json").write_text(
            json.dumps(record, indent=2, ensure_ascii=True)
        )

    for field_name, crop_paths in per_field_debug.items():
        render_contact_sheet(field_name, crop_paths)


if __name__ == "__main__":
    main()
