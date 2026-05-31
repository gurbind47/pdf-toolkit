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
