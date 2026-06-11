from flask import Blueprint, request, send_file, jsonify
from ..services.pdf_to_word_service import pdf_to_word
from ..services.pdf_to_excel_service import pdf_to_excel
from ..services.pdf_to_pptx_service import pdf_to_pptx
from ..utils.file_helpers import save_upload, cleanup_files

bp = Blueprint("pdf_to_office", __name__)

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


@bp.route("/api/pdf-to-word", methods=["POST"])
def api_pdf_to_word():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    path = save_upload(f)

    try:
        buf = pdf_to_word(path)
        return send_file(buf, as_attachment=True, download_name="converted.docx",
                         mimetype=DOCX_MIME)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)


@bp.route("/api/pdf-to-excel", methods=["POST"])
def api_pdf_to_excel():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    single_sheet = request.form.get("layout", "sheets") == "single"
    path = save_upload(f)

    try:
        buf, _count = pdf_to_excel(path, single_sheet=single_sheet)
        return send_file(buf, as_attachment=True, download_name="tables.xlsx",
                         mimetype=XLSX_MIME)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)


@bp.route("/api/pdf-to-powerpoint", methods=["POST"])
def api_pdf_to_powerpoint():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    dpi = int(request.form.get("dpi", 150))
    path = save_upload(f)

    try:
        buf = pdf_to_pptx(path, dpi=dpi)
        return send_file(buf, as_attachment=True, download_name="slides.pptx",
                         mimetype=PPTX_MIME)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
