/**
 * Sorting-algorithm step engine.
 *
 * Pure, dependency-free ES module.  It turns an array of numbers into a list of
 * immutable "frames" (array snapshot + colour states + running counters), which
 * the UI in app.js simply plays back.  Keeping the engine pure means the exact
 * same code can be unit-tested with `node --test` (see tests/js).
 *
 * Colour states mirror the legacy React app: blue normal, red comparing,
 * green sorted, yellow pivot, purple merging.
 */

export const NORMAL = "normal";
export const COMPARING = "comparing";
export const SORTED = "sorted";
export const PIVOT = "pivot";
export const MERGING = "merging";

/** Values produced by the legacy `generateRandomArray`: integers 5..99. */
export const VALUE_MIN = 5;
export const VALUE_MAX = 99;

/** Deterministic PRNG (mulberry32) used by tests and by ?seed= deep links. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateValues(size, random = Math.random) {
  const n = clampSize(size);
  return Array.from({ length: n }, () =>
    Math.floor(random() * (VALUE_MAX - VALUE_MIN + 1)) + VALUE_MIN
  );
}

export function clampSize(size) {
  const n = Math.trunc(Number(size));
  if (!Number.isFinite(n)) return 20;
  return Math.min(40, Math.max(10, n));
}

function statesFor(length, fill = NORMAL) {
  return Array.from({ length }, () => fill);
}

function frame(values, states, counters, description, meta = {}) {
  return {
    values: values.slice(),
    states: states.slice(),
    comparisons: counters.comparisons,
    swaps: counters.swaps,
    description,
    ...meta,
  };
}

/**
 * Bubble sort, one frame per adjacent comparison.
 * The sorted suffix is painted green as each pass completes.
 */
export function bubbleSortFrames(values) {
  const n = values.length;
  const work = values.slice();
  const counters = { comparisons: 0, swaps: 0 };
  const frames = [
    frame(
      work,
      statesFor(n),
      counters,
      "Initial array generated. Ready to start sorting.",
      { phase: "init" }
    ),
  ];

  for (let pass = 0; pass < n - 1; pass += 1) {
    let swapped = false;
    for (let j = 0; j < n - pass - 1; j += 1) {
      counters.comparisons += 1;
      const states = statesFor(n);
      for (let k = n - pass; k < n; k += 1) states[k] = SORTED;
      states[j] = COMPARING;
      states[j + 1] = COMPARING;
      if (work[j] > work[j + 1]) {
        [work[j], work[j + 1]] = [work[j + 1], work[j]];
        counters.swaps += 1;
        swapped = true;
      }
      frames.push(
        frame(
          work,
          states,
          counters,
          `Comparing adjacent elements. Pass ${pass + 1} of ${Math.max(
            1,
            n - 1
          )}.`,
          { phase: "compare", indices: [j, j + 1] }
        )
      );
    }
    if (!swapped) break;
  }

  frames.push(
    frame(
      work,
      statesFor(n, SORTED),
      counters,
      "Sorting complete! Array is fully sorted.",
      { phase: "done" }
    )
  );
  return frames;
}

/** Quick sort (Lomuto partition, last element as pivot). */
export function quickSortFrames(values) {
  const n = values.length;
  const work = values.slice();
  const counters = { comparisons: 0, swaps: 0 };
  const frames = [
    frame(
      work,
      statesFor(n),
      counters,
      "Initial array generated. Ready to start quick sort.",
      { phase: "init" }
    ),
  ];

  const partition = (low, high) => {
    const pivotValue = work[high];
    let i = low - 1;
    for (let j = low; j < high; j += 1) {
      counters.comparisons += 1;
      const states = statesFor(n);
      for (let k = 0; k < n; k += 1) {
        if (k < low || k > high) states[k] = SORTED;
      }
      states[high] = PIVOT;
      states[j] = COMPARING;
      frames.push(
        frame(
          work,
          states,
          counters,
          `Partitioning array around pivot element ${pivotValue}.`,
          { phase: "partition", indices: [j, high], pivotValue }
        )
      );
      if (work[j] < pivotValue) {
        i += 1;
        if (i !== j) {
          [work[i], work[j]] = [work[j], work[i]];
          counters.swaps += 1;
        }
      }
    }
    const pivotIndex = i + 1;
    if (pivotIndex !== high) {
      [work[pivotIndex], work[high]] = [work[high], work[pivotIndex]];
      counters.swaps += 1;
    }
    const states = statesFor(n);
    for (let k = 0; k < n; k += 1) {
      if (k < low || k > high) states[k] = SORTED;
    }
    states[pivotIndex] = SORTED;
    frames.push(
      frame(
        work,
        states,
        counters,
        `Pivot ${pivotValue} is in its final position (index ${pivotIndex}).`,
        { phase: "pivot-placed", pivotIndex }
      )
    );
    return pivotIndex;
  };

  const stack = [[0, n - 1]];
  while (stack.length > 0) {
    const [low, high] = stack.pop();
    if (low < high) {
      const pivotIndex = partition(low, high);
      stack.push([pivotIndex + 1, high]);
      stack.push([low, pivotIndex - 1]);
    }
  }

  frames.push(
    frame(
      work,
      statesFor(n, SORTED),
      counters,
      "Sorting complete! Array is fully sorted.",
      { phase: "done" }
    )
  );
  return frames;
}

/**
 * Merge sort (bottom-up).  One frame per comparison while merging; `swaps`
 * counts element writes back into the array, which is the closest analogue to a
 * swap for a merge-based algorithm.
 */
export function mergeSortFrames(values) {
  const n = values.length;
  const work = values.slice();
  const counters = { comparisons: 0, swaps: 0 };
  const frames = [
    frame(
      work,
      statesFor(n),
      counters,
      "Initial array generated. Ready to start merge sort.",
      { phase: "init" }
    ),
  ];

  let width = 1;
  let level = 1;
  while (width < n) {
    for (let left = 0; left < n; left += width * 2) {
      const mid = Math.min(left + width, n);
      const right = Math.min(left + width * 2, n);
      if (mid >= right) continue;

      const merged = [];
      let l = left;
      let r = mid;
      while (l < mid && r < right) {
        counters.comparisons += 1;
        const states = statesFor(n);
        for (let k = left; k < right; k += 1) states[k] = MERGING;
        states[l] = COMPARING;
        states[r] = COMPARING;
        frames.push(
          frame(
            work,
            states,
            counters,
            `Merging sorted sub-arrays. Merge level ${level}.`,
            { phase: "merge", indices: [l, r], level }
          )
        );
        if (work[l] <= work[r]) {
          merged.push(work[l]);
          l += 1;
        } else {
          merged.push(work[r]);
          r += 1;
        }
      }
      while (l < mid) {
        merged.push(work[l]);
        l += 1;
      }
      while (r < right) {
        merged.push(work[r]);
        r += 1;
      }

      for (let offset = 0; offset < merged.length; offset += 1) {
        work[left + offset] = merged[offset];
      }
      counters.swaps += merged.length;

      const states = statesFor(n);
      for (let k = left; k < right; k += 1) states[k] = SORTED;
      frames.push(
        frame(
          work,
          states,
          counters,
          `Merged indexes ${left}\u2013${right - 1} at level ${level}.`,
          { phase: "merge-done", level, range: [left, right] }
        )
      );
    }
    width *= 2;
    level += 1;
  }

  frames.push(
    frame(
      work,
      statesFor(n, SORTED),
      counters,
      "Sorting complete! Array is fully sorted.",
      { phase: "done" }
    )
  );
  return frames;
}

export const ALGORITHMS = {
  bubble: { key: "bubble", frames: bubbleSortFrames },
  quick: { key: "quick", frames: quickSortFrames },
  merge: { key: "merge", frames: mergeSortFrames },
};

/** Build the full playback timeline for an algorithm. */
export function buildFrames(algorithmKey, values) {
  const entry = ALGORITHMS[algorithmKey];
  if (!entry) throw new Error(`unknown algorithm: ${algorithmKey}`);
  return entry.frames(values.slice());
}

/** Playback delay in ms.  Mirrors the legacy `1000 - speed` mapping. */
export function delayForSpeed(speed) {
  const clamped = Math.min(900, Math.max(100, Math.trunc(Number(speed)) || 500));
  return 1000 - clamped;
}

/** Convenience helper: the final sorted values of a frame list. */
export function finalValues(frames) {
  return frames[frames.length - 1].values.slice();
}
