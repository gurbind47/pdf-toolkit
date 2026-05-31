import os

from flask import Blueprint, request, send_file, jsonify

from ..services.background_remove_service import remove_background
from ..utils.file_helpers import save_upload, cleanup_files

bp = Blueprint("background_remove", __name__)


@bp.route("/api/background-remove", methods=["POST"])
def api_background_remove():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    path = save_upload(f)

    try:
        result = remove_background(path)
        base = os.path.splitext(f.filename or "background-removed")[0]
        return send_file(
            result,
            as_attachment=True,
            download_name=f"{base}_no_bg.png",
            mimetype="image/png",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)