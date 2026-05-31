import math
from io import BytesIO
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor


def add_watermark(pdf_path, config):
    """
    Add watermark to PDF. Config:
    {
        "text": "CONFIDENTIAL",
        "font_size": 60,
        "color": "#cccccc",
        "opacity": 0.3,
        "angle": 45,
        "position": "center"
    }
    Returns BytesIO.
    """
    reader = PdfReader(pdf_path)
    writer = PdfWriter()

    text = config.get("text", "WATERMARK")
    font_size = config.get("font_size", 60)
    color = config.get("color", "#cccccc")
    opacity = config.get("opacity", 0.3)
    angle = config.get("angle", 45)

    for page in reader.pages:
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)

        watermark_buf = BytesIO()
        c = canvas.Canvas(watermark_buf, pagesize=(width, height))

        c.saveState()
        c.setFillColor(HexColor(color))
        c.setFillAlpha(opacity)
        c.setFont("Helvetica-Bold", font_size)

        # Center and rotate
        c.translate(width / 2, height / 2)
        c.rotate(angle)
        c.drawCentredString(0, 0, text)

        c.restoreState()
        c.save()
        watermark_buf.seek(0)

        watermark_page = PdfReader(watermark_buf).pages[0]
        page.merge_page(watermark_page)
        writer.add_page(page)

    buf = BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf
