import json
from flask import Blueprint, request, send_file, jsonify
import fitz

from ..services.forms_service import detect_xfa, list_form_fields, fill_form, save_form_fields
from ..services.preview_service import generate_page_images
from ..utils.file_helpers import save_upload, cleanup_files

bp = Blueprint("forms", __name__)


@bp.route("/api/forms/load", methods=["POST"])
def api_forms_load():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    path = save_upload(f)

    try:
        pages, total = generate_page_images(path)
        doc = fitz.open(path)
        try:
            is_xfa = detect_xfa(doc)
            fields = list_form_fields(doc)
        finally:
            doc.close()
        return jsonify({
            "pages": pages,
            "total": total,
            "is_xfa": is_xfa,
            "field_count": len(fields),
            "fields": fields,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)


@bp.route("/api/forms/fill", methods=["POST"])
def api_forms_fill():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        values = json.loads(request.form.get("values", "[]"))
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid values JSON"}), 400

    flatten = request.form.get("flatten", "false").lower() == "true"
    path = save_upload(f)

    try:
        buf = fill_form(path, values, flatten=flatten)
        return send_file(buf, as_attachment=True, download_name="filled.pdf",
                         mimetype="application/pdf")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)


@bp.route("/api/forms/save-fields", methods=["POST"])
def api_forms_save_fields():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        field_ops = json.loads(request.form.get("field_ops", "{}"))
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid field operations JSON"}), 400

    path = save_upload(f)

    try:
        buf = save_form_fields(path, field_ops)
        return send_file(buf, as_attachment=True, download_name="fillable.pdf",
                         mimetype="application/pdf")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
