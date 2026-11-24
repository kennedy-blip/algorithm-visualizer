# Baseline: production app as found (2026-11-24)

Everything here was observed **before** any change, and the legacy app has not
been modified. This is the reference the new static site is checked against.

## Repository

| Item | Value |
| --- | --- |
| Repo | `kennedy-blip/algorithm-visualizer` (public) |
| Branch at inspection | `main`, single commit `9e79d9f` ("first commit") |
| GitHub-reported language | TypeScript |
| Tracked files | 6,922, of which 6,911 are inside the committed `node_modules/` |
| CI | none (no workflows, no deployments recorded on GitHub) |
| Blueprint | none — there is no `render.yaml` in the repo |

## Application

| Item | Value |
| --- | --- |
| Entry point | `index.html` → `/src/main.tsx` → `src/App.tsx` |
| Framework | React 19.2.3 + TypeScript 5.9.3, Tailwind CSS 4 (via `@tailwindcss/vite`) |
| Single component | `src/App.tsx` (~22 KB) holds sorting logic, UI and copy |
| Styling entry | `src/index.css` (`@import "tailwindcss"` + scrollbar/range overrides) |
| Icons | `lucide-react` 0.563.0 |
| Build | `npm run build` → `vite build` |
| Output directory | `dist/` — one self-contained `index.html` thanks to `vite-plugin-singlefile` |
| Dev | `npm run dev` (Vite dev server) |
| Tests | **none** — no test script, no test files, no lint script |
| Type checking | `tsconfig.json` is strict, but `vite build` does not run `tsc`, so type errors do not fail the build |
| Committed artifacts | `node_modules/` is committed, so a clean clone needs no install to build |

Reference algorithm logic lives in three functions in `src/App.tsx`
(`bubbleSortStep`, `quickSortStep`, `mergeSortStep`) plus `performStep`.

## Production deployment

| Item | Value |
| --- | --- |
| Live URL | https://algorithm-visualizer-tzld.onrender.com |
| Status at inspection | HTTP 200, title `Algorithm Visualization - Sorting Algorithms` |
| Host | Render **Static Site**, service name suffix `tzld` |
| Root directory / build command / publish path | **not in the repo** — dashboard-only, must be read from Render before any cutover |
| Inferred settings (unverified) | root `.`, build `npm install && npm run build`, publish `dist` |

Why inference only: the repo contains no blueprint or CI configuration, GitHub
has no deployments, and this environment cannot query the Render API (outbound
network is restricted to GitHub/npm/PyPI). The settings above are what the
single-file Vite build requires; they are **not** evidence. Step 7 of the
migration plan therefore requires confirming them in the Render dashboard before
a staging service is created.

## Observed behaviour on the live site

Default state on load: **Bubble Sort**, **Array Size 20**, **Speed 500ms**,
`Comparisons: 0`, `Swaps: 0`, `Step: 0`, `Total Steps: 40`.

* Header: gradient "Algorithm Visualization" title, tagline "Visualize sorting
  algorithms step by step", chip with `Comparisons: n` and `Swaps: n`.
* Left column: three algorithm buttons (`bubble Sort`, `quick Sort`,
  `merge Sort`); an info card with icon, name, `Time Complexity: …` and a
  one-line description; array controls with size slider (10–40), speed slider
  (100–900, step 100, labelled Slow/Medium/Fast) and "Generate New Array".
* Right column: visualization card with legend (Normal / Comparing / Sorted),
  bars with value labels, playback buttons (previous, play/pause, next, restart,
  skip to end), progress bar and `Step: x` / `Total Steps: y`; then a
  "Step-by-Step Explanation" card with the current step sentence and a
  per-algorithm paragraph.
* Footer: two lines of copy, including "Click on algorithm buttons to switch
  between Bubble Sort, Quick Sort, and Merge Sort".

All of this text is recorded in `tests/fixtures/live_baseline_2026-11-24.txt`
and asserted against the new build by `tests/test_live_baseline.py`, so parity
does not depend on network access in CI.

## Legacy behaviour worth knowing (not changed, only noted)

1. `performStep` stops at `arraySize * 2` steps, but a correct bubble sort needs
   up to `n(n-1)/2` comparisons, so playback frequently ends with an
   **unsorted** array (the first 20-element run on the live site still shows
   unsorted bars at Total Steps 40).
2. `quickSortStep`/`mergeSortStep` operate on a shallow copy of the element
   objects and were not driven by a real algorithm run; the "quick" and "merge"
   visualisations do not converge to a sorted array either.
3. Statistics are synthetic: bubble adds 1 comparison per step, quick adds
   `arraySize`, merge adds `arraySize * log2(arraySize)`.
4. "Skip to end" loops `while (currentStep < arraySize * 2) performStep()`, but
   React batches the state updates, so it advances by roughly one step.
5. The legend omits the Pivot (yellow) and Merging (purple) colours that the
   README and the step copy refer to.

The replacement fixes 1–5 with a real, tested step engine. Each deviation is
listed in `MIGRATION.md` with its rationale.

## Environment available for the migration

| Runtime | Version | Notes |
| --- | --- | --- |
| Node.js | 22.22.3 | available; `node_modules` pre-installed |
| npm | 10.9.8 | available |
| Python | 3.11.2 | available; Jinja2 and pytest installed in `.venv` |
| Ruby / Go / PHP / Java | **not installed** | ruled out as targets |

Outbound network from this sandbox: `github.com`, `codeload.github.com`,
`api.github.com`, `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`.
The live Render host is **not** directly reachable from shell commands (TLS
connections are dropped), so the live page was captured with the page-fetch
tool instead.
