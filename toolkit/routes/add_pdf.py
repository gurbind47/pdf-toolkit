import json
from flask import Blueprint, request, send_file, jsonify
from ..services.add_pdf_service import apply_pdf_edits
from ..utils.file_helpers import save_upload, cleanup_files, get_temp_path

bp = Blueprint("add_pdf", __name__)


@bp.route("/api/add-pdf", methods=["POST"])
def api_add_pdf():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        page_operations = json.loads(request.form.get("page_operations", "[]"))
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid page operations JSON"}), 400

    try:
        elements = json.loads(request.form.get("elements", "[]"))
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid elements JSON"}), 400

    path = save_upload(f)

    try:
        result = apply_pdf_edits(path, {
            "page_operations": page_operations,
            "elements": elements,
        })
        out_path = get_temp_path(".pdf")
        with open(out_path, "wb") as fw:
            fw.write(result.getvalue())
        return send_file(out_path, as_attachment=True, download_name="edited.pdf")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
