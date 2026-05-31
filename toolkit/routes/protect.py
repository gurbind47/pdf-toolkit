from flask import Blueprint, request, send_file, jsonify
from ..services.protect_service import protect_pdf, unlock_pdf
from ..utils.file_helpers import save_upload, cleanup_files, get_temp_path

bp = Blueprint("protect", __name__)


@bp.route("/api/protect", methods=["POST"])
def api_protect():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    password = request.form.get("password", "")
    if not password:
        return jsonify({"error": "Password required"}), 400

    path = save_upload(f)

    try:
        result = protect_pdf(path, password)
        out_path = get_temp_path(".pdf")
        with open(out_path, "wb") as fw:
            fw.write(result.getvalue())
        return send_file(out_path, as_attachment=True, download_name="protected.pdf")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)


@bp.route("/api/unlock", methods=["POST"])
def api_unlock():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    password = request.form.get("password", "")
    if not password:
        return jsonify({"error": "Password required"}), 400

    path = save_upload(f)

    try:
        result = unlock_pdf(path, password)
        out_path = get_temp_path(".pdf")
        with open(out_path, "wb") as fw:
            fw.write(result.getvalue())
        return send_file(out_path, as_attachment=True, download_name="unlocked.pdf")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
