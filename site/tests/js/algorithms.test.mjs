import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFrames,
  bubbleSortFrames,
  clampSize,
  createRandom,
  delayForSpeed,
  finalValues,
  generateValues,
  mergeSortFrames,
  quickSortFrames,
  COMPARING,
  MERGING,
  NORMAL,
  PIVOT,
  SORTED,
  VALUE_MAX,
  VALUE_MIN,
} from "../../static/js/algorithms.js";

const VALID_STATES = new Set([NORMAL, COMPARING, SORTED, PIVOT, MERGING]);
const sorted = (values) => values.slice().sort((a, b) => a - b);

function assertFramesSane(frames, input) {
  const first = frames[0];
  const last = frames[frames.length - 1];
  assert.deepEqual(first.values, input, "first frame must be the input array");
  assert.deepEqual(last.values, sorted(input), "last frame must be sorted");
  assert.equal(last.states.every((state) => state === SORTED), true, "last frame is all green");

  let previous = { comparisons: 0, swaps: 0 };
  for (const frame of frames) {
    assert.equal(frame.values.length, input.length);
    assert.equal(frame.states.length, input.length);
    assert.deepEqual(sorted(frame.values), sorted(input), "frames never invent values");
    frame.states.forEach((state) => assert.ok(VALID_STATES.has(state), `bad state ${state}`));
    assert.ok(frame.comparisons >= previous.comparisons, "comparisons never decrease");
    assert.ok(frame.swaps >= previous.swaps, "swaps never decrease");
    assert.equal(typeof frame.description, "string");
    assert.ok(frame.description.length > 0);
    previous = frame;
  }
}

test("bubble sort sorts and counts every adjacent comparison", () => {
  const input = [5, 3, 9, 1];
  const frames = bubbleSortFrames(input);
  assertFramesSane(frames, input);
  // 3 + 2 + 1 passes of comparisons with this worst-case ordering.
  assert.equal(frames.at(-1).comparisons, 6);
  assert.equal(frames.at(-1).swaps, 4);
});

test("bubble sort stops early on an already sorted input", () => {
  const input = [1, 2, 3, 4, 5];
  const frames = bubbleSortFrames(input);
  assertFramesSane(frames, input);
  assert.equal(frames.at(-1).comparisons, 4);
  assert.equal(frames.at(-1).swaps, 0);
});

test("bubble sort marks the growing sorted suffix green", () => {
  const frames = bubbleSortFrames([2, 1, 4, 3]);
  // Pass 0 has three comparisons (frames 1-3) and paints nothing green yet.
  assert.equal(frames[2].states.at(-1), NORMAL);
  // Pass 1 starts at frame 4 and the largest element is now final.
  assert.equal(frames[4].states.at(-1), SORTED);
  assert.equal(frames[4].states[0], COMPARING);
});

test("quick sort sorts with a Lomuto partition and reports counters", () => {
  const input = [53, 37, 29, 5, 95, 10, 87, 70];
  const frames = quickSortFrames(input);
  assertFramesSane(frames, input);
  const done = frames.at(-1);
  assert.ok(done.comparisons > 0 && done.comparisons <= (input.length * (input.length - 1)) / 2);
  assert.ok(done.swaps > 0);
  assert.ok(
    frames.some((frame) => frame.states.includes(PIVOT)),
    "pivot colour is used"
  );
  assert.ok(frames.some((frame) => frame.phase === "pivot-placed"));
});

test("quick sort handles duplicates and single-element arrays", () => {
  const duplicates = [7, 7, 7, 3, 3];
  assertFramesSane(quickSortFrames(duplicates), duplicates);
  assertFramesSane(quickSortFrames([42]), [42]);
  assertFramesSane(bubbleSortFrames([42]), [42]);
  assertFramesSane(mergeSortFrames([42]), [42]);
});

test("merge sort sorts with bottom-up merges and counts comparisons exactly", () => {
  const input = [4, 2, 7, 1];
  const frames = mergeSortFrames(input);
  assertFramesSane(frames, input);
  // [4,2] -> 1 comparison, [7,1] -> 1, then [2,4] vs [1,7] -> 3.
  assert.equal(frames.at(-1).comparisons, 5);
  assert.equal(frames.at(-1).swaps, 4 + 4);
  assert.ok(frames.some((frame) => frame.states.includes(MERGING)));
  assert.ok(frames.some((frame) => /Merge level 2/.test(frame.description)));
});

test("merge sort leaves already sorted input sorted with minimum comparisons", () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const frames = mergeSortFrames(input);
  assertFramesSane(frames, input);
  assert.equal(frames.at(-1).comparisons, 12); // 4 + 2 + 2 + 1 + 1 + 1 + 1
  assert.equal(frames.at(-1).swaps, 24);
});

test("every algorithm produces a valid timeline for a full-size array", () => {
  const random = createRandom(20240101);
  const input = generateValues(40, random);
  for (const key of ["bubble", "quick", "merge"]) {
    const frames = buildFrames(key, input);
    assertFramesSane(frames, input);
    assert.deepEqual(finalValues(frames), sorted(input));
    assert.ok(frames.length > 1, `${key} produced only one frame`);
  }
});

test("buildFrames rejects unknown algorithms and does not mutate its input", () => {
  const input = [3, 1, 2];
  buildFrames("bubble", input);
  assert.deepEqual(input, [3, 1, 2]);
  assert.throws(() => buildFrames("heap", input), /unknown algorithm/);
});

test("frames are deterministic", () => {
  const input = [9, 4, 4, 2, 8];
  assert.deepEqual(bubbleSortFrames(input), bubbleSortFrames(input));
  assert.deepEqual(quickSortFrames(input), quickSortFrames(input));
  assert.deepEqual(mergeSortFrames(input), mergeSortFrames(input));
});

test("generateValues honours the legacy 5..99 range and size clamps", () => {
  const random = createRandom(7);
  const values = generateValues(10, random);
  assert.equal(values.length, 10);
  values.forEach((value) => {
    assert.equal(Number.isInteger(value), true);
    assert.ok(value >= VALUE_MIN && value <= VALUE_MAX, `${value} out of range`);
  });
  assert.deepEqual(generateValues(10, createRandom(7)), values, "same seed, same array");
  assert.equal(generateValues(3).length, 10, "below minimum clamps to 10");
  assert.equal(generateValues(400).length, 40, "above maximum clamps to 40");
});

test("clampSize mirrors the slider bounds", () => {
  assert.equal(clampSize(20), 20);
  assert.equal(clampSize("33"), 33);
  assert.equal(clampSize(9), 10);
  assert.equal(clampSize(41), 40);
  assert.equal(clampSize(Number.NaN), 20);
});

test("delayForSpeed keeps the legacy 1000-speed mapping", () => {
  assert.equal(delayForSpeed(100), 900);
  assert.equal(delayForSpeed(500), 500);
  assert.equal(delayForSpeed(900), 100);
  assert.equal(delayForSpeed(5000), 100, "clamped to the slider maximum");
  assert.equal(delayForSpeed("600"), 400);
});
