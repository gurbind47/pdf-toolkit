from io import BytesIO

import fitz
from openpyxl import Workbook


def _coerce_cell(value):
    if value is None:
        return ""
    s = str(value).strip()
    if not s:
        return ""
    # Keep leading-zero strings (phone numbers, file numbers) as text.
    cleaned = s.replace(",", "")
    if cleaned.startswith("0") and len(cleaned) > 1 and not cleaned.startswith("0."):
        return s
    try:
        return int(cleaned)
    except ValueError:
        try:
            return float(cleaned)
        except ValueError:
            return s


def pdf_to_excel(pdf_path, single_sheet=False):
    """Extract tables into a workbook. Returns BytesIO."""
    doc = fitz.open(pdf_path)
    try:
        wb = Workbook()
        ws = wb.active
        found = 0

        for page_index, page in enumerate(doc):
            tabs = page.find_tables()
            for t_index, table in enumerate(tabs.tables):
                data = table.extract()
                if not data:
                    continue
                found += 1

                if single_sheet:
                    target = ws
                    if found == 1:
                        ws.title = "Tables"
                    else:
                        target.append([])
                    target.append([f"Page {page_index + 1} — Table {t_index + 1}"])
                else:
                    title = f"P{page_index + 1}_T{t_index + 1}"
                    if found == 1:
                        ws.title = title
                        target = ws
                    else:
                        target = wb.create_sheet(title)

                for row in data:
                    target.append([_coerce_cell(cell) for cell in row])

        if found == 0:
            raise ValueError(
                "No tables detected. For scanned PDFs run the OCR PDF tool first; "
                "tables without visible grid lines may not be detected."
            )

        out = BytesIO()
        wb.save(out)
        out.seek(0)
        return out, found
    finally:
        doc.close()
