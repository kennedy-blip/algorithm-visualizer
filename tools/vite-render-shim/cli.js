#!/usr/bin/env node
/**
 * Compatibility shim for the Render static-site build command:
 *
 *     npm ci && ./node_modules/.bin/vite build
 *
 * That command was written for the legacy Vite/React app and calls the Vite
 * binary by path, so it cannot be redirected from an npm script. This package
 * is installed from `file:tools/vite-render-shim` and provides a `vite` bin that
 * renders the current static site (site/) into dist/ via scripts/build.sh.
 *
 * It ignores its arguments: any invocation builds the site. Replace the Render
 * build command with `bash scripts/build.sh dist` and this shim can be removed.
 */
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function repoRoot() {
  // Render runs build commands from the repository root. Fall back to walking
  // up from this script (works whether npm symlinked or copied the file dep).
  const candidates = [process.cwd(), path.resolve(__dirname, "..", "..")];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "scripts", "build.sh"))) return dir;
  }
  return process.cwd();
}

const root = repoRoot();
const script = path.join(root, "scripts", "build.sh");

console.warn(
  "[vite-render-shim] `vite` was invoked by the Render build command; " +
    "rendering the static site instead (vite is no longer used)."
);

const result = spawnSync("bash", [script, "dist"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(`[vite-render-shim] failed to run ${script}: ${result.error.message}`);
  process.exit(1);
}

const status = result.status === null ? 1 : result.status;

// Exit code 3 means "no Python interpreter in this build image". The committed
// dist/ (verified fresh by site/tests/test_render_compat.py) is published
// instead, so the deploy still ships the current site. Any other failure is a
// real build error and must fail the deploy.
if (status === 3) {
  const prebuilt = path.join(root, "dist", "index.html");
  if (fs.existsSync(prebuilt)) {
    console.warn(
      "[vite-render-shim] Python is unavailable in this build image; " +
        "publishing the committed dist/ instead. Regenerate it with " +
        "`bash scripts/build.sh` whenever site/ changes."
    );
    process.exit(0);
  }
  console.error("[vite-render-shim] Python is unavailable and no committed dist/ exists.");
}

process.exit(status);
