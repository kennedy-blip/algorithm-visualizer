#!/usr/bin/env bash
# Build the site, then run the Python and (if installed) Node test suites.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PYTHON_BIN="${PYTHON:-python3}"

if [ ! -x .venv/bin/python ]; then
  "$PYTHON_BIN" -m venv .venv
fi
.venv/bin/pip install --quiet --disable-pip-version-check -r site/requirements-dev.txt
.venv/bin/python site/build.py
.venv/bin/python -m pytest site/tests -q

if [ -d site/tests/js/node_modules ]; then
  (cd site/tests/js && node --test)
else
  echo "==> skipping Node tests (run: npm --prefix site/tests/js install)"
fi
