from flask import Blueprint, request, send_file, jsonify
from ..services.page_numbers_service import add_page_numbers
from ..utils.file_helpers import save_upload, cleanup_files, get_temp_path

bp = Blueprint("page_numbers", __name__)


@bp.route("/api/page-numbers", methods=["POST"])
def api_page_numbers():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    config = {
        "position": request.form.get("position", "bottom-center"),
        "format": request.form.get("format", "Page {n} of {total}"),
        "font_size": int(request.form.get("font_size", 10)),
        "start_page": int(request.form.get("start_page", 1)),
        "skip_first": request.form.get("skip_first", "false").lower() == "true",
    }

    path = save_upload(f)

    try:
        result = add_page_numbers(path, config)
        out_path = get_temp_path(".pdf")
        with open(out_path, "wb") as fw:
            fw.write(result.getvalue())
        return send_file(out_path, as_attachment=True, download_name="numbered.pdf")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
