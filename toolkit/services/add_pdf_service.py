from collections import defaultdict
from io import BytesIO
import base64

from PIL import Image, ImageDraw
import pypdfium2 as pdfium
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from .organize_service import organize_pdf

STANDARD_FONTS = {
    "Helvetica": "Helvetica",
    "Helvetica-Bold": "Helvetica-Bold",
    "Helvetica-Oblique": "Helvetica-Oblique",
    "Times-Roman": "Times-Roman",
    "Times-Bold": "Times-Bold",
    "Times-Italic": "Times-Italic",
    "Courier": "Courier",
    "Courier-Bold": "Courier-Bold",
    "Courier-Oblique": "Courier-Oblique",
}


def _decode_data_url(data_url):
    if not data_url:
        return None
    if ";base64," not in data_url:
        return None
    _, encoded = data_url.split(",", 1)
    return base64.b64decode(encoded)


def _resolve_reader(pdf_path, page_operations):
    if page_operations:
        result = organize_pdf(pdf_path, page_operations)
        pdf_bytes = result.getvalue()
        return PdfReader(BytesIO(pdf_bytes)), pdf_bytes
    return PdfReader(pdf_path), None


def _to_float(value, fallback=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _draw_text(c, page_width, page_height, element):
    font_name = STANDARD_FONTS.get(element.get("font_family", "Helvetica"), "Helvetica")
    font_size = _to_float(element.get("font_size"), 12)
    color = element.get("color", "#111111")
    align = element.get("align", "left")
    x_pct = _to_float(element.get("x_pct"), 0)
    y_pct = _to_float(element.get("y_pct"), 0)

    x = page_width * (x_pct / 100.0)
    y = page_height - (page_height * (y_pct / 100.0))
    y -= font_size * 0.25

    c.saveState()
    c.setFont(font_name, font_size)
    c.setFillColor(HexColor(color))

    text = str(element.get("text", ""))
    if align == "center":
        c.drawCentredString(x, y, text)
    elif align == "right":
        c.drawRightString(x, y, text)
    else:
        c.drawString(x, y, text)

    c.restoreState()


def _draw_image(c, page_width, page_height, element):
    image_data = _decode_data_url(element.get("data_url"))
    if not image_data:
        return

    image = Image.open(BytesIO(image_data))
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA")

    x_pct = _to_float(element.get("x_pct"), 0)
    y_pct = _to_float(element.get("y_pct"), 0)
    width_pct = max(_to_float(element.get("width_pct"), 20), 1)
    height_pct = max(_to_float(element.get("height_pct"), 10), 1)

    x = page_width * (x_pct / 100.0)
    y_top = page_height - (page_height * (y_pct / 100.0))
    box_width = page_width * (width_pct / 100.0)
    box_height = page_height * (height_pct / 100.0)
    y = y_top - box_height

    c.saveState()
    c.drawImage(ImageReader(image), x, y, width=box_width, height=box_height, mask="auto", preserveAspectRatio=True, anchor="sw")
    c.restoreState()


def _draw_redaction(c, page_width, page_height, element):
    x_pct = _to_float(element.get("x_pct"), 0)
    y_pct = _to_float(element.get("y_pct"), 0)
    width_pct = max(_to_float(element.get("width_pct"), 20), 1)
    height_pct = max(_to_float(element.get("height_pct"), 8), 1)
    fill = element.get("fill", "#ffffff")

    x = page_width * (x_pct / 100.0)
    y_top = page_height - (page_height * (y_pct / 100.0))
    box_width = page_width * (width_pct / 100.0)
    box_height = page_height * (height_pct / 100.0)
    y = y_top - box_height

    c.saveState()
    c.setFillColor(HexColor(fill))
    c.rect(x, y, box_width, box_height, fill=1, stroke=0)
    c.restoreState()


def _hex_to_rgb(color):
    if not color:
        return (255, 255, 255)
    value = color.lstrip("#")
    if len(value) == 3:
        value = "".join([ch * 2 for ch in value])
    try:
        return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return (255, 255, 255)


def _rasterize_redactions(pdf_doc, page_index, redactions, scale=2.0):
    page = pdf_doc[page_index]
    page_width = float(page.get_width())
    page_height = float(page.get_height())
    bitmap = page.render(scale=scale)
    image = bitmap.to_pil()
    draw = ImageDraw.Draw(image)

    for element in redactions:
        x_pct = _to_float(element.get("x_pct"), 0)
        y_pct = _to_float(element.get("y_pct"), 0)
        width_pct = max(_to_float(element.get("width_pct"), 20), 1)
        height_pct = max(_to_float(element.get("height_pct"), 8), 1)
        fill = _hex_to_rgb(element.get("fill", "#000000"))

        x = (page_width * (x_pct / 100.0)) * scale
        y = (page_height * (y_pct / 100.0)) * scale
        box_width = (page_width * (width_pct / 100.0)) * scale
        box_height = (page_height * (height_pct / 100.0)) * scale
        draw.rectangle([x, y, x + box_width, y + box_height], fill=fill)

    img_buf = BytesIO()
    image.save(img_buf, format="PNG")
    img_buf.seek(0)

    overlay_buf = BytesIO()
    c = canvas.Canvas(overlay_buf, pagesize=(page_width, page_height))
    c.drawImage(ImageReader(img_buf), 0, 0, width=page_width, height=page_height)
    c.save()
    overlay_buf.seek(0)
    raster_page = PdfReader(overlay_buf).pages[0]
    return raster_page


def apply_pdf_edits(pdf_path, config):
    """Apply page operations and overlay elements to a PDF.

    Config:
    {
        "page_operations": [...],
        "elements": [
            {
                "page": 1,
                "type": "text|image|signature|redaction",
                ...
            }
        ]
    }
    Returns BytesIO.
    """
    reader, pdf_bytes = _resolve_reader(pdf_path, config.get("page_operations", []))
    writer = PdfWriter()
    grouped = defaultdict(list)

    pdf_doc = None
    if pdf_bytes is not None:
        pdf_doc = pdfium.PdfDocument(pdf_bytes)
    else:
        pdf_doc = pdfium.PdfDocument(pdf_path)

    for element in config.get("elements", []):
        try:
            page_number = int(element.get("page", 1))
        except (TypeError, ValueError):
            continue
        grouped[page_number].append(element)

    for page_number, page in enumerate(reader.pages, 1):
        elements = grouped.get(page_number, [])
        redactions = [e for e in elements if e.get("type") == "redaction"]
        overlays = [e for e in elements if e.get("type") != "redaction"]

        if redactions:
            page = _rasterize_redactions(pdf_doc, page_number - 1, redactions)

        page_width = float(page.mediabox.width)
        page_height = float(page.mediabox.height)

        overlay_buf = BytesIO()
        c = canvas.Canvas(overlay_buf, pagesize=(page_width, page_height))

        for element in overlays:
            element_type = element.get("type")
            if element_type == "text":
                _draw_text(c, page_width, page_height, element)
            elif element_type in {"image", "signature"}:
                _draw_image(c, page_width, page_height, element)

        c.save()
        overlay_buf.seek(0)

        overlay_page = PdfReader(overlay_buf).pages[0]
        page.merge_page(overlay_page)
        writer.add_page(page)

    pdf_doc.close()

    buf = BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf
