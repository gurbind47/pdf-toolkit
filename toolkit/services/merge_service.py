import os
from io import BytesIO
from pypdf import PdfWriter, PdfReader
from ..config import IMAGE_EXTS, DOC_EXTS
from ..utils.pdf_helpers import resize_page_to_letter, image_to_pdf_bytes


def merge_files(file_paths):
    """Merge multiple files (PDF, images, docs) into one PDF. Returns BytesIO."""
    from .convert_service import convert_to_pdf

    writer = PdfWriter()

    for fpath in file_paths:
        ext = os.path.splitext(fpath)[1].lower()

        if ext == ".pdf":
            reader = PdfReader(fpath)
            for page in reader.pages:
                resize_page_to_letter(page)
                writer.add_page(page)

        elif ext in IMAGE_EXTS:
            pdf_buf = image_to_pdf_bytes(fpath)
            reader = PdfReader(pdf_buf)
            for page in reader.pages:
                writer.add_page(page)

        elif ext in DOC_EXTS:
            pdf_buf = convert_to_pdf(fpath)
            reader = PdfReader(pdf_buf)
            for page in reader.pages:
                resize_page_to_letter(page)
                writer.add_page(page)

    output = BytesIO()
    writer.write(output)
    output.seek(0)
    return output
