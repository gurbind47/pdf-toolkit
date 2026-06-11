from io import BytesIO

import fitz

REDACT_INSET = 0.3  # keep neighboring glyphs out of the redaction rect
MIN_FONT_SIZE = 6.0


def _hex_to_rgb(value):
    value = (value or "#111111").lstrip("#")
    try:
        return tuple(int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    except (ValueError, IndexError):
        return (0.07, 0.07, 0.07)


def _edit_rect(edit, pw, ph, inset=REDACT_INSET):
    x0 = float(edit["x_pct"]) / 100.0 * pw
    y0 = float(edit["y_pct"]) / 100.0 * ph
    x1 = x0 + float(edit["width_pct"]) / 100.0 * pw
    y1 = y0 + float(edit["height_pct"]) / 100.0 * ph
    return fitz.Rect(x0 + inset, y0 + inset, x1 - inset, y1 - inset)


def _check_renderable(text):
    try:
        text.encode("latin-1")
    except UnicodeEncodeError:
        raise ValueError(
            f"'{text}' contains characters the standard PDF fonts cannot render "
            "(only Latin text is supported for replacements right now). "
            "Remove that edit or use Latin characters."
        )


def _insert_replacement(page, edit, pw, ph):
    text = edit["new_text"]
    _check_renderable(text)

    fontname = edit.get("font") or "helv"
    fontsize = float(edit.get("size") or 11)
    color = _hex_to_rgb(edit.get("color"))
    origin = fitz.Point(
        float(edit["origin_x_pct"]) / 100.0 * pw,
        float(edit["origin_y_pct"]) / 100.0 * ph,
    )

    # Shrink to fit the original span width when the new text runs long.
    width_budget = float(edit["width_pct"]) / 100.0 * pw
    new_width = fitz.get_text_length(text, fontname=fontname, fontsize=fontsize)
    if width_budget > 0 and new_width > width_budget * 1.15:
        fontsize = max(MIN_FONT_SIZE, fontsize * width_budget / new_width)

    page.insert_text(origin, text, fontname=fontname, fontsize=fontsize, color=color)


def apply_text_edits(pdf_path, edits):
    """Remove original spans via redaction annotations, then insert
    replacement text at the stored baselines. Returns BytesIO."""
    doc = fitz.open(pdf_path)
    try:
        by_page = {}
        for edit in edits:
            by_page.setdefault(int(edit["page"]), []).append(edit)

        for page_num, page_edits in by_page.items():
            if not 1 <= page_num <= doc.page_count:
                continue
            page = doc[page_num - 1]
            pw = float(page.rect.width) or 1.0
            ph = float(page.rect.height) or 1.0

            text_layer = [e for e in page_edits if e.get("source") != "ocr"]
            ocr_spans = [e for e in page_edits if e.get("source") == "ocr"]

            if text_layer:
                for edit in text_layer:
                    page.add_redact_annot(_edit_rect(edit, pw, ph))
                # graphics= is essential: without PDF_REDACT_LINE_ART_NONE the
                # redaction also deletes underlines/table rules below the text.
                page.apply_redactions(
                    images=fitz.PDF_REDACT_IMAGE_NONE,
                    graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                    text=fitz.PDF_REDACT_TEXT_REMOVE,
                )

            if ocr_spans:
                # Scanned pages: paint the pixels white where the word was.
                for edit in ocr_spans:
                    page.add_redact_annot(_edit_rect(edit, pw, ph, inset=-0.5), fill=(1, 1, 1))
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)

            for edit in page_edits:
                if edit.get("delete"):
                    continue
                new_text = (edit.get("new_text") or "").strip()
                if not new_text:
                    continue
                _insert_replacement(page, edit, pw, ph)

        return BytesIO(doc.tobytes(garbage=3, deflate=True))
    finally:
        doc.close()
