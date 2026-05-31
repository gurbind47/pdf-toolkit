from io import BytesIO
import pypdfium2 as pdfium


def pdf_to_images(pdf_path, fmt="png", dpi=200):
    """Convert each PDF page to an image. Returns list of (filename, BytesIO)."""
    pdf = pdfium.PdfDocument(pdf_path)
    scale = dpi / 72
    results = []

    for i in range(len(pdf)):
        page = pdf[i]
        bitmap = page.render(scale=scale)
        img = bitmap.to_pil()

        buf = BytesIO()
        save_fmt = "JPEG" if fmt.lower() in ("jpg", "jpeg") else "PNG"
        img.save(buf, format=save_fmt)
        buf.seek(0)

        ext = "jpg" if save_fmt == "JPEG" else "png"
        results.append((f"page_{i + 1}.{ext}", buf))

    pdf.close()
    return results
