import zipfile
from io import BytesIO
from flask import Blueprint, request, send_file, jsonify
from ..services.split_service import split_by_ranges, split_by_pages, extract_pages
from ..utils.file_helpers import save_upload, cleanup_files

bp = Blueprint("split", __name__)


@bp.route("/api/split", methods=["POST"])
def api_split():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    mode = request.form.get("mode", "ranges")
    path = save_upload(f)

    try:
        if mode == "ranges":
            ranges = request.form.get("ranges", "1-last")
            results = split_by_ranges(path, ranges)
        elif mode == "pages":
            n = int(request.form.get("pages_per_split", 1))
            results = split_by_pages(path, n)
        elif mode == "extract":
            pages_str = request.form.get("pages", "1")
            result = extract_pages(path, pages_str)
            return send_file(result, as_attachment=True, download_name="extracted.pdf")
        else:
            return jsonify({"error": f"Unknown mode: {mode}"}), 400

        if len(results) == 1:
            return send_file(results[0][1], as_attachment=True, download_name=results[0][0])

        # Zip multiple results
        zip_buf = BytesIO()
        with zipfile.ZipFile(zip_buf, "w") as zf:
            for name, buf in results:
                zf.writestr(name, buf.getvalue())
        zip_buf.seek(0)

        return send_file(zip_buf, as_attachment=True, download_name="split.zip",
                         mimetype="application/zip")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
