from io import BytesIO

import fitz
from pypdf import PdfReader, PdfWriter


def repair_pdf(pdf_path):
    """Rebuild a damaged PDF. Returns (BytesIO, strategy)."""
    try:
        doc = fitz.open(pdf_path)
        try:
            if doc.page_count == 0:
                raise ValueError("No pages found")
            return BytesIO(doc.tobytes(garbage=4, clean=True, deflate=True)), "rebuilt"
        finally:
            doc.close()
    except Exception:
        pass

    reader = PdfReader(pdf_path, strict=False)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    buf = BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf, "rewritten"
