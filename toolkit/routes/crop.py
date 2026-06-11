import json
from flask import Blueprint, request, send_file, jsonify
from ..services.crop_service import crop_pdf
from ..services.preview_service import generate_page_images
from ..utils.file_helpers import save_upload, cleanup_files

bp = Blueprint("crop", __name__)


@bp.route("/api/crop/preview", methods=["POST"])
def api_crop_preview():
    """First-page render so the user can drag a crop rectangle."""
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    path = save_upload(f)

    try:
        pages, total = generate_page_images(path, max_pages=1, render_width=700)
        if not pages:
            return jsonify({"error": "PDF has no pages"}), 400
        return jsonify({"page": pages[0], "total": total})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)


@bp.route("/api/crop", methods=["POST"])
def api_crop():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    mode = request.form.get("mode", "rect")
    pages_str = request.form.get("pages", "")

    try:
        rect_pct = json.loads(request.form.get("rect_pct", "null"))
        margins = json.loads(request.form.get("margins", "null"))
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid crop JSON"}), 400

    path = save_upload(f)

    try:
        buf = crop_pdf(path, mode=mode, margins=margins, rect_pct=rect_pct, pages_str=pages_str)
        return send_file(buf, as_attachment=True, download_name="cropped.pdf",
                         mimetype="application/pdf")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
