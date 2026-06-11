from flask import Blueprint, request, send_file, jsonify
from ..services.repair_service import repair_pdf
from ..utils.file_helpers import save_upload, cleanup_files

bp = Blueprint("repair", __name__)


@bp.route("/api/repair", methods=["POST"])
def api_repair():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    path = save_upload(f)

    try:
        buf, _strategy = repair_pdf(path)
        return send_file(buf, as_attachment=True, download_name="repaired.pdf",
                         mimetype="application/pdf")
    except Exception as e:
        return jsonify({"error": f"Could not repair this PDF: {e}"}), 500
    finally:
        cleanup_files(path)
