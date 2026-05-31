import zipfile
from io import BytesIO
from flask import Blueprint, request, send_file, jsonify
from ..services.export_service import pdf_to_images
from ..utils.file_helpers import save_upload, cleanup_files

bp = Blueprint("export", __name__)


@bp.route("/api/pdf-to-images", methods=["POST"])
def api_pdf_to_images():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    fmt = request.form.get("format", "png")
    dpi = int(request.form.get("dpi", 200))
    path = save_upload(f)

    try:
        results = pdf_to_images(path, fmt=fmt, dpi=dpi)

        if len(results) == 1:
            name, buf = results[0]
            mime = "image/jpeg" if fmt in ("jpg", "jpeg") else "image/png"
            return send_file(buf, as_attachment=True, download_name=name, mimetype=mime)

        zip_buf = BytesIO()
        with zipfile.ZipFile(zip_buf, "w") as zf:
            for name, buf in results:
                zf.writestr(name, buf.getvalue())
        zip_buf.seek(0)

        return send_file(zip_buf, as_attachment=True, download_name="pages.zip",
                         mimetype="application/zip")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
