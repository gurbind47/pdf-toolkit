#!/bin/bash
cd "$(dirname "$0")"

# Use bundled venv if available, otherwise system python3
if [ -f .venv/bin/python3 ]; then
    PYTHON=.venv/bin/python3
else
    PYTHON=python3
fi

echo ""
echo "  Starting PDF Toolkit..."
echo "  Browser will open at http://127.0.0.1:5001"
echo ""
"$PYTHON" app.py
