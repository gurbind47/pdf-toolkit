from io import BytesIO
from pypdf import PdfReader, PdfWriter


def parse_page_ranges(range_str, total_pages):
    """Parse '1-3,5,7-last' into list of 0-based page indices."""
    pages = []
    parts = [p.strip() for p in range_str.split(",") if p.strip()]
    for part in parts:
        if "-" in part:
            start_s, end_s = part.split("-", 1)
            start = int(start_s) - 1
            end = total_pages - 1 if end_s.lower() == "last" else int(end_s) - 1
            pages.extend(range(start, end + 1))
        else:
            pages.append(int(part) - 1)
    return [p for p in pages if 0 <= p < total_pages]


def split_by_ranges(pdf_path, ranges_str):
    """Split PDF by custom ranges. Returns list of (filename, BytesIO)."""
    reader = PdfReader(pdf_path)
    total = len(reader.pages)
    results = []

    range_groups = [r.strip() for r in ranges_str.split(";") if r.strip()]
    for i, rng in enumerate(range_groups, 1):
        pages = parse_page_ranges(rng, total)
        if not pages:
            continue
        writer = PdfWriter()
        for p in pages:
            writer.add_page(reader.pages[p])
        buf = BytesIO()
        writer.write(buf)
        buf.seek(0)
        results.append((f"split_{i}.pdf", buf))

    return results


def split_by_pages(pdf_path, pages_per_split):
    """Split PDF every N pages. Returns list of (filename, BytesIO)."""
    reader = PdfReader(pdf_path)
    total = len(reader.pages)
    results = []

    for start in range(0, total, pages_per_split):
        writer = PdfWriter()
        end = min(start + pages_per_split, total)
        for i in range(start, end):
            writer.add_page(reader.pages[i])
        buf = BytesIO()
        writer.write(buf)
        buf.seek(0)
        part_num = (start // pages_per_split) + 1
        results.append((f"part_{part_num}.pdf", buf))

    return results


def extract_pages(pdf_path, pages_str):
    """Extract specific pages into a single PDF. Returns BytesIO."""
    reader = PdfReader(pdf_path)
    total = len(reader.pages)
    pages = parse_page_ranges(pages_str, total)

    writer = PdfWriter()
    for p in pages:
        writer.add_page(reader.pages[p])

    buf = BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf
