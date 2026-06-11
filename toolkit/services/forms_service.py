from io import BytesIO

import fitz

FIELD_TYPE_MAP = {
    "Text": "text",
    "CheckBox": "checkbox",
    "RadioButton": "radio",
    "ComboBox": "combobox",
    "ListBox": "listbox",
    "Signature": "signature",
    "Button": "button",
}

PDF_FIELD_IS_REQUIRED = 2

XFA_ERROR = (
    "This is an XFA form (common for IRCC IMM forms). XFA forms can only be "
    "edited in Adobe Acrobat/Reader — offline tools cannot fill them safely."
)


def detect_xfa(doc):
    cat = doc.pdf_catalog()
    kind, value = doc.xref_get_key(cat, "AcroForm")
    if kind == "null":
        return False
    if kind == "xref":
        # AcroForm is an indirect object; resolve it before reading XFA.
        xfa_kind, _ = doc.xref_get_key(int(value.split()[0]), "XFA")
    else:
        xfa_kind, _ = doc.xref_get_key(cat, "AcroForm/XFA")
    return xfa_kind not in ("null", None)


def _rect_to_pct(rect, page_rect):
    pw = page_rect.width or 1.0
    ph = page_rect.height or 1.0
    return {
        "x": (rect.x0 - page_rect.x0) / pw * 100.0,
        "y": (rect.y0 - page_rect.y0) / ph * 100.0,
        "w": rect.width / pw * 100.0,
        "h": rect.height / ph * 100.0,
    }


def _pct_to_rect(rect_pct, page_rect):
    pw = page_rect.width
    ph = page_rect.height
    x0 = page_rect.x0 + pw * float(rect_pct.get("x", 0)) / 100.0
    y0 = page_rect.y0 + ph * float(rect_pct.get("y", 0)) / 100.0
    return fitz.Rect(
        x0, y0,
        x0 + pw * float(rect_pct.get("w", 10)) / 100.0,
        y0 + ph * float(rect_pct.get("h", 3)) / 100.0,
    )


def list_form_fields(doc):
    fields = []
    for page_index, page in enumerate(doc):
        page_rect = page.rect
        for w in page.widgets():
            ftype = FIELD_TYPE_MAP.get(w.field_type_string, "text")

            options = []
            for opt in (w.choice_values or []):
                # reportlab-style combos store (export_value, label) pairs
                if isinstance(opt, (list, tuple)) and len(opt) >= 2:
                    options.append({"value": str(opt[0]), "label": str(opt[1])})
                else:
                    options.append({"value": str(opt), "label": str(opt)})

            on_state = None
            if ftype in ("checkbox", "radio"):
                try:
                    on_state = w.on_state()
                except Exception:
                    on_state = None

            fields.append({
                "xref": w.xref,
                "page": page_index + 1,
                "type": ftype,
                "name": w.field_name or f"field_{w.xref}",
                "value": w.field_value if w.field_value is not None else "",
                "rect_pct": _rect_to_pct(w.rect, page_rect),
                "options": options,
                "required": bool((w.field_flags or 0) & PDF_FIELD_IS_REQUIRED),
                "max_len": w.text_maxlen or 0,
                "fontsize": w.text_fontsize or 11,
                "on_state": on_state,
            })
    return fields


def _truthy(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("true", "yes", "on", "1")


def fill_form(pdf_path, values, flatten=False):
    """Set widget values by xref. Returns BytesIO."""
    doc = fitz.open(pdf_path)
    try:
        if detect_xfa(doc):
            raise ValueError(XFA_ERROR)

        value_map = {int(v["xref"]): v.get("value") for v in values}
        for page in doc:
            for w in page.widgets():
                if w.xref not in value_map:
                    continue
                value = value_map[w.xref]
                ftype = w.field_type_string
                if ftype == "CheckBox":
                    w.field_value = _truthy(value)
                elif ftype == "RadioButton":
                    # client sends the selected member's on-state string
                    w.field_value = str(value)
                else:
                    w.field_value = "" if value is None else str(value)
                w.update()

        doc.need_appearances(True)
        if flatten:
            doc.bake(annots=True, widgets=True)
        return BytesIO(doc.tobytes(garbage=3, deflate=True))
    finally:
        doc.close()


def _add_field(doc, spec):
    page = doc[int(spec["page"]) - 1]
    rect = _pct_to_rect(spec.get("rect_pct") or {}, page.rect)
    ftype = spec.get("type", "text")
    name = (spec.get("name") or "").strip() or f"field_{abs(hash(str(rect))) % 10000}"
    fontsize = float(spec.get("fontsize") or 11)
    required = bool(spec.get("required"))
    options = [str(o) for o in (spec.get("options") or []) if str(o).strip()]

    if ftype == "signbox":
        # PyMuPDF cannot create signature widgets — draw a visual sign-here box.
        page.draw_rect(rect, color=(0.45, 0.45, 0.5), dashes="[3] 0", width=1)
        page.insert_textbox(rect, "Sign here", fontsize=min(10, rect.height * 0.5),
                            fontname="helv", color=(0.55, 0.55, 0.6), align=1)
        return

    if ftype == "radio":
        # Radio-group creation is broken in PyMuPDF (garbage rects, "bad xref"),
        # so each option becomes its own labeled checkbox stacked in the rect.
        count = max(1, len(options))
        row_h = min(rect.height / count, 18)
        box = min(row_h - 4, 12)
        for i, label in enumerate(options or ["Option 1"]):
            y0 = rect.y0 + i * row_h
            w = fitz.Widget()
            w.field_name = f"{name}.{i + 1}"
            w.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX
            w.rect = fitz.Rect(rect.x0, y0, rect.x0 + box, y0 + box)
            if required:
                w.field_flags = PDF_FIELD_IS_REQUIRED
            page.add_widget(w)
            page.insert_text((rect.x0 + box + 4, y0 + box - 2), label,
                             fontsize=min(10, box), fontname="helv", color=(0.1, 0.1, 0.1))
        return

    w = fitz.Widget()
    w.field_name = name
    w.rect = rect
    w.text_fontsize = fontsize
    if required:
        w.field_flags = PDF_FIELD_IS_REQUIRED

    if ftype == "checkbox":
        w.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX
        if _truthy(spec.get("value")):
            w.field_value = True
    elif ftype in ("combobox", "listbox"):
        w.field_type = fitz.PDF_WIDGET_TYPE_COMBOBOX if ftype == "combobox" else fitz.PDF_WIDGET_TYPE_LISTBOX
        w.choice_values = options or ["Option 1"]
        if spec.get("value"):
            w.field_value = str(spec["value"])
    else:  # text or date
        w.field_type = fitz.PDF_WIDGET_TYPE_TEXT
        w.fill_color = (0.95, 0.97, 1.0)
        w.border_color = (0.62, 0.62, 0.68)
        if spec.get("value"):
            w.field_value = str(spec["value"])
        if ftype == "date":
            date_format = spec.get("date_format") or "yyyy-mm-dd"
            w.script_format = f'AFDate_FormatEx("{date_format}");'

    page.add_widget(w)


def save_form_fields(pdf_path, field_ops):
    """Apply delete/update/add field operations. Returns BytesIO."""
    doc = fitz.open(pdf_path)
    try:
        if detect_xfa(doc):
            raise ValueError(XFA_ERROR)

        delete_xrefs = {int(x) for x in field_ops.get("delete", [])}
        updates = {int(u["xref"]): u for u in field_ops.get("update", [])}

        # Moving a widget rect in place is unreliable, so updates are
        # implemented as delete + re-add with merged properties.
        to_delete = []
        re_add = []
        for page_index, page in enumerate(doc):
            page_rect = page.rect
            for w in page.widgets():
                if w.xref in delete_xrefs:
                    to_delete.append((page_index, w.xref))
                elif w.xref in updates:
                    spec = dict(updates[w.xref])
                    spec.setdefault("page", page_index + 1)
                    spec.setdefault("type", FIELD_TYPE_MAP.get(w.field_type_string, "text"))
                    if not spec.get("rect_pct"):
                        spec["rect_pct"] = _rect_to_pct(w.rect, page_rect)
                    if not spec.get("options"):
                        spec["options"] = [
                            o[0] if isinstance(o, (list, tuple)) else str(o)
                            for o in (w.choice_values or [])
                        ]
                    to_delete.append((page_index, w.xref))
                    re_add.append(spec)

        for page_index, xref in to_delete:
            page = doc[page_index]
            for w in page.widgets():
                if w.xref == xref:
                    page.delete_widget(w)
                    break

        for spec in list(field_ops.get("add", [])) + re_add:
            _add_field(doc, spec)

        doc.need_appearances(True)
        return BytesIO(doc.tobytes(garbage=3, deflate=True))
    finally:
        doc.close()
