from flask import Blueprint, request, jsonify
from ..services.preview_service import generate_thumbnails, generate_first_thumbnail
from ..services.text_extraction_service import extract_text_items
from ..utils.file_helpers import save_upload, cleanup_files

bp = Blueprint("preview", __name__)


@bp.route("/api/preview", methods=["POST"])
def api_preview():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    path = save_upload(f)

    try:
        thumbnails = generate_thumbnails(path)
        text_items = extract_text_items(path, max_pages=len(thumbnails))
        for index, page in enumerate(thumbnails):
            page["text_items"] = text_items[index] if index < len(text_items) else []
        return jsonify({"pages": thumbnails, "total": len(thumbnails)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)


@bp.route("/api/thumbnail", methods=["POST"])
def api_thumbnail():
    """Lightweight first-page thumbnail for the upload grid."""
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    path = save_upload(f)

    try:
        thumbnail, pages = generate_first_thumbnail(path)
        return jsonify({"thumbnail": thumbnail, "pages": pages})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
