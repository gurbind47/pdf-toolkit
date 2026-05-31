"""
PDF Toolkit — Local Web App
============================
Start:  python app.py
Open:   http://127.0.0.1:5001
"""

import webbrowser
import threading
from toolkit import create_app

app = create_app()


def open_browser():
    webbrowser.open("http://127.0.0.1:5001")


if __name__ == "__main__":
    threading.Timer(1.5, open_browser).start()
    print("\n  PDF Toolkit running at http://127.0.0.1:5001\n")
    app.run(host="127.0.0.1", port=5001, debug=False)
