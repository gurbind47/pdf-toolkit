from flask import Blueprint, request, send_file, jsonify
from ..services.watermark_service import add_watermark
from ..utils.file_helpers import save_upload, cleanup_files, get_temp_path

bp = Blueprint("watermark", __name__)


@bp.route("/api/watermark", methods=["POST"])
def api_watermark():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    config = {
        "text": request.form.get("text", "WATERMARK"),
        "font_size": int(request.form.get("font_size", 60)),
        "color": request.form.get("color", "#cccccc"),
        "opacity": float(request.form.get("opacity", 0.3)),
        "angle": int(request.form.get("angle", 45)),
    }

    path = save_upload(f)

    try:
        result = add_watermark(path, config)
        out_path = get_temp_path(".pdf")
        with open(out_path, "wb") as fw:
            fw.write(result.getvalue())
        return send_file(out_path, as_attachment=True, download_name="watermarked.pdf")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cleanup_files(path)
