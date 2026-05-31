from io import BytesIO
import os
import pypdfium2 as pdfium
from PIL import Image
from pypdf import PdfReader, PdfWriter


def compress_pdf(pdf_path, quality="medium"):
    """Compress a PDF. Quality: low, medium, high. Returns BytesIO."""
    if quality not in ("low", "medium", "high"):
        quality = "medium"

    original_size = os.path.getsize(pdf_path)
    stream_buf = _compress_streams(pdf_path, quality)

    # Use stronger (rasterized) compression when the stream-only pass
    # does not meaningfully reduce size and user asked for low/medium.
    if quality in ("low", "medium"):
        if stream_buf.getbuffer().nbytes >= int(original_size * 0.98):
            raster_buf = _compress_rasterized(pdf_path, quality)
            if raster_buf.getbuffer().nbytes < stream_buf.getbuffer().nbytes:
                return raster_buf

    return stream_buf


def _compress_streams(pdf_path, quality):
    reader = PdfReader(pdf_path)
    writer = PdfWriter()

    for page in reader.pages:
        writer.add_page(page)

    # Remove duplicate objects
    writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)

    # Compress all page content streams
    for page in writer.pages:
        page.compress_content_streams()

    # Strip metadata for smaller size
    if quality == "low":
        writer.add_metadata({
            "/Producer": "",
            "/Creator": "",
        })

    buf = BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf


def _compress_rasterized(pdf_path, quality):
    settings = {
        "low": {"dpi": 96, "jpeg_quality": 60},
        "medium": {"dpi": 150, "jpeg_quality": 75},
        "high": {"dpi": 200, "jpeg_quality": 85},
    }
    cfg = settings.get(quality, settings["medium"])
    dpi = cfg["dpi"]
    jpeg_quality = cfg["jpeg_quality"]

    pdf = pdfium.PdfDocument(pdf_path)
    images = []
    try:
        scale = dpi / 72.0
        for i in range(len(pdf)):
            page = pdf[i]
            bitmap = page.render(scale=scale)
            img = bitmap.to_pil()
            if img.mode != "RGB":
                img = img.convert("RGB")
            images.append(img)
    finally:
        pdf.close()

    if not images:
        return _compress_streams(pdf_path, quality)

    first, rest = images[0], images[1:]
    buf = BytesIO()
    first.save(
        buf,
        format="PDF",
        save_all=True,
        append_images=rest,
        resolution=dpi,
        quality=jpeg_quality,
        optimize=True,
    )
    buf.seek(0)
    return buf


def _compress_images(writer, quality):
    """Best-effort image compression within PDF streams."""
    # pypdf's built-in compression handles most cases.
    # For deeper image compression, we'd need to decode/re-encode
    # each image XObject, which is complex. The stream compression
    # above provides good results for most files.
    pass
