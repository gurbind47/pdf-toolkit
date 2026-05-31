import os
from flask import Blueprint, request, send_file, jsonify
from ..services.convert_service import convert_to_pdf
from ..utils.file_helpers import save_upload, cleanup_files, get_temp_path

bp = Blueprint("convert", __name__)


@bp.route("/api/convert", methods=["POST"])
def api_convert():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    path = save_upload(f)

    try:
        result = convert_to_pdf(path)
        out_path = get_temp_path(".pdf")
        with open(out_path, "wb") as fw:
            fw.write(result.getvalue())
        base = os.path.splitext(f.filename)[0]
        return send_file(out_path, as_attachment=True, download_name=f"{base}.pdf")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
