import json
from flask import Blueprint, request, send_file, jsonify
from ..services.organize_service import organize_pdf
from ..utils.file_helpers import save_upload, cleanup_files, get_temp_path

bp = Blueprint("organize", __name__)


@bp.route("/api/organize", methods=["POST"])
def api_organize():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    ops_str = request.form.get("operations", "[]")
    try:
        operations = json.loads(ops_str)
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid operations JSON"}), 400

    path = save_upload(f)

    try:
        result = organize_pdf(path, operations)
        out_path = get_temp_path(".pdf")
        with open(out_path, "wb") as fw:
            fw.write(result.getvalue())
        return send_file(out_path, as_attachment=True, download_name="organized.pdf")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
