from io import BytesIO

import fitz

META_FIELDS = ("title", "author", "subject", "keywords", "creator", "producer")


def read_metadata(pdf_path):
    doc = fitz.open(pdf_path)
    try:
        meta = doc.metadata or {}
        out = {key: meta.get(key) or "" for key in META_FIELDS}
        out["created"] = meta.get("creationDate") or ""
        out["modified"] = meta.get("modDate") or ""
        return out
    finally:
        doc.close()


def write_metadata(pdf_path, fields, strip_all=False):
    doc = fitz.open(pdf_path)
    try:
        if strip_all:
            doc.set_metadata({})
            # XMP is a second metadata store; Acrobat/Preview read it first.
            doc.del_xml_metadata()
        else:
            meta = doc.metadata or {}
            new_meta = {key: fields.get(key, meta.get(key) or "") for key in META_FIELDS}
            new_meta["creationDate"] = meta.get("creationDate") or ""
            new_meta["modDate"] = meta.get("modDate") or ""
            doc.set_metadata(new_meta)
        return BytesIO(doc.tobytes(garbage=3, deflate=True))
    finally:
        doc.close()
