#!/usr/bin/env bash
# Build the static site into the directory Render publishes.
#
# Works on a bare Debian/Render build image: it uses an existing Jinja2 if the
# interpreter already has one, otherwise an isolated .venv, otherwise a user
# site install. No Node/bundler step is involved.
#
# Usage: bash scripts/build.sh [output-dir]     (default: dist)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
OUT="${1:-dist}"
PYTHON_BIN="${PYTHON:-python3}"
REQ="site/requirements.txt"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "!! no '$PYTHON_BIN' on PATH; cannot render the site" >&2
  # Exit code 3 is reserved for a missing interpreter: tools/vite-render-shim
  # falls back to the committed dist/ only for this case, never for real
  # build errors.
  exit 3
fi

echo "==> building static site into '${OUT}' with $("$PYTHON_BIN" --version 2>&1)"

if "$PYTHON_BIN" -c "import jinja2" >/dev/null 2>&1; then
  echo "==> Jinja2 already importable, no install needed"
  exec "$PYTHON_BIN" site/build.py --out "$OUT"
fi

if "$PYTHON_BIN" -m venv "$ROOT/.venv" >/dev/null 2>&1 && [ -x "$ROOT/.venv/bin/python" ]; then
  echo "==> installing requirements into .venv"
  "$ROOT/.venv/bin/pip" install --quiet --disable-pip-version-check -r "$REQ"
  exec "$ROOT/.venv/bin/python" site/build.py --out "$OUT"
fi

echo "==> venv unavailable, installing into the user site"
"$PYTHON_BIN" -m pip install --quiet --disable-pip-version-check --user -r "$REQ" \
  || "$PYTHON_BIN" -m pip install --quiet --disable-pip-version-check --break-system-packages -r "$REQ"
exec "$PYTHON_BIN" site/build.py --out "$OUT"
