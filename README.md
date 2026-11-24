# Algorithm Visualization

An interactive, step-by-step visualizer for **bubble sort**, **quick sort** and
**merge sort**. The page is rendered at build time by a small Python + Jinja2
generator and played back by plain ES modules — no framework, no bundler, no
runtime dependencies.

Live: https://algorithm-visualizer-tzld.onrender.com

## Features

### Sorting algorithms

* **Bubble sort** — one step per adjacent comparison; the sorted suffix grows
  after each full pass.
* **Quick sort** — Lomuto partition with the pivot highlighted; positions turn
  green as they reach their final index.
* **Merge sort** — bottom-up merges; the runs being merged are purple.

### Controls

* Play / pause, previous step, next step, back to first step, skip to final step.
* Array size 10–40 (regenerates a fresh array).
* Speed 100–900 (`Slow`/`Medium`/`Fast`), mapped to a `1000 - speed` ms delay.
* "Generate New Array" for a fresh random run.
* Keyboard: `Space` play/pause, `←`/`→` step back/forward.

### Visualization

* Colour states: blue normal, red comparing, green sorted, yellow pivot, purple
  merging.
* Live comparison and swap counters, per-step explanation, and a progress bar
  that reflects the real number of steps.
* Every run finishes sorted; the counters come from the actual algorithm.

## Project layout

```
scripts/build.sh                 # installs Jinja2 if needed, renders dist/
scripts/test.sh                  # build + pytest + node --test
package.json                     # build/test/serve shims (no dependencies)
site/
├── build.py                     # Jinja2 render, asset copy, output verification
├── data/algorithms.json         # exported algorithm metadata
├── scripts/export_data.py       # how that JSON was produced (legacy exporter)
├── templates/                   # base.html, index.html, icon macro
├── static/                      # styles.css, app.js, algorithms.js, favicon
├── tests/                       # pytest suites + jsdom/engine suites
└── docs/                        # BASELINE.md, MIGRATION.md (migration record)
dist/                            # build output (generated, gitignored)
```

## Development

```bash
python3 -m venv .venv
.venv/bin/pip install -r site/requirements-dev.txt
.venv/bin/python site/build.py          # → dist/
python3 -m http.server 8123 --directory dist
```

`npm run build`, `npm test` and `npm run serve` wrap the same commands if you
prefer npm scripts.

## Tests

```bash
.venv/bin/python -m pytest site/tests -q          # build, output, export, parity
npm --prefix site/tests/js install                # jsdom + esbuild, once
(cd site/tests/js && node --test)                 # sorting engine + DOM behaviour
```

* **Engine** — sorting correctness, exact comparison/swap counts, determinism,
  value range, size clamps, speed mapping.
* **DOM** — the real built page in jsdom: bars, stepping, play/pause, skip to
  end, algorithm switching, sliders.
* **Build** — every local reference resolves, assets copied verbatim, JSON
  published unchanged, deterministic output, clear errors for bad data.
* **Parity** — production copy captured before the migration
  (`site/tests/fixtures/live_baseline_2026-11-24.txt`) must still be readable on
  the generated page.

## Deployment (Render)

Static site, publish directory **`dist`**.

```bash
python3 -m venv .venv && .venv/bin/pip install -r site/requirements.txt && .venv/bin/python site/build.py --out dist
```

or simply `bash scripts/build.sh dist` (used by `npm run build`, so an existing
`npm install && npm run build` build command keeps working). Python 3.9+ is
required. See `site/docs/MIGRATION.md` for the full deploy history and the
rollback steps.

## Algorithms at a glance

| Algorithm | Time complexity | Notes |
| --- | --- | --- |
| Bubble sort | O(n²) | Repeatedly compares adjacent elements and swaps them when out of order |
| Quick sort | O(n log n) average | Picks a pivot and partitions around it, then recurses |
| Merge sort | O(n log n) | Divides the array into halves, sorts them, merges them back (stable) |

## License

MIT
