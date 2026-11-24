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

## 5. Cutover

The cutover uses Render's **auto-deploy on `main`**, so the merge itself is the
deploy trigger. Because the production service's build command was never
readable from this environment, the repository was made to satisfy the most
likely configuration *and* the explicitly documented one:

| Render setting | Recommended (dashboard) | What the repo also supports |
| --- | --- | --- |
| Publish directory | `dist` | `dist` (only) |
| Build command | `bash scripts/build.sh dist` | `npm install && npm run build`, `npm ci && npm run build`, `npm run build` — `package.json` has **no dependencies** and its `build` script calls the same `scripts/build.sh` |
| Root directory | `.` (default) | `.` (default) |
| Env | optional `PYTHON_VERSION=3.11.2` | build only needs Python 3.9+ |

`scripts/build.sh` tries, in order: Jinja2 already importable → isolated
`.venv` → `pip --user` → `pip --break-system-packages`, then runs
`site/build.py`. It therefore survives the Debian `externally-managed-environment`
policy that plain `pip install` hits (the reason the venv step exists).

Safety properties relied on:

* **Failed builds do not take the site down.** Render static-site builds are
  atomic — the previously deployed version keeps serving until a build succeeds.
* The build is reproducible: deterministic output, no network at render time,
  no secrets, no database.
* The legacy app was deleted from `main` in the same change, so a rollback is
  `git revert` of the cutover commit (restores `src/`, `vite.config.ts`,
  `package.json` deps and the committed `node_modules/`), which auto-deploys the
  previous React app again.

### Order of operations performed

1. `git fetch origin` + `git merge origin/main` on the feature branch — already
   up to date at `9e79d9f`.
2. Transition commit on `arena/69228659-algorithm-visualizer`: build output moved
   to the publish directory `dist/`, added `scripts/build.sh`, `scripts/test.sh`
   and a dependency-free `package.json`, deleted the legacy
   `src/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `postcss.config.js`
   and the committed `node_modules/`, rewrote `README.md`.
3. Full test run on that commit (see §6) and a clean-checkout dry run of the
   deploy command (`git archive` → `npm install` → `npm run build`).
4. Pull request from the feature branch into `main`, merged with
   `gh pr merge --merge`.
5. Live verification of https://algorithm-visualizer-tzld.onrender.com after
   Render's auto-deploy.

## 6. Evidence (final state)

```bash
bash scripts/build.sh dist        # → dist (7 files, ~50 KiB)
.venv/bin/python -m pytest site/tests -q   # build, output, export, parity
(cd site/tests/js && node --test)          # engine + DOM behaviour
```

Parity beyond the copied copy: `tests/fixtures/live_baseline_2026-11-24.txt`
holds the exact text production served before the migration, and
`tests/test_live_baseline.py` fails if any of it stops being rendered. That
suite is independent of the deleted legacy source, so it keeps guarding future
changes.

## 7. Cleanup (done in the cutover commit)

* Deleted `src/`, `index.html`, `vite.config.ts`, `tsconfig.json`,
  `postcss.config.js` and the committed `node_modules/` — the tracked file count
  dropped from **6,922 to ~30**, and TypeScript is no longer part of the repo.
* `package.json` / `package-lock.json` remain only as dependency-free shims so
  any npm-shaped Render build command still resolves.
* `site/scripts/export_data.py` is kept as the provenance of
  `site/data/algorithms.json`; its default `--source` no longer exists, so it
  fails with a clear message. Tests that read the legacy source skip
  automatically.
* `README.md` rewritten for the Python build; `site/docs/BASELINE.md` retained as
  the pre-migration snapshot.
* Language breakdown: after the merge, GitHub should report HTML/CSS/JavaScript/
  Python instead of TypeScript — check the repository sidebar.
