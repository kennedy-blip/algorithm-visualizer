# Algorithm Visualization — static site

The Python 3.11 + Jinja2 replacement for the React/Vite app that currently serves
https://algorithm-visualizer-tzld.onrender.com. It renders the same
visualization (Bubble, Quick and Merge sort) with the same controls and copy, but
as a pre-rendered static site with no framework and no bundler.

The legacy app at the repository root is untouched. See
[`docs/BASELINE.md`](docs/BASELINE.md) for what production does today and
[`docs/MIGRATION.md`](docs/MIGRATION.md) for what changed and why.

## Quick start

```bash
cd ..                                    # repository root
python3 -m venv .venv && .venv/bin/pip install -r site/requirements-dev.txt
npm --prefix site/tests/js install       # only needed for the DOM tests

bash scripts/build.sh dist               # → dist/
.venv/bin/python site/build.py
.venv/bin/python -m pytest site/tests -q
(cd site/tests/js && node --test)
python3 -m http.server 8123 --directory dist
```

`make install`, `make build`, `make test`, `make serve` wrap the same commands.

## Layout

```
site/
├── build.py               Jinja2 build: render, copy assets, verify output
├── data/algorithms.json   algorithm metadata (generated: see scripts/)
├── scripts/export_data.py exporter used against the legacy React source
├── templates/
│   ├── base.html          document shell, config JSON, module script
│   ├── index.html         full page: cards, chart, controls, explanation
│   └── partials/icons.html inline SVG macro (lucide geometry)
├── static/
│   ├── css/styles.css     hand-written replacement for the Tailwind classes
│   ├── js/algorithms.js   pure sorting step engine (frames + counters)
│   ├── js/app.js          playback, sliders, panels, keyboard shortcuts
│   └── favicon.svg
├── tests/                 pytest suites, Node suites, live-baseline fixture
├── render-staging.yaml    staging service definition (not a render.yaml)
└── docs/                  BASELINE.md, MIGRATION.md
```

## How data flows

```
src/App.tsx (removed at cutover; exporter kept for provenance)
      │  scripts/export_data.py  (verbatim copy + curated extras)
      ▼
data/algorithms.json ──► build.py ──► <repo>/dist/index.html  (server-rendered)
      └──────────────────────────────► <repo>/dist/data/algorithms.json
                                          ▲
                          static/js/app.js fetches config from the page and
                          builds frames with static/js/algorithms.js
```

`build.py` fails loudly if the JSON is missing, in the wrong order, or missing
required fields, and it verifies that every local `href`/`src` in the generated
HTML resolves before reporting success. Rebuilds are byte-identical, so CI can
diff two builds.

## Deployment

Render **static site**:

* Build command: `python3 -m venv .venv && .venv/bin/pip install -r site/requirements.txt && .venv/bin/python site/build.py`
  (the local venv keeps the build independent of the system Python's
  PEP 668 `externally-managed-environment` policy — plain `pip install` fails
  on Debian-based images without `--break-system-packages`)
* Publish directory: `dist`
* Root directory: `.`
* `PYTHON_VERSION=3.11.2`

`render-staging.yaml` carries these values for a separate staging service. The
production service is still dashboard-configured and must not be changed until
staging passes the checklist in `docs/MIGRATION.md`.

## Behaviour notes

* One playback step is one comparison (bubble/quick) or one merge write
  (merge sort). The final frame is always the sorted array.
* Playback delay is `1000 - speed` ms, matching the legacy slider feel
  (`Speed: 500ms` → 500ms per step).
* Colour states: blue normal, red comparing, green sorted, yellow pivot, purple
  merging.
* Keyboard: `Space` play/pause, `←`/`→` step; `prefers-reduced-motion` removes
  transitions.
