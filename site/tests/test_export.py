"""Tests for the legacy-data exporter (scripts/export_data.py)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

LEGACY_SNIPPET = """
const getAlgorithmInfo = () => {
  switch (algorithm) {
    case 'bubble':
      return {
        name: 'Bubble Sort',
        description: 'Repeatedly steps through the list.',
        complexity: 'O(n²)',
        icon: <Zap className="w-5 h-5" />,
        color: 'bg-orange-500',
      };
    case 'quick':
      return {
        name: 'Quick Sort',
        description: 'Picks a pivot.',
        complexity: 'O(n log n) average',
        icon: <GitBranch className="w-5 h-5" />,
        color: 'bg-purple-500',
      };
    case 'merge':
      return {
        name: 'Merge Sort',
        description: 'Merges halves.',
        complexity: 'O(n log n)',
        icon: <GitMerge className="w-5 h-5" />,
        color: 'bg-green-500',
      };
  }
};
const info = getAlgorithmInfo();

const explanation = (
  <div className="space-y-3">
    {algorithm === 'bubble' && (
      <p className="text-sm text-gray-400">
        Bubble sort works by repeatedly swapping adjacent elements if they are in the wrong order.
        Each pass through the list places the next largest element in its correct position.
      </p>
    )}
    {algorithm === 'quick' && (
      <p className="text-sm text-gray-400">
        Quick sort selects a pivot element and partitions the array into two sub-arrays around it.
        The process is recursively applied to the sub-arrays until everything is sorted.
      </p>
    )}
    {algorithm === 'merge' && (
      <p className="text-sm text-gray-400">
        Merge sort divides the array into halves until each sub-array has one element, then merges
        them back together in sorted order. This is a classic divide-and-conquer algorithm.
      </p>
    )}
  </div>
);
"""


def write_legacy(tmp_path: Path, text: str) -> Path:
    source = tmp_path / "App.tsx"
    source.write_text(text, encoding="utf-8")
    return source


def test_parse_legacy_extracts_three_algorithms(export_module, tmp_path: Path) -> None:
    parsed = export_module.parse_legacy(write_legacy(tmp_path, LEGACY_SNIPPET))
    assert list(parsed) == ["bubble", "quick", "merge"]
    assert parsed["bubble"]["name"] == "Bubble Sort"
    assert parsed["bubble"]["complexity"] == "O(n²)"
    assert parsed["quick"]["icon"] == "GitBranch"
    assert parsed["merge"]["color"] == "bg-green-500"


def test_payload_is_ordered_and_complete(export_module, tmp_path: Path) -> None:
    payload = export_module.build_payload(write_legacy(tmp_path, LEGACY_SNIPPET))
    keys = [algo["key"] for algo in payload["algorithms"]]
    assert keys == ["bubble", "quick", "merge"]
    for algo in payload["algorithms"]:
        for field in (
            "name",
            "description",
            "complexity",
            "accent_hex",
            "button_label",
            "explanation",
            "notes",
            "steps_hint",
            "icon",
        ):
            assert algo[field], f"{algo['key']} missing {field}"
    assert payload["site"]["defaults"] == {"algorithm": "bubble", "array_size": 20, "speed": 500}
    bubble = payload["algorithms"][0]
    assert bubble["explanation"].startswith("Bubble sort works by repeatedly swapping")
    assert "Each pass through the list" in bubble["explanation"]
    assert "\n" not in bubble["explanation"]
    assert len(bubble["notes"]) >= 2
    assert len(payload["site"]["legend"]) == 5


def test_committed_data_matches_current_legacy_source(export_module, site_dir: Path, repo_root: Path) -> None:
    """site/data/algorithms.json must not drift from src/App.tsx."""
    source = repo_root / "src" / "App.tsx"
    if not source.exists():
        pytest.skip("legacy source removed after cutover")
    expected = export_module.build_payload(source)
    committed = json.loads((site_dir / "data" / "algorithms.json").read_text(encoding="utf-8"))
    assert committed == expected


def test_export_is_deterministic(export_module, tmp_path: Path) -> None:
    source = write_legacy(tmp_path, LEGACY_SNIPPET)
    assert export_module.build_payload(source) == export_module.build_payload(source)


def test_missing_field_raises(export_module, tmp_path: Path) -> None:
    broken = LEGACY_SNIPPET.replace("complexity: 'O(n²)',", "")
    with pytest.raises(export_module.ExportError, match="missing 'complexity'"):
        export_module.parse_legacy(write_legacy(tmp_path, broken))


def test_missing_algorithm_raises(export_module, tmp_path: Path) -> None:
    start = LEGACY_SNIPPET.index("    case 'merge':")
    end = LEGACY_SNIPPET.index("  }\n};")
    broken = LEGACY_SNIPPET[:start] + LEGACY_SNIPPET[end:]
    with pytest.raises(export_module.ExportError, match="algorithms missing"):
        export_module.parse_legacy(write_legacy(tmp_path, broken))


def test_missing_source_raises(export_module, tmp_path: Path) -> None:
    with pytest.raises(export_module.ExportError, match="not found"):
        export_module.parse_legacy(tmp_path / "nope.tsx")


def test_cli_writes_output(export_module, tmp_path: Path) -> None:
    source = write_legacy(tmp_path, LEGACY_SNIPPET)
    output = tmp_path / "data" / "algorithms.json"
    assert export_module.main(["--source", str(source), "--output", str(output)]) == 0
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert len(payload["algorithms"]) == 3

    missing = tmp_path / "missing.tsx"
    assert export_module.main(["--source", str(missing), "--output", str(output)]) == 1
