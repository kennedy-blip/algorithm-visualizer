# Migration log: React/Vite → Python + Jinja2 static site

Work happens on `arena/69228659-algorithm-visualizer`, branched from `main` at
`9e79d9f`. The legacy app at the repository root is untouched and still builds
exactly as production does; the replacement lives entirely in `site/`.

Reading order: `BASELINE.md` (what exists today) → this file (what changed) →
`site/README.md` (how to build and run it).

## 1. Why Python + Jinja2

Ruby was not available (nor Go/PHP/Java); Python 3.11 and Node 22 are. The site
is fully static: **Python 3.11 + Jinja2 renders the HTML at build time** and a
small vanilla ES module handles playback. No React, no bundler, no npm build step
for the new app — the only runtime dependency is Jinja2, and the only tooling
dependencies are pytest and (for tests) jsdom + esbuild.

Rendering the algorithm cards, controls and copy at build time means the page is
readable without JavaScript, which the current client-rendered app cannot do.

## 2. What moved, and where

| Legacy | New | How |
| --- | --- | --- |
| `getAlgorithmInfo()` switch in `src/App.tsx` | `site/data/algorithms.json` | `site/scripts/export_data.py` parses the switch **read-only** and writes JSON; copy is verified verbatim by `tests/test_export.py` |
| Per-algorithm paragraphs in the JSX | `algorithms.json` → `explanation` | exporter pulls the `<p className="text-sm text-gray-400">…</p>` blocks in DOM order |
| Colour states in JSX | `algorithms.json` → `site.legend` + `static/css/styles.css` | same hex values (blue/red/green/yellow/purple) |
| Tailwind utility classes | `site/static/css/styles.css` | hand-written CSS with the same palette, radii, spacing, gradients |
| `lucide-react` icons | inline SVG in `site/build.py` (`ICONS`) + `templates/partials/icons.html` | lucide geometry, no dependency |
| `bubbleSortStep` / `quickSortStep` / `mergeSortStep` | `site/static/js/algorithms.js` | rewritten as pure frame generators (see deviations) |
| React state in `App` | `site/static/js/app.js` | explicit state object, same controls and defaults |
| `index.html` + `src/main.tsx` | `site/templates/base.html` + `index.html` | Jinja2 template inheritance |

Nothing was copied from `node_modules/`, no secrets were involved, and the
legacy `package.json`/`vite.config.ts`/`tsconfig.json` are untouched.

## 3. Deliberate deviations

| # | Legacy behaviour | New behaviour | Why |
| --- | --- | --- | --- |
| 1 | Playback stopped after `arraySize * 2` steps, often leaving the array unsorted | Steps come from the real algorithm, so every run finishes sorted | A visualizer that ends unsorted is a bug; tests assert the final frame is sorted for all three algorithms |
| 2 | Quick/merge "steps" were shallow-copy mutations that did not implement the algorithms | Lomuto quick sort and bottom-up merge sort, both fully stepped | Correctness; same visual grammar (pivot yellow, merging purple) |
| 3 | Comparisons/swaps were synthetic counters | Counted from real comparisons and swaps (merge counts element writes) | Statistics should mean something; values are asserted in tests |
| 4 | "Total Steps: 40" was a fixed `2n` guess | Total is the actual frame count for the current run | Progress bar matches reality |
| 5 | "Skip to end" advanced ~1 step because of React state batching | Jumps to the final frame | Matches its label |
| 6 | Legend listed only Normal/Comparing/Sorted | Legend also lists Pivot and Merging (colours the step copy already used) | Removes a documented-but-invisible colour |
| 7 | Client-rendered only; empty HTML shell for crawlers | Algorithm copy, controls and explanation are server-rendered | Static site benefit; `<noscript>` note explains what needs JS |
| 8 | `Speed: 500ms` mapped to `1000 - speed` ms | Unchanged (`algorithms.delayForSpeed`) | Preserves the familiar slider feel |
| 9 | Array size/speed ranges 10–40 and 100–900/100 | Unchanged, driven by `algorithms.json` | Parity |

Default state is identical to production: Bubble Sort, 20 bars, 500ms,
`Comparisons: 0`, `Swaps: 0`, `Step: 0`.

## 4. Build and test evidence

```bash
python3 -m venv .venv && .venv/bin/pip install -r site/requirements-dev.txt
npm --prefix site/tests/js install
.venv/bin/python site/build.py          # → site/dist (7 files, ~50 KiB)
.venv/bin/python -m pytest site/tests -q      # 38 passed
(cd site/tests/js && node --test)              # 22 passed
```

Coverage highlights:

* **Engine (Node)** — every algorithm sorts its input, frames never invent or
  lose values, counters never decrease, exact comparison/swap counts for known
  inputs, determinism, value range 5–99, size clamps, `1000 - speed` mapping.
* **DOM (jsdom + esbuild against the real `site/dist/index.html`)** — 20 bars on
  boot, stepping updates counters and the explanation, skip-to-end leaves the
  bars sorted and the progress bar at 100%, previous/restart, algorithm
  switching (panels, `aria-pressed`, timeline reset), size slider 10/40,
  speed label, play advances then pause stops, "generate new array" resets.
* **Build (pytest)** — page structure, every local `href`/`src` resolves,
  assets copied byte-for-byte, JSON published unchanged, embedded config parses,
  no unrendered Jinja syntax, deterministic rebuild, stale output removed,
  invalid data rejected with clear errors, output under 512 KiB.
* **Parity** — every phrase recorded from the live site before migration is
  present in the new page (`tests/fixtures/live_baseline_2026-11-24.txt`), and
  algorithm name/description/complexity are re-checked against `src/App.tsx`
  (auto-skipped once the legacy source is deleted).

## 5. Staging (next step, not done)

Production Render settings are dashboard-only, so they must be read, not
guessed. Before creating anything:

1. Render dashboard → `algorithm-visualizer-tzld` → Settings. Record **runtime
   (static vs web)**, **root directory**, **build command**, **publish
   directory**, **branch**, auto-deploy setting.
2. Create a **separate** static site (name `algorithm-visualizer-staging`) from
   the same repo on branch `arena/69228659-algorithm-visualizer`:
   * Runtime: Static Site
   * Root directory: `.`
   * Build command: `pip install -r site/requirements.txt && python3 site/build.py`
   * Publish directory: `site/dist`
   * Env: `PYTHON_VERSION=3.11.2`
   (`site/render-staging.yaml` holds the same values in blueprint form. It is
   deliberately *not* named `render.yaml` so no blueprint sync can touch the
   production service.)
3. Verify on staging: HTTP 200, correct title, all three algorithms animate to a
   sorted state, sliders/pause work, `/data/algorithms.json` returns 200 JSON,
   no console errors, first paint under ~1s.
4. Compare side by side with https://algorithm-visualizer-tzld.onrender.com.

## 6. Cutover (gated on the above)

Only after staging matches the live site on the checklist in `BASELINE.md`:

1. Record the current production settings and the deploying commit (`9e79d9f`).
2. Merge this branch to `main` with the production service still pointing at the
   legacy build (no Render change yet).
3. In Render, switch production to the static-site settings from §5, deploy,
   and verify the live URL.
4. If anything fails: set production back to the recorded build command/publish
   directory (or redeploy commit `9e79d9f`) and confirm
   https://algorithm-visualizer-tzld.onrender.com serves the React app again.

## 7. Cleanup (only after a proven cutover)

* Delete `src/`, `index.html`, `vite.config.ts`, `tsconfig.json`,
  `postcss.config.js`, `package.json`, `package-lock.json`, and the committed
  `node_modules/` (removes ~6,900 tracked files and the TypeScript majority of
  the repo's language stats).
* Rewrite the root `README.md` for the Python build; keep the algorithm
  explanations and add the new commands.
* Retire `site/scripts/export_data.py` (it reads the deleted source) and the
  legacy-parity tests, which already skip when `src/App.tsx` is gone.
* Re-run `site/build.py` + both test suites, then confirm GitHub's language
  breakdown reports HTML/CSS/JavaScript/Python instead of TypeScript.
