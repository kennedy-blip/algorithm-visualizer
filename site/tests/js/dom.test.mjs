/**
 * Browser-behaviour smoke tests for the generated site.
 *
 * The page is loaded from the real build output (site/dist/index.html) inside
 * jsdom, and static/js/app.js is bundled with esbuild (jsdom does not execute
 * <script type="module">).  These tests catch wiring mistakes that the pure
 * engine tests cannot see: missing element ids, wrong slider bounds, broken
 * play/pause, and algorithm switching.
 *
 * Run `python3 site/build.py` (or `npm run build`) first.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(here, "../..");
const distIndex = path.join(siteDir, "dist", "index.html");
const appEntry = path.join(siteDir, "static", "js", "app.js");

if (!existsSync(distIndex)) {
  throw new Error(`missing build output ${distIndex}; run: python3 site/build.py`);
}

const bundle = esbuild.buildSync({
  entryPoints: [appEntry],
  bundle: true,
  format: "iife",
  platform: "browser",
  write: false,
  logLevel: "silent",
}).outputFiles[0].text;

const html = readFileSync(distIndex, "utf-8").replace(
  /<script type="module"[^>]*><\/script>/,
  ""
);

async function boot() {
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
  const { window } = dom;
  const errors = [];
  window.addEventListener("error", (event) => errors.push(event.error || event.message));
  window.eval(bundle);
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  return { dom, window, document: window.document, errors };
}

const bars = (document) => Array.from(document.querySelectorAll(".chart__bar"));
const heights = (document) => bars(document).map((bar) => parseFloat(bar.style.height));
test("page boots with 20 bars and zeroed counters", async () => {
  const { window, document, errors } = await boot();
  assert.deepEqual(errors, []);
  assert.equal(document.title, "Algorithm Visualization - Sorting Algorithms");
  assert.equal(bars(document).length, 20);
  assert.equal(document.getElementById("stat-comparisons").textContent, "0");
  assert.equal(document.getElementById("stat-swaps").textContent, "0");
  assert.equal(document.getElementById("step-current").textContent, "0");
  assert.ok(Number(document.getElementById("step-total").textContent) > 1);
  assert.equal(document.getElementById("toggle-play").getAttribute("aria-label"), "Play");
  heights(document).forEach((height) => assert.ok(height >= 5 && height <= 99));
});

test("stepping forward updates the counters and the explanation", async () => {
  const { document } = await boot();
  const next = document.getElementById("step-forward");
  next.dispatchEvent(new document.defaultView.Event("click", { bubbles: true }));
  assert.equal(document.getElementById("step-current").textContent, "1");
  assert.equal(document.getElementById("stat-comparisons").textContent, "1");
  assert.match(document.getElementById("explanation-text").textContent, /Comparing adjacent elements/);
  assert.ok(
    bars(document).some((bar) => bar.dataset.state === "comparing"),
    "the compared pair is highlighted"
  );
});

test("skip-to-end sorts the array and fills the progress bar", async () => {
  const { document } = await boot();
  document
    .getElementById("skip-to-end")
    .dispatchEvent(new document.defaultView.Event("click", { bubbles: true }));
  const values = heights(document);
  assert.deepEqual(values, values.slice().sort((a, b) => a - b));
  assert.equal(
    bars(document).every((bar) => bar.dataset.state === "sorted"),
    true
  );
  assert.equal(document.getElementById("progress-bar").style.width, "100%");
  assert.match(document.getElementById("explanation-text").textContent, /fully sorted/);
  assert.equal(document.getElementById("step-forward").disabled, true);
});

test("previous step and restart walk back to step zero", async () => {
  const { document } = await boot();
  const win = document.defaultView;
  document.getElementById("skip-to-end").dispatchEvent(new win.Event("click", { bubbles: true }));
  document.getElementById("step-back").dispatchEvent(new win.Event("click", { bubbles: true }));
  assert.notEqual(document.getElementById("step-current").textContent, "0");
  document.getElementById("restart").dispatchEvent(new win.Event("click", { bubbles: true }));
  assert.equal(document.getElementById("step-current").textContent, "0");
  assert.equal(document.getElementById("step-back").disabled, true);
  assert.equal(document.getElementById("stat-comparisons").textContent, "0");
});

test("switching algorithms swaps panels and rebuilds the timeline", async () => {
  const { document } = await boot();
  const win = document.defaultView;
  const quick = document.querySelector('[data-algorithm="quick"]');
  quick.dispatchEvent(new win.Event("click", { bubbles: true }));

  assert.equal(quick.getAttribute("aria-pressed"), "true");
  assert.equal(
    document.querySelector('[data-algorithm="bubble"]').getAttribute("aria-pressed"),
    "false"
  );
  const bubblePanel = document.querySelector('[data-algo-panel="bubble"]');
  const quickPanel = document.querySelector('[data-algo-panel="quick"]');
  assert.equal(bubblePanel.hidden, true);
  assert.equal(quickPanel.hidden, false);
  assert.match(document.getElementById("explanation-text").textContent, /quick sort/);
  assert.equal(document.getElementById("step-current").textContent, "0");
  assert.ok(Number(document.getElementById("step-total").textContent) > 1);
});

test("array-size slider rebuilds the bars within the 10-40 bounds", async () => {
  const { document } = await boot();
  const win = document.defaultView;
  const slider = document.getElementById("array-size");

  slider.value = "10";
  slider.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert.equal(bars(document).length, 10);
  assert.equal(document.getElementById("array-size-value").textContent, "10");

  slider.value = "40";
  slider.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert.equal(bars(document).length, 40);
  assert.equal(document.getElementById("array-size-value").textContent, "40");
  assert.equal(document.getElementById("step-current").textContent, "0");
});

test("speed slider relabels without touching the array", async () => {
  const { document } = await boot();
  const win = document.defaultView;
  const before = heights(document);
  const speed = document.getElementById("speed");
  speed.value = "900";
  speed.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert.equal(document.getElementById("speed-value").textContent, "900");
  assert.deepEqual(heights(document), before);
});

test("play advances automatically and pause stops it", async () => {
  const { window, document } = await boot();
  const win = document.defaultView;
  const speed = document.getElementById("speed");
  speed.value = "900";
  speed.dispatchEvent(new win.Event("input", { bubbles: true }));

  document.getElementById("toggle-play").dispatchEvent(new win.Event("click", { bubbles: true }));
  assert.equal(document.getElementById("toggle-play").getAttribute("aria-label"), "Pause");
  await new Promise((resolve) => window.setTimeout(resolve, 350));

  const advanced = Number(document.getElementById("step-current").textContent);
  assert.ok(advanced >= 2, `expected at least two automatic steps, saw ${advanced}`);

  document.getElementById("toggle-play").dispatchEvent(new win.Event("click", { bubbles: true }));
  assert.equal(document.getElementById("toggle-play").getAttribute("aria-label"), "Play");
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  assert.equal(
    Number(document.getElementById("step-current").textContent),
    advanced,
    "paused playback must not advance"
  );
});

test("generate-new-array resets the run", async () => {
  const { document } = await boot();
  const win = document.defaultView;
  document.getElementById("skip-to-end").dispatchEvent(new win.Event("click", { bubbles: true }));
  document.getElementById("reset-array").dispatchEvent(new win.Event("click", { bubbles: true }));
  assert.equal(document.getElementById("step-current").textContent, "0");
  assert.equal(document.getElementById("stat-comparisons").textContent, "0");
  assert.equal(bars(document).length, 20);
});
