from io import BytesIO
from pypdf import PdfReader, PdfWriter


def protect_pdf(pdf_path, user_password, owner_password=None):
    """Encrypt PDF with password. Returns BytesIO."""
    reader = PdfReader(pdf_path)
    writer = PdfWriter()

    for page in reader.pages:
        writer.add_page(page)

    writer.encrypt(
        user_password=user_password,
        owner_password=owner_password or user_password,
    )

    buf = BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf


def unlock_pdf(pdf_path, password):
    """Decrypt PDF. Returns BytesIO."""
    reader = PdfReader(pdf_path)
    if reader.is_encrypted:
        reader.decrypt(password)

    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    buf = BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf
