from io import BytesIO
from pypdf import PdfWriter, PdfReader, Transformation
from pypdf.generic import RectangleObject
from PIL import Image
from ..config import LETTER_WIDTH, LETTER_HEIGHT


def resize_page_to_letter(page):
    orig_width = float(page.mediabox.width)
    orig_height = float(page.mediabox.height)
    if orig_width == 0 or orig_height == 0:
        page.mediabox = RectangleObject([0, 0, LETTER_WIDTH, LETTER_HEIGHT])
        return page

    scale = min(LETTER_WIDTH / orig_width, LETTER_HEIGHT / orig_height)
    new_w = orig_width * scale
    new_h = orig_height * scale
    offset_x = (LETTER_WIDTH - new_w) / 2
    offset_y = (LETTER_HEIGHT - new_h) / 2

    tx = Transformation().scale(scale, scale).translate(offset_x, offset_y)
    page.add_transformation(tx, expand=True)
    page.mediabox = RectangleObject([0, 0, LETTER_WIDTH, LETTER_HEIGHT])
    page.cropbox = page.mediabox
    return page


def image_to_pdf_bytes(image_path):
    img = Image.open(image_path)
    if img.mode != "RGB":
        img = img.convert("RGB")

    img_w, img_h = img.size
    scale = min(LETTER_WIDTH / img_w, LETTER_HEIGHT / img_h)
    new_w = int(img_w * scale)
    new_h = int(img_h * scale)
    if new_w != img_w or new_h != img_h:
        img = img.resize((new_w, new_h), Image.LANCZOS)

    offset_x = int((LETTER_WIDTH - new_w) / 2)
    offset_y = int((LETTER_HEIGHT - new_h) / 2)

    canvas = Image.new("RGB", (int(LETTER_WIDTH), int(LETTER_HEIGHT)), "white")
    canvas.paste(img, (offset_x, offset_y))

    buf = BytesIO()
    canvas.save(buf, format="PDF")
    buf.seek(0)
    return buf
