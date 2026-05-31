from __future__ import annotations

import csv
import os
import subprocess
import tempfile
from typing import Any

import fitz
import pypdfium2 as pdfium


FONT_MAP = {
    "helvetica": "Helvetica",
    "arial": "Helvetica",
    "sans": "Helvetica",
    "times": "Times-Roman",
    "serif": "Times-Roman",
    "courier": "Courier",
    "mono": "Courier",
}


def _map_font_name(font_name: str | None) -> str:
    if not font_name:
        return "Helvetica"

    lowered = font_name.lower()
    base_name = "Helvetica"
    if "courier" in lowered:
        base_name = "Courier"
    elif "times" in lowered or "serif" in lowered:
        base_name = "Times-Roman"
    elif "helvetica" in lowered or "arial" in lowered:
        base_name = "Helvetica"

    suffix = ""
    if "bold" in lowered:
        suffix = "-Bold"
    elif "italic" in lowered or "oblique" in lowered:
        suffix = "-Oblique" if base_name == "Helvetica" else "-Italic"

    if base_name == "Times-Roman" and suffix == "-Italic":
        return "Times-Italic"
    if base_name == "Times-Roman" and suffix == "-Bold":
        return "Times-Bold"
    if base_name == "Courier" and suffix == "-Italic":
        return "Courier-Oblique"
    if base_name == "Courier" and suffix == "-Bold":
        return "Courier-Bold"
    if base_name == "Helvetica" and suffix == "-Italic":
        return "Helvetica-Oblique"
    if base_name == "Helvetica" and suffix == "-Bold":
        return "Helvetica-Bold"

    return base_name


def _normalize_box(bbox: list[float] | tuple[float, float, float, float], page_width: float, page_height: float) -> dict[str, float]:
    x0, y0, x1, y1 = bbox
    return {
        "x_pct": max(0.0, min(100.0, (x0 / page_width) * 100.0)),
        "y_pct": max(0.0, min(100.0, (y0 / page_height) * 100.0)),
        "width_pct": max(0.1, min(100.0, ((x1 - x0) / page_width) * 100.0)),
        "height_pct": max(0.1, min(100.0, ((y1 - y0) / page_height) * 100.0)),
    }


def _ocr_page(pdf_path: str, page_index: int) -> list[dict[str, Any]]:
    pdf = pdfium.PdfDocument(pdf_path)
    page = pdf[page_index]
    page_width = float(page.get_width())
    page_height = float(page.get_height())
    image = page.render(scale=2.0).to_pil()

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_image:
        image.save(tmp_image.name)
        image_path = tmp_image.name

    try:
        proc = subprocess.run(
            ["tesseract", image_path, "stdout", "--psm", "6", "tsv"],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError:
        return []
    finally:
        try:
            os.remove(image_path)
        except Exception:
            pass
        pdf.close()

    items: list[dict[str, Any]] = []
    reader = csv.DictReader(proc.stdout.splitlines(), delimiter="\t")
    for row in reader:
        text = (row.get("text") or "").strip()
        if not text:
            continue
        try:
            conf = float(row.get("conf") or 0)
        except ValueError:
            conf = 0.0
        if conf < 35:
            continue

        left = float(row.get("left") or 0) / 2.0
        top = float(row.get("top") or 0) / 2.0
        width = float(row.get("width") or 0) / 2.0
        height = float(row.get("height") or 0) / 2.0
        items.append({
            "text": text,
            "font_family": "Helvetica",
            "font_size": max(8.0, height * 0.9),
            "source": "ocr",
            "confidence": conf,
            **_normalize_box((left, top, left + width, top + height), page_width, page_height),
        })

    return items


def extract_text_items(pdf_path: str, max_pages: int = 100) -> list[list[dict[str, Any]]]:
    doc = fitz.open(pdf_path)
    pages: list[list[dict[str, Any]]] = []

    try:
        for page_index, page in enumerate(doc):
            if page_index >= max_pages:
                break

            width = float(page.rect.width) or 1.0
            height = float(page.rect.height) or 1.0
            text_items: list[dict[str, Any]] = []

            page_dict = page.get_text("dict")
            for block in page_dict.get("blocks", []):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = (span.get("text") or "").strip()
                        if not text:
                            continue
                        bbox = span.get("bbox")
                        if not bbox:
                            continue
                        text_items.append({
                            "text": text,
                            "font_family": _map_font_name(span.get("font")),
                            "font_size": float(span.get("size") or 12),
                            "source": "text-layer",
                            "confidence": 100,
                            **_normalize_box(bbox, width, height),
                        })

            if not text_items:
                text_items = _ocr_page(pdf_path, page_index)

            pages.append(text_items)
    finally:
        doc.close()

    return pages