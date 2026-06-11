from flask import Blueprint, request, send_file, jsonify
from ..services.metadata_service import read_metadata, write_metadata, META_FIELDS
from ..utils.file_helpers import save_upload, cleanup_files

bp = Blueprint("metadata", __name__)


@bp.route("/api/metadata/read", methods=["POST"])
def api_metadata_read():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    path = save_upload(f)

    try:
        return jsonify(read_metadata(path))
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)


@bp.route("/api/metadata/write", methods=["POST"])
def api_metadata_write():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    fields = {key: request.form.get(key, "") for key in META_FIELDS}
    strip_all = request.form.get("strip_all", "false").lower() == "true"
    path = save_upload(f)

    try:
        buf = write_metadata(path, fields, strip_all=strip_all)
        return send_file(buf, as_attachment=True, download_name="metadata-updated.pdf",
                         mimetype="application/pdf")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
