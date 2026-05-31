import os
import zipfile
from io import BytesIO
from flask import Blueprint, request, send_file, jsonify
from ..services.compress_service import compress_pdf
from ..utils.file_helpers import save_upload, cleanup_files, get_temp_path

bp = Blueprint("compress", __name__)


@bp.route("/api/compress", methods=["POST"])
def api_compress():
    files = []
    for key in request.files:
        files.extend(request.files.getlist(key))
    if not files:
        return jsonify({"error": "No file uploaded"}), 400

    invalid = [f.filename for f in files if not f.filename.lower().endswith(".pdf")]
    if invalid:
        return jsonify({"error": "Compress only supports PDF files: " + ", ".join(invalid)}), 400

    quality = request.form.get("quality", "medium")
    paths = []

    try:
        if len(files) == 1:
            path = save_upload(files[0])
            paths.append(path)
            result = compress_pdf(path, quality)
            out_path = get_temp_path(".pdf")
            with open(out_path, "wb") as fw:
                fw.write(result.getvalue())
            return send_file(out_path, as_attachment=True, download_name="compressed.pdf")

        zip_buf = BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in files:
                path = save_upload(f)
                paths.append(path)
                result = compress_pdf(path, quality)
                base = os.path.splitext(os.path.basename(f.filename))[0]
                name = f"{base}-compressed.pdf"
                zf.writestr(name, result.getvalue())
        zip_buf.seek(0)

        return send_file(
            zip_buf,
            as_attachment=True,
            download_name="compressed_files.zip",
            mimetype="application/zip",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if paths:
            cleanup_files(*paths)
