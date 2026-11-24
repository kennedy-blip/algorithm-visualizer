#!/usr/bin/env python3
"""Export algorithm metadata from the legacy React app into static JSON.

The legacy application (``src/App.tsx`` at the repository root) is treated as a
**read-only reference**: this script never modifies it, it only parses the
``getAlgorithmInfo()`` switch statement and writes the result to
``site/data/algorithms.json``.

Fields that only existed as JSX/behaviour in the legacy app (icons, Tailwind
colour tokens, long-form explanations) are declared in ``CURATED`` below and
merged onto the extracted metadata.  Everything the legacy source states about
an algorithm (name, one-line description, time complexity) is copied verbatim
and verified by ``site/tests/test_legacy_parity.py``.

Usage:
    python3 site/scripts/export_data.py [--source PATH] [--output PATH]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SITE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = SITE_DIR.parent
DEFAULT_SOURCE = REPO_ROOT / "src" / "App.tsx"
DEFAULT_OUTPUT = SITE_DIR / "data" / "algorithms.json"

ALGORITHM_KEYS = ("bubble", "quick", "merge")

# Icon names used by the legacy app come from lucide-react.  They are mapped to
# inline SVG ids rendered by templates/partials/icon.html.
CURATED: dict[str, dict[str, object]] = {
    "bubble": {
        "accent": "orange",
        "accent_hex": "#f97316",
        "complexity_class": "quadratic",
        "button_label": "bubble Sort",
        "summary": "Repeatedly swap adjacent out-of-order elements until the list is sorted.",
        "notes": [
            "Elements still in play are blue; the pair under comparison turns red and confirmed elements turn green.",
            "The sorted suffix grows by one element after every full pass.",
        ],
        "steps_hint": "One playback step = one adjacent comparison.",
    },
    "quick": {
        "accent": "purple",
        "accent_hex": "#a855f7",
        "complexity_class": "linearithmic",
        "button_label": "quick Sort",
        "summary": "Pick a pivot, partition around it, then sort each side recursively.",
        "notes": [
            "The pivot turns yellow while the partition is being built, and each side is then sorted recursively.",
            "Positions turn green once they have reached their final sorted place.",
        ],
        "steps_hint": "One playback step = one partition comparison or pivot placement.",
    },
    "merge": {
        "accent": "green",
        "accent_hex": "#22c55e",
        "complexity_class": "linearithmic",
        "button_label": "merge Sort",
        "summary": "Split the array into halves, sort each half, then merge them back in order.",
        "notes": [
            "The runs currently being merged are purple and the elements being compared turn red.",
            "Each level of the recursion doubles the length of the sorted runs.",
        ],
        "steps_hint": "One playback step = one merge of a pair of runs.",
    },
}

SITE_TEXT = {
    "title": "Algorithm Visualization - Sorting Algorithms",
    "heading": "Algorithm Visualization",
    "tagline": "Visualize sorting algorithms step by step",
    "footer": [
        "Algorithm Visualization Tool \u2022 Use the controls to visualize sorting algorithms step by step",
        "Click on algorithm buttons to switch between Bubble Sort, Quick Sort, and Merge Sort",
    ],
    "legend": [
        {"key": "normal", "label": "Normal", "color": "#3b82f6"},
        {"key": "comparing", "label": "Comparing", "color": "#ef4444"},
        {"key": "sorted", "label": "Sorted", "color": "#22c55e"},
        {"key": "pivot", "label": "Pivot", "color": "#eab308"},
        {"key": "merging", "label": "Merging", "color": "#a855f7"},
    ],
    "defaults": {"algorithm": "bubble", "array_size": 20, "speed": 500},
    "array_size": {"min": 10, "max": 40, "step": 1},
    "speed": {"min": 100, "max": 900, "step": 100},
}

CASE_RE = re.compile(r"case '(?P<key>[a-z]+)':\s*(?P<body>.*?)\n\s*\};", re.S)
FIELD_RE = {
    "name": re.compile(r"name: '(?P<value>[^']*)'"),
    "description": re.compile(r"description: '(?P<value>[^']*)'"),
    "complexity": re.compile(r"complexity: '(?P<value>[^']*)'"),
    "color": re.compile(r"color: '(?P<value>[^']*)'"),
}
ICON_RE = re.compile(r"icon: <(?P<icon>[A-Z][A-Za-z]*) className")
# The long-form explanation paragraph rendered under "Step-by-Step Explanation".
PARAGRAPH_RE = re.compile(r'<p className="text-sm text-gray-400">\s*(?P<text>.*?)\s*</p>', re.S)


class ExportError(RuntimeError):
    """Raised when the legacy source cannot be parsed as expected."""


def parse_legacy(source: Path) -> dict[str, dict[str, str]]:
    """Return {algorithm key: {name, description, complexity, color, icon}}."""
    if not source.exists():
        raise ExportError(f"legacy source not found: {source}")

    text = source.read_text(encoding="utf-8")
    # Restrict parsing to the getAlgorithmInfo() switch so unrelated switches
    # (e.g. the step dispatcher) cannot contribute fields.
    start = text.find("const getAlgorithmInfo = ()")
    if start == -1:
        raise ExportError("getAlgorithmInfo() not found in legacy source")
    body = text[start:]
    end = body.find("const info = getAlgorithmInfo();")
    if end != -1:
        body = body[:end]

    parsed: dict[str, dict[str, str]] = {}
    for match in CASE_RE.finditer(body):
        key = match.group("key")
        if key not in ALGORITHM_KEYS:
            continue
        case_body = match.group("body")
        record = {}
        for field, pattern in FIELD_RE.items():
            found = pattern.search(case_body)
            if found is None:
                raise ExportError(f"missing '{field}' for algorithm '{key}'")
            record[field] = found.group("value")
        icon = ICON_RE.search(case_body)
        if icon is None:
            raise ExportError(f"missing icon for algorithm '{key}'")
        record["icon"] = icon.group("icon")
        parsed[key] = record

    missing = [key for key in ALGORITHM_KEYS if key not in parsed]
    if missing:
        raise ExportError(f"algorithms missing from legacy source: {missing}")
    return parsed


def parse_explanations(source: Path) -> dict[str, str]:
    """Extract the per-algorithm explanation paragraph, in DOM order."""
    text = source.read_text(encoding="utf-8")
    paragraphs = [
        " ".join(match.group("text").split())
        for match in PARAGRAPH_RE.finditer(text)
        # Skip the short "Time Complexity: {info.complexity}" line in the info
        # card and any paragraph that still contains a JSX expression.
        if len(match.group("text").strip()) > 60 and "{" not in match.group("text")
    ]
    if len(paragraphs) < len(ALGORITHM_KEYS):
        raise ExportError(
            f"expected at least {len(ALGORITHM_KEYS)} explanation paragraphs, found {len(paragraphs)}"
        )
    return dict(zip(ALGORITHM_KEYS, paragraphs))


def build_payload(source: Path) -> dict:
    legacy = parse_legacy(source)
    explanations = parse_explanations(source)
    algorithms = []
    for key in ALGORITHM_KEYS:
        curated = CURATED[key]
        record = dict(legacy[key])
        record.update(
            {
                "key": key,
                "accent": curated["accent"],
                "accent_hex": curated["accent_hex"],
                "complexity_class": curated["complexity_class"],
                "button_label": curated["button_label"],
                "summary": curated["summary"],
                "explanation": explanations[key],
                "notes": curated["notes"],
                "steps_hint": curated["steps_hint"],
            }
        )
        algorithms.append(record)

    return {
        "source": "src/App.tsx",
        "site": SITE_TEXT,
        "algorithms": algorithms,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)

    try:
        payload = build_payload(args.source)
    except ExportError as exc:
        print(f"export failed: {exc}", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {args.output} ({len(payload['algorithms'])} algorithms)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
