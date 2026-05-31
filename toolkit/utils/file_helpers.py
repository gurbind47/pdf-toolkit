import os
import uuid
import time
import threading
from ..config import TEMP_DIR

TEMP_MAX_AGE = 3600


def get_temp_path(extension=".pdf"):
    os.makedirs(TEMP_DIR, exist_ok=True)
    return os.path.join(TEMP_DIR, f"{uuid.uuid4().hex}{extension}")


def save_upload(upload_file):
    ext = os.path.splitext(upload_file.filename)[1].lower()
    path = get_temp_path(ext)
    upload_file.save(path)
    return path


def cleanup_old_temps(max_age=TEMP_MAX_AGE):
    if not os.path.isdir(TEMP_DIR):
        return
    now = time.time()
    for fname in os.listdir(TEMP_DIR):
        fpath = os.path.join(TEMP_DIR, fname)
        try:
            if os.path.isfile(fpath) and (now - os.path.getmtime(fpath)) > max_age:
                os.remove(fpath)
        except OSError:
            pass


def cleanup_files(*paths):
    for p in paths:
        try:
            if p and os.path.isfile(p):
                os.remove(p)
        except OSError:
            pass


def _periodic_cleanup():
    while True:
        time.sleep(600)
        cleanup_old_temps()


_cleanup_thread = threading.Thread(target=_periodic_cleanup, daemon=True)
_cleanup_thread.start()
