import base64
from io import BytesIO
import pypdfium2 as pdfium


def generate_thumbnails(pdf_path, max_pages=100, thumb_width=200):
    """Generate base64 PNG thumbnails for each page. Returns list of dicts."""
    pdf = pdfium.PdfDocument(pdf_path)
    total = len(pdf)
    pages_to_render = min(total, max_pages)
    thumbnails = []

    for i in range(pages_to_render):
        page = pdf[i]
        pw = page.get_width()
        ph = page.get_height()
        scale = thumb_width / pw
        bitmap = page.render(scale=scale)
        img = bitmap.to_pil()

        buf = BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        thumbnails.append({
            "page": i + 1,
            "thumbnail": f"data:image/png;base64,{b64}",
            "width": pw,
            "height": ph,
        })

    pdf.close()
    return thumbnails


def generate_page_images(pdf_path, max_pages=60, render_width=1000):
    """Render pages at editing resolution for the editor screens.

    Returns (pages, total) where pages is a list of
    {"page": N, "image": data_url, "width": pts, "height": pts}.
    """
    pdf = pdfium.PdfDocument(pdf_path)
    try:
        total = len(pdf)
        pages = []
        for i in range(min(total, max_pages)):
            page = pdf[i]
            pw = page.get_width()
            ph = page.get_height()
            scale = render_width / pw if pw else 1
            bitmap = page.render(scale=scale)
            img = bitmap.to_pil()

            buf = BytesIO()
            img.save(buf, format="PNG")
            b64 = base64.b64encode(buf.getvalue()).decode("ascii")

            pages.append({
                "page": i + 1,
                "image": f"data:image/png;base64,{b64}",
                "width": pw,
                "height": ph,
            })
        return pages, total
    finally:
        pdf.close()


def generate_first_thumbnail(pdf_path, thumb_width=220):
    """Render only page 1 of a PDF. Returns (data_url, total_pages).

    Much cheaper than generate_thumbnails for the upload grid, where we
    only need a cover image and the page count.
    """
    pdf = pdfium.PdfDocument(pdf_path)
    try:
        total = len(pdf)
        if total == 0:
            return None, 0

        page = pdf[0]
        pw = page.get_width()
        scale = thumb_width / pw if pw else 1
        bitmap = page.render(scale=scale)
        img = bitmap.to_pil()

        buf = BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64}", total
    finally:
        pdf.close()
