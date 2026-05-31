from io import BytesIO
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas


POSITIONS = {
    "bottom-left": lambda w, h: (36, 20),
    "bottom-center": lambda w, h: (w / 2, 20),
    "bottom-right": lambda w, h: (w - 36, 20),
    "top-left": lambda w, h: (36, h - 20),
    "top-center": lambda w, h: (w / 2, h - 20),
    "top-right": lambda w, h: (w - 36, h - 20),
}


def add_page_numbers(pdf_path, config):
    """
    Add page numbers. Config:
    {
        "position": "bottom-center",
        "format": "Page {n} of {total}",
        "font_size": 10,
        "start_page": 1,
        "skip_first": false
    }
    Returns BytesIO.
    """
    reader = PdfReader(pdf_path)
    writer = PdfWriter()

    position = config.get("position", "bottom-center")
    fmt = config.get("format", "Page {n} of {total}")
    font_size = config.get("font_size", 10)
    start_page = config.get("start_page", 1)
    skip_first = config.get("skip_first", False)
    total = len(reader.pages)

    pos_fn = POSITIONS.get(position, POSITIONS["bottom-center"])

    for i, page in enumerate(reader.pages):
        page_num = i + start_page

        if skip_first and i == 0:
            writer.add_page(page)
            continue

        width = float(page.mediabox.width)
        height = float(page.mediabox.height)

        overlay_buf = BytesIO()
        c = canvas.Canvas(overlay_buf, pagesize=(width, height))
        c.setFont("Helvetica", font_size)
        c.setFillColorRGB(0.3, 0.3, 0.3)

        text = fmt.replace("{n}", str(page_num)).replace("{total}", str(total))
        x, y = pos_fn(width, height)
        c.drawCentredString(x, y, text)
        c.save()
        overlay_buf.seek(0)

        overlay_page = PdfReader(overlay_buf).pages[0]
        page.merge_page(overlay_page)
        writer.add_page(page)

    buf = BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf
