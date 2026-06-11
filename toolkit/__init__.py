from flask import Flask, render_template


def create_app():
    app = Flask(
        __name__,
        static_folder="../static",
        template_folder="../templates",
    )
    app.config["MAX_CONTENT_LENGTH"] = None
    app.config["SECRET_KEY"] = "pdf-toolkit-local"

    from .routes import merge, split, organize, compress, watermark
    from .routes import page_numbers, convert, export, protect, preview, background_remove, add_pdf
    from .routes import repair, metadata, pdf_to_office, ocr, crop, forms, edit_text

    for module in (
        merge, split, organize, compress, watermark,
        page_numbers, convert, export, protect, preview, background_remove, add_pdf,
        repair, metadata, pdf_to_office, ocr, crop, forms, edit_text,
    ):
        app.register_blueprint(module.bp)

    TOOLS = [
        {"id": "add-pdf", "name": "Add PDF", "desc": "Edit text, signatures, images, and pages", "icon": "A", "color": "#0f766e", "accept": ".pdf", "template": "editor.html"},
        {"id": "edit-text", "name": "Edit Text", "desc": "Click any text in your PDF and change or delete it", "icon": "T", "color": "#0f766e", "accept": ".pdf", "template": "text_editor.html"},
        {"id": "pdf-forms", "name": "PDF Forms", "desc": "Fill existing forms or build new fillable fields", "icon": "Fm", "color": "#0f766e", "accept": ".pdf", "template": "forms_editor.html"},
        {"id": "merge", "name": "Merge PDF", "desc": "Combine multiple files into one PDF", "icon": "M", "color": "#e74c3c", "accept": "*"},
        {"id": "split", "name": "Split PDF", "desc": "Separate a PDF into multiple files", "icon": "S", "color": "#e74c3c", "accept": ".pdf"},
        {"id": "organize", "name": "Organize Pages", "desc": "Reorder, rotate, and delete pages", "icon": "O", "color": "#27ae60", "accept": ".pdf"},
        {"id": "crop", "name": "Crop PDF", "desc": "Trim margins or crop to a selected area", "icon": "Cr", "color": "#27ae60", "accept": ".pdf"},
        {"id": "compress", "name": "Compress PDF", "desc": "Reduce PDF file size", "icon": "C", "color": "#3498db", "accept": ".pdf"},
        {"id": "convert", "name": "Convert to PDF", "desc": "Word, Excel, PowerPoint, Markdown, HTML, Text", "icon": "F", "color": "#3498db", "accept": ".docx,.xlsx,.pptx,.md,.html,.htm,.txt"},
        {"id": "pdf-to-word", "name": "PDF to Word", "desc": "Convert PDFs into editable Word documents", "icon": "W", "color": "#3498db", "accept": ".pdf"},
        {"id": "pdf-to-excel", "name": "PDF to Excel", "desc": "Extract tables into an Excel workbook", "icon": "X", "color": "#3498db", "accept": ".pdf"},
        {"id": "pdf-to-powerpoint", "name": "PDF to PowerPoint", "desc": "Turn each page into a presentation slide", "icon": "P", "color": "#3498db", "accept": ".pdf"},
        {"id": "ocr", "name": "OCR PDF", "desc": "Make scanned PDFs searchable and copyable", "icon": "Oc", "color": "#1abc9c", "accept": ".pdf"},
        {"id": "watermark", "name": "Add Watermark", "desc": "Stamp text across every page", "icon": "Wm", "color": "#9b59b6", "accept": ".pdf"},
        {"id": "page-numbers", "name": "Page Numbers", "desc": "Add page numbers to your PDF", "icon": "#", "color": "#9b59b6", "accept": ".pdf"},
        {"id": "export", "name": "PDF to Images", "desc": "Export pages as PNG or JPG", "icon": "I", "color": "#1abc9c", "accept": ".pdf"},
        {"id": "background-remove", "name": "Remove Background", "desc": "Make photos and signatures transparent", "icon": "BG", "color": "#10b981", "accept": ".jpg,.jpeg,.png,.bmp,.tiff,.tif,.webp,.gif"},
        {"id": "protect", "name": "Protect PDF", "desc": "Encrypt with a password", "icon": "L", "color": "#e67e22", "accept": ".pdf"},
        {"id": "unlock", "name": "Unlock PDF", "desc": "Remove password protection", "icon": "U", "color": "#e67e22", "accept": ".pdf"},
        {"id": "repair", "name": "Repair PDF", "desc": "Fix PDFs that fail to open or behave oddly", "icon": "R", "color": "#e67e22", "accept": ".pdf"},
        {"id": "metadata", "name": "Edit Metadata", "desc": "View, change, or strip document properties", "icon": "Md", "color": "#9b59b6", "accept": ".pdf"},
    ]

    @app.route("/")
    def index():
        return render_template("index.html", tools=TOOLS)

    @app.route("/tool/<tool_id>")
    def tool_page(tool_id):
        tool = next((t for t in TOOLS if t["id"] == tool_id), None)
        if not tool:
            return "Tool not found", 404
        return render_template(tool.get("template", "tool.html"), tool=tool, tools=TOOLS)

    return app
