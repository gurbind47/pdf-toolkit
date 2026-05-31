from io import BytesIO

from PIL import Image, ImageChops, ImageFilter, ImageStat
from rembg import remove


DOC_MEAN_LUMA_CUTOFF = 200
DOC_INK_THRESHOLD = 170
PHOTO_INK_THRESHOLD = 150
MIN_ALPHA = 15
ALPHA_MATTING_FOREGROUND = 240
ALPHA_MATTING_BACKGROUND = 10
ALPHA_MATTING_ERODE_SIZE = 10


def _build_ink_alpha_mask(image):
    luma = image.convert("L")
    mean_luma = ImageStat.Stat(luma).mean[0]
    ink_threshold = DOC_INK_THRESHOLD if mean_luma >= DOC_MEAN_LUMA_CUTOFF else PHOTO_INK_THRESHOLD

    ink_mask = luma.point(lambda p: 255 if p <= ink_threshold else 0)
    alpha = image.getchannel("A")
    alpha = alpha.point(lambda a: 0 if a <= MIN_ALPHA else a)
    combined = ImageChops.multiply(alpha, ink_mask)

    # Reduce pepper noise without expanding strokes.
    combined = combined.filter(ImageFilter.MedianFilter(size=3))
    return combined


def remove_background(file_path):
    with open(file_path, "rb") as f:
        input_bytes = f.read()

    output_bytes = remove(
        input_bytes,
        alpha_matting=True,
        alpha_matting_foreground_threshold=ALPHA_MATTING_FOREGROUND,
        alpha_matting_background_threshold=ALPHA_MATTING_BACKGROUND,
        alpha_matting_erode_size=ALPHA_MATTING_ERODE_SIZE,
    )
    image = Image.open(BytesIO(output_bytes))
    if image.mode != "RGBA":
        image = image.convert("RGBA")

    image.putalpha(_build_ink_alpha_mask(image))

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer