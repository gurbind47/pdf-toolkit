from io import BytesIO

import fitz

from .split_service import parse_page_ranges


def crop_pdf(pdf_path, mode="margins", margins=None, rect_pct=None, pages_str=""):
    """Crop pages via margins (points) or a percentage rectangle. Returns BytesIO."""
    doc = fitz.open(pdf_path)
    try:
        total = doc.page_count
        if pages_str.strip():
            targets = {p + 1 for p in parse_page_ranges(pages_str, total)}
        else:
            targets = set(range(1, total + 1))

        for index, page in enumerate(doc):
            if index + 1 not in targets:
                continue

            rect = page.rect  # display (rotation-aware) space
            if mode == "rect" and rect_pct:
                new = fitz.Rect(
                    rect.x0 + rect.width * float(rect_pct.get("x", 0)) / 100.0,
                    rect.y0 + rect.height * float(rect_pct.get("y", 0)) / 100.0,
                    rect.x0 + rect.width * (float(rect_pct.get("x", 0)) + float(rect_pct.get("w", 100))) / 100.0,
                    rect.y0 + rect.height * (float(rect_pct.get("y", 0)) + float(rect_pct.get("h", 100))) / 100.0,
                )
            else:
                m = margins or {}
                new = fitz.Rect(
                    rect.x0 + float(m.get("left", 0)),
                    rect.y0 + float(m.get("top", 0)),
                    rect.x1 - float(m.get("right", 0)),
                    rect.y1 - float(m.get("bottom", 0)),
                )

            if new.is_empty or new.width < 10 or new.height < 10:
                raise ValueError(f"Crop region too small on page {index + 1}")

            # set_cropbox expects unrotated coordinates.
            if page.rotation:
                new = new * page.derotation_matrix
                new.normalize()
            new.intersect(page.mediabox)
            page.set_cropbox(new)

        return BytesIO(doc.tobytes(garbage=3, deflate=True))
    finally:
        doc.close()
