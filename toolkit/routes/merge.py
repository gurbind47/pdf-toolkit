from flask import Blueprint, request, send_file, jsonify
from ..services.merge_service import merge_files
from ..utils.file_helpers import save_upload, cleanup_files, get_temp_path

bp = Blueprint("merge", __name__)


@bp.route("/api/merge", methods=["POST"])
def api_merge():
    uploaded = request.files.getlist("files")
    if not uploaded:
        return jsonify({"error": "No files uploaded"}), 400

    paths = []
    try:
        for f in uploaded:
            paths.append(save_upload(f))

        result = merge_files(paths)
        out_path = get_temp_path(".pdf")
        with open(out_path, "wb") as f:
            f.write(result.getvalue())

        return send_file(out_path, as_attachment=True, download_name="merged.pdf")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(*paths)
