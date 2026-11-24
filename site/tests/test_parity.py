"""Parity checks: the static site must say what the live production app says.

These tests read the legacy React source *read-only*.  Once the old app is
removed they skip automatically, so the suite keeps passing after cleanup.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

LEGACY_UI_STRINGS = (
    "Algorithm Selection",
    "Array Controls",
    "Visualization",
    "Step-by-Step Explanation",
    "Generate New Array",
    "Comparisons:",
    "Swaps:",
    "Total Steps:",
    "Slow",
    "Medium",
    "Fast",
    "Normal",
    "Comparing",
    "Sorted",
    "Pivot",
    "Merging",
)


def legacy_field(source: str, field: str) -> list[str]:
    return re.findall(rf"{field}: '([^']*)'", source)


def test_algorithm_metadata_matches_legacy(built_html: str, legacy_app_source: str) -> None:
    for field in ("name", "description", "complexity"):
        values = legacy_field(legacy_app_source, field)
        assert values, f"no {field} found in legacy source"
        for value in values:
            assert value in built_html, f"legacy {field} {value!r} missing from new page"


def test_legacy_ui_labels_are_preserved(built_html: str) -> None:
    for label in LEGACY_UI_STRINGS:
        assert label in built_html, f"legacy label {label!r} missing from new page"


def test_html_title_matches_legacy_index(built_html: str, repo_root) -> None:
    legacy_index = repo_root / "index.html"
    if not legacy_index.exists():
        pytest.skip("legacy index.html removed after cutover")
    match = re.search(r"<title>(.*?)</title>", legacy_index.read_text(encoding="utf-8"))
    assert match
    assert f"<title>{match.group(1)}</title>" in built_html


def test_footer_copy_matches_legacy(built_html: str, legacy_app_source: str) -> None:
    assert "Algorithm Visualization Tool" in legacy_app_source
    assert "Algorithm Visualization Tool" in built_html
    assert "Click on algorithm buttons to switch between Bubble Sort, Quick Sort, and Merge Sort" in built_html


def test_palette_matches_legacy_states(built_html: str, data: dict) -> None:
    colors = {entry["label"]: entry["color"] for entry in data["site"]["legend"]}
    assert colors == {
        "Normal": "#3b82f6",
        "Comparing": "#ef4444",
        "Sorted": "#22c55e",
        "Pivot": "#eab308",
        "Merging": "#a855f7",
    }
    for color in colors.values():
        assert color in built_html


def test_no_react_bundle_artifacts_in_output(built: Path) -> None:
    names = {path.name for path in built.rglob("*") if path.is_file()}
    assert not any(name.endswith(".tsx") for name in names)
    assert "main.tsx" not in names
    assert not any(name.startswith("index-") and name.endswith(".js") for name in names)
