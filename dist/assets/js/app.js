/**
 * UI controller for the static Algorithm Visualization page.
 *
 * All sorting logic lives in algorithms.js (pure, unit-tested).  This module
 * only owns DOM state: playback timer, slider labels, counters and the bars.
 */

import {
  buildFrames,
  clampSize,
  delayForSpeed,
  generateValues,
} from "./algorithms.js";

const CONFIG = JSON.parse(document.getElementById("av-config")?.textContent || "{}");
const DEFAULTS = (CONFIG.site && CONFIG.site.defaults) || {};
const ALGORITHMS = (CONFIG.algorithms || []).reduce((acc, algo) => {
  acc[algo.key] = algo;
  return acc;
}, {});

const ICONS = {
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
};

const state = {
  algorithm: DEFAULTS.algorithm || "bubble",
  size: clampSize(DEFAULTS.array_size ?? 20),
  speed: Number(DEFAULTS.speed ?? 500),
  values: [],
  frames: [],
  index: 0,
  playing: false,
  timer: null,
};

const el = {};

function cacheElements() {
  const ids = [
    "chart",
    "stat-comparisons",
    "stat-swaps",
    "step-current",
    "step-total",
    "progress-bar",
    "progress-track",
    "toggle-play",
    "step-back",
    "step-forward",
    "restart",
    "skip-to-end",
    "reset-array",
    "array-size",
    "array-size-value",
    "speed",
    "speed-value",
    "explanation-text",
    "explanation-label",
  ];
  for (const id of ids) {
    el[id] = document.getElementById(id);
  }
  el.algoButtons = Array.from(document.querySelectorAll("[data-algorithm]"));
  el.panels = Array.from(document.querySelectorAll("[data-algo-panel]"));
}

/* ---------------- rendering ---------------- */

function ensureBars() {
  const frame = currentFrame();
  const chart = el.chart;
  if (!chart || !frame) return [];

  const existing = Array.from(chart.querySelectorAll(".chart__bar"));
  if (existing.length !== frame.values.length) {
    chart.textContent = "";
    const fragment = document.createDocumentFragment();
    frame.values.forEach(() => {
      const bar = document.createElement("div");
      bar.className = "chart__bar";
      const label = document.createElement("span");
      label.className = "chart__value";
      bar.append(label);
      fragment.append(bar);
    });
    chart.append(fragment);
  }
  return Array.from(chart.querySelectorAll(".chart__bar"));
}

function renderChart() {
  const frame = currentFrame();
  if (!frame) return;
  const bars = ensureBars();
  chartScale(bars.length);
  frame.values.forEach((value, index) => {
    const bar = bars[index];
    if (!bar) return;
    bar.style.height = `${value}%`;
    bar.dataset.state = frame.states[index] || "normal";
    const label = bar.firstElementChild;
    if (label && label.textContent !== String(value)) {
      label.textContent = String(value);
    }
    bar.setAttribute("title", `Index ${index}: ${value}`);
  });
}

function chartScale(count) {
  const chart = el.chart;
  if (!chart) return;
  chart.classList.toggle("chart--large", count <= 24);
}

function renderStats() {
  const frame = currentFrame();
  if (!frame) return;
  el["stat-comparisons"].textContent = String(frame.comparisons);
  el["stat-swaps"].textContent = String(frame.swaps);
}

function renderPlayback() {
  const total = state.frames.length;
  el["step-current"].textContent = String(state.index);
  el["step-total"].textContent = String(Math.max(0, total - 1));
  const percent = total > 1 ? (state.index / (total - 1)) * 100 : 0;
  el["progress-bar"].style.width = `${percent}%`;
  el["progress-track"].setAttribute("aria-valuenow", String(Math.round(percent)));
  el["step-back"].disabled = state.index === 0;
  el["step-forward"].disabled = state.index >= total - 1;
  setPlayIcon();
}

function setPlayIcon() {
  const button = el["toggle-play"];
  if (!button) return;
  button.innerHTML = `<svg class="icon icon--lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${
    state.playing ? ICONS.pause : ICONS.play
  }</svg>`;
  button.setAttribute("aria-label", state.playing ? "Pause" : "Play");
  button.setAttribute("aria-pressed", state.playing ? "true" : "false");
}

function renderExplanation() {
  const frame = currentFrame();
  const algo = ALGORITHMS[state.algorithm];
  if (!frame || !algo) return;
  el["explanation-label"].textContent = `Step ${state.index}:`;
  el["explanation-label"].style.setProperty("--step-color", algo.accent_hex);
  el["explanation-text"].textContent = frame.description;
}

function render() {
  renderChart();
  renderStats();
  renderPlayback();
  renderExplanation();
}

function currentFrame() {
  return state.frames[state.index];
}

/* ---------------- state transitions ---------------- */

function regenerate({ keepFrames = false } = {}) {
  state.values = generateValues(state.size);
  state.frames = buildFrames(state.algorithm, state.values);
  state.index = 0;
  if (!keepFrames) pause();
  render();
}

function rebuildForAlgorithm() {
  pause();
  state.frames = buildFrames(state.algorithm, state.values);
  state.index = 0;
  updateAlgorithmUI();
  render();
}

function updateAlgorithmUI() {
  const algo = ALGORITHMS[state.algorithm];
  el.algoButtons.forEach((button) => {
    const active = button.dataset.algorithm === state.algorithm;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  el.panels.forEach((panel) => {
    panel.hidden = panel.dataset.algoPanel !== state.algorithm;
  });
  document.body.dataset.algorithm = state.algorithm;
  if (algo) {
    el["explanation-label"].style.setProperty("--step-color", algo.accent_hex);
  }
}

function goTo(index) {
  const clamped = Math.min(Math.max(index, 0), state.frames.length - 1);
  if (clamped === state.index) return;
  state.index = clamped;
  render();
}

function play() {
  if (state.playing) return;
  if (state.index >= state.frames.length - 1) state.index = 0;
  state.playing = true;
  schedule();
  render();
}

function pause() {
  state.playing = false;
  stopTimer();
  setPlayIcon();
}

function stopTimer() {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

function schedule() {
  stopTimer();
  if (!state.playing) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    if (state.index >= state.frames.length - 1) {
      pause();
      render();
      return;
    }
    goTo(state.index + 1);
    schedule();
  }, delayForSpeed(state.speed));
}

function togglePlay() {
  if (state.playing) {
    pause();
    render();
  } else {
    play();
  }
}

/* ---------------- wiring ---------------- */

function bindEvents() {
  el.algoButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.algorithm === button.dataset.algorithm) return;
      state.algorithm = button.dataset.algorithm;
      rebuildForAlgorithm();
    });
  });

  el["toggle-play"].addEventListener("click", togglePlay);
  el["step-back"].addEventListener("click", () => {
    pause();
    goTo(state.index - 1);
  });
  el["step-forward"].addEventListener("click", () => {
    pause();
    goTo(state.index + 1);
  });
  el.restart.addEventListener("click", () => {
    pause();
    goTo(0);
  });
  el["skip-to-end"].addEventListener("click", () => {
    pause();
    goTo(state.frames.length - 1);
  });
  el["reset-array"].addEventListener("click", () => regenerate());

  el["array-size"].addEventListener("input", (event) => {
    state.size = clampSize(event.target.value);
    el["array-size-value"].textContent = String(state.size);
    regenerate();
  });

  el.speed.addEventListener("input", (event) => {
    state.speed = Number(event.target.value);
    el["speed-value"].textContent = String(state.speed);
    if (state.playing) schedule();
  });

  document.addEventListener("keydown", (event) => {
    const tag = (event.target && event.target.tagName) || "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      pause();
      goTo(state.index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      pause();
      goTo(state.index - 1);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
}

function init() {
  cacheElements();
  if (!el.chart) return;
  state.values = generateValues(state.size);
  state.frames = buildFrames(state.algorithm, state.values);
  el["array-size"].value = String(state.size);
  el["array-size-value"].textContent = String(state.size);
  el.speed.value = String(state.speed);
  el["speed-value"].textContent = String(state.speed);
  updateAlgorithmUI();
  bindEvents();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
