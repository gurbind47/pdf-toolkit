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

    app.register_blueprint(merge.bp)
    app.register_blueprint(split.bp)
    app.register_blueprint(organize.bp)
    app.register_blueprint(compress.bp)
    app.register_blueprint(watermark.bp)
    app.register_blueprint(page_numbers.bp)
    app.register_blueprint(convert.bp)
    app.register_blueprint(export.bp)
    app.register_blueprint(protect.bp)
    app.register_blueprint(preview.bp)
    app.register_blueprint(background_remove.bp)
    app.register_blueprint(add_pdf.bp)

    TOOLS = [
        {"id": "add-pdf", "name": "Add PDF", "desc": "Edit text, signatures, images, and pages", "icon": "A", "color": "#0f766e", "accept": ".pdf"},
        {"id": "merge", "name": "Merge PDF", "desc": "Combine multiple files into one PDF", "icon": "M", "color": "#e74c3c", "accept": "*"},
        {"id": "split", "name": "Split PDF", "desc": "Separate a PDF into multiple files", "icon": "S", "color": "#e74c3c", "accept": ".pdf"},
        {"id": "organize", "name": "Organize Pages", "desc": "Reorder, rotate, and delete pages", "icon": "O", "color": "#27ae60", "accept": ".pdf"},
        {"id": "compress", "name": "Compress PDF", "desc": "Reduce PDF file size", "icon": "C", "color": "#3498db", "accept": ".pdf"},
        {"id": "convert", "name": "Convert to PDF", "desc": "Word, Excel, PowerPoint, Markdown, HTML, Text", "icon": "F", "color": "#3498db", "accept": ".docx,.xlsx,.pptx,.md,.html,.htm,.txt"},
        {"id": "watermark", "name": "Add Watermark", "desc": "Stamp text across every page", "icon": "W", "color": "#9b59b6", "accept": ".pdf"},
        {"id": "page-numbers", "name": "Page Numbers", "desc": "Add page numbers to your PDF", "icon": "#", "color": "#9b59b6", "accept": ".pdf"},
        {"id": "export", "name": "PDF to Images", "desc": "Export pages as PNG or JPG", "icon": "I", "color": "#1abc9c", "accept": ".pdf"},
        {"id": "background-remove", "name": "Remove Background", "desc": "Make photos and signatures transparent", "icon": "BG", "color": "#10b981", "accept": ".jpg,.jpeg,.png,.bmp,.tiff,.tif,.webp,.gif"},
        {"id": "protect", "name": "Protect PDF", "desc": "Encrypt with a password", "icon": "L", "color": "#e67e22", "accept": ".pdf"},
        {"id": "unlock", "name": "Unlock PDF", "desc": "Remove password protection", "icon": "U", "color": "#e67e22", "accept": ".pdf"},
    ]

    @app.route("/")
    def index():
        return render_template("index.html", tools=TOOLS)

    @app.route("/tool/<tool_id>")
    def tool_page(tool_id):
        tool = next((t for t in TOOLS if t["id"] == tool_id), None)
        if not tool:
            return "Tool not found", 404
        if tool_id == "add-pdf":
            return render_template("editor.html", tool=tool, tools=TOOLS)
        return render_template("tool.html", tool=tool, tools=TOOLS)

    return app
