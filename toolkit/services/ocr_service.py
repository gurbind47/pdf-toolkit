from io import BytesIO

import fitz
import pypdfium2 as pdfium

from .text_extraction_service import run_tesseract_tsv

OCR_SCALE = 300 / 72.0  # render at 300 DPI for recognition quality


def ocr_pdf(pdf_path, lang="eng", force=False):
    """Add an invisible, searchable text layer to scanned pages.

    Keeps the original page content untouched (no rasterizing); words are
    inserted with render_mode=3 (invisible) at their recognized positions.
    Returns (BytesIO, pages_ocred).
    """
    doc = fitz.open(pdf_path)
    pdf = pdfium.PdfDocument(pdf_path)
    try:
        ocred = 0
        for index, page in enumerate(doc):
            if not force and len(page.get_text().strip()) > 20:
                continue

            image = pdf[index].render(scale=OCR_SCALE).to_pil()
            words = run_tesseract_tsv(image, lang=lang)
            if not words:
                continue

            ocred += 1
            for word in words:
                x0 = word["left"] / OCR_SCALE
                top = word["top"] / OCR_SCALE
                height = word["height"] / OCR_SCALE
                baseline = top + height * 0.8
                fontsize = max(4.0, height * 0.9)
                page.insert_text(
                    (x0, baseline),
                    word["text"],
                    fontsize=fontsize,
                    fontname="helv",
                    render_mode=3,
                )

        if ocred == 0:
            raise ValueError(
                "Every page already has a text layer — nothing to OCR. "
                "Check 'Force OCR all pages' to redo them anyway."
            )

        return BytesIO(doc.tobytes(garbage=3, deflate=True)), ocred
    finally:
        pdf.close()
        doc.close()
