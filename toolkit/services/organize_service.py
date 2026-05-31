from io import BytesIO
from pypdf import PdfReader, PdfWriter


def organize_pdf(pdf_path, operations):
    """
    Apply operations to a PDF. Operations is a list of dicts:
    - {"type": "reorder", "page_order": [3,1,2]}  (1-based)
    - {"type": "delete", "pages": [2,4]}           (1-based)
    - {"type": "rotate", "pages": [1,3], "angle": 90}
    Returns BytesIO.
    """
    reader = PdfReader(pdf_path)
    pages = list(reader.pages)

    for op in operations:
        op_type = op.get("type")

        if op_type == "reorder":
            order = op["page_order"]
            pages = [pages[i - 1] for i in order if 1 <= i <= len(pages)]

        elif op_type == "delete":
            delete_set = set(op["pages"])
            pages = [p for i, p in enumerate(pages, 1) if i not in delete_set]

        elif op_type == "rotate":
            angle = op.get("angle", 90)
            rotate_set = set(op["pages"])
            for i, p in enumerate(pages):
                if (i + 1) in rotate_set:
                    p.rotate(angle)

    writer = PdfWriter()
    for page in pages:
        writer.add_page(page)

    buf = BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf
