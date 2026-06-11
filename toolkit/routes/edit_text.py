import json
from flask import Blueprint, request, send_file, jsonify

from ..services.edit_text_service import apply_text_edits
from ..services.preview_service import generate_page_images
from ..services.text_extraction_service import extract_edit_spans
from ..utils.file_helpers import save_upload, cleanup_files

bp = Blueprint("edit_text", __name__)


@bp.route("/api/edit-text/load", methods=["POST"])
def api_edit_text_load():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    path = save_upload(f)

    try:
        pages, total = generate_page_images(path)
        span_pages = extract_edit_spans(path, max_pages=len(pages))
        span_map = {entry["page"]: entry for entry in span_pages}
        for page in pages:
            entry = span_map.get(page["page"], {})
            page["spans"] = entry.get("spans", [])
            page["source"] = entry.get("source", "text-layer")
        return jsonify({"pages": pages, "total": total})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)


@bp.route("/api/edit-text/apply", methods=["POST"])
def api_edit_text_apply():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        edits = json.loads(request.form.get("edits", "[]"))
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid edits JSON"}), 400

    if not edits:
        return jsonify({"error": "No edits to apply"}), 400

    path = save_upload(f)

    try:
        buf = apply_text_edits(path, edits)
        return send_file(buf, as_attachment=True, download_name="text-edited.pdf",
                         mimetype="application/pdf")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
