import os

SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_DIR = os.path.join(SCRIPT_DIR, "temp")
INPUT_DIR = os.path.join(SCRIPT_DIR, "Input")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "Output")

LETTER_WIDTH = 612
LETTER_HEIGHT = 792

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".gif"}
DOC_EXTS = {".docx", ".pptx", ".xlsx", ".md", ".html", ".htm", ".txt"}
ALL_SUPPORTED = {".pdf"} | IMAGE_EXTS | DOC_EXTS
