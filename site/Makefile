PYTHON ?= python3
VENV   ?= ../.venv
BIN    := $(if $(wildcard $(VENV)/bin/python),$(VENV)/bin/python,$(PYTHON))

.PHONY: help install data build test test-python test-js serve clean

help:
	@echo "make install   - create ../.venv and install build + test dependencies"
	@echo "make data      - re-export algorithm metadata from the legacy React app"
	@echo "make build     - render site/dist"
	@echo "make test      - build, then run Python and Node tests"
	@echo "make serve     - serve site/dist on http://localhost:8123"
	@echo "make clean     - remove site/dist and caches"

install:
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/pip install -r requirements-dev.txt
	cd tests/js && npm install

data:
	$(BIN) scripts/export_data.py

build:
	$(BIN) build.py

test: build
	$(BIN) -m pytest tests -q
	cd tests/js && node --test

serve:
	$(PYTHON) -m http.server 8123 --bind 0.0.0.0 --directory dist

clean:
	rm -rf dist __pycache__ .pytest_cache tests/js/node_modules
