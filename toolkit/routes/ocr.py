from flask import Blueprint, request, send_file, jsonify
from ..services.ocr_service import ocr_pdf
from ..utils.file_helpers import save_upload, cleanup_files

bp = Blueprint("ocr", __name__)


@bp.route("/api/ocr", methods=["POST"])
def api_ocr():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    lang = request.form.get("lang", "eng")
    force = request.form.get("force", "false").lower() == "true"
    path = save_upload(f)

    try:
        buf, _pages = ocr_pdf(path, lang=lang, force=force)
        return send_file(buf, as_attachment=True, download_name="searchable.pdf",
                         mimetype="application/pdf")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
