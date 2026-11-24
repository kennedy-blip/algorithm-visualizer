"""Tests for the Jinja2 build pipeline and its generated output."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest


def test_index_is_generated(built: Path) -> None:
    index = built / "index.html"
    assert index.exists()
    html = index.read_text(encoding="utf-8")
    assert html.lstrip().startswith("<!doctype html>")
    assert html.rstrip().endswith("</html>")


def test_page_has_expected_structure(built_html: str) -> None:
    html = built_html
    # Header + counters
    assert "Algorithm Visualization" in html
    assert "Comparisons:" in html and "Swaps:" in html
    # All three algorithm buttons
    for key in ("bubble", "quick", "merge"):
        assert f'data-algorithm="{key}"' in html
        assert f'data-algo-panel="{key}"' in html
    # Controls and playback affordances from the legacy UI
    assert 'id="array-size"' in html
    assert 'id="speed"' in html
    assert 'id="toggle-play"' in html
    assert 'id="step-back"' in html and 'id="step-forward"' in html
    assert 'id="restart"' in html and 'id="skip-to-end"' in html
    assert 'id="progress-bar"' in html
    assert "Step-by-Step Explanation" in html
    assert "Algorithm Selection" in html
    assert "Array Controls" in html
    assert "Generate New Array" in html
    assert "Total Steps:" in html


def test_slider_bounds_come_from_data(built_html: str, data: dict) -> None:
    site = data["site"]
    assert f'min="{site["array_size"]["min"]}"' in built_html
    assert f'max="{site["array_size"]["max"]}"' in built_html
    assert f'value="{site["defaults"]["array_size"]}"' in built_html
    assert f'max="{site["speed"]["max"]}"' in built_html
    assert f'value="{site["defaults"]["speed"]}"' in built_html


def test_algorithm_copy_is_rendered_server_side(built_html: str, data: dict) -> None:
    for algo in data["algorithms"]:
        assert algo["name"] in built_html
        assert algo["description"] in built_html
        assert algo["complexity"] in built_html
        assert algo["steps_hint"] in built_html
        assert algo["explanation"] in built_html
        for line in algo["notes"]:
            assert line in built_html


def test_legend_comes_from_data(built_html: str, data: dict) -> None:
    for entry in data["site"]["legend"]:
        assert entry["label"] in built_html
        assert entry["color"] in built_html


def test_embedded_config_is_valid_json(built_html: str) -> None:
    match = re.search(
        r'<script type="application/json" id="av-config">(.*?)</script>',
        built_html,
        re.S,
    )
    assert match, "config JSON script is missing"
    config = json.loads(match.group(1))
    assert [algo["key"] for algo in config["algorithms"]] == ["bubble", "quick", "merge"]
    assert config["site"]["defaults"]["algorithm"] == "bubble"
    assert config["site"]["defaults"]["array_size"] == 20
    assert config["site"]["defaults"]["speed"] == 500


def test_assets_are_copied_verbatim(built: Path, site_dir: Path) -> None:
    for source in (site_dir / "static").rglob("*"):
        if source.is_dir():
            continue
        target = built / "assets" / source.relative_to(site_dir / "static")
        assert target.exists(), f"missing asset {target}"
        assert target.read_bytes() == source.read_bytes()
    assert (built / "assets" / "css" / "styles.css").stat().st_size > 1000
    assert (built / "assets" / "js" / "app.js").stat().st_size > 1000
    assert (built / "assets" / "favicon.svg").exists()


def test_data_is_published_unchanged(built: Path, site_dir: Path) -> None:
    published = json.loads((built / "data" / "algorithms.json").read_text(encoding="utf-8"))
    source = json.loads((site_dir / "data" / "algorithms.json").read_text(encoding="utf-8"))
    assert published == source


def test_every_local_reference_resolves(built: Path, built_html: str) -> None:
    refs = {
        match.group("ref")
        for match in re.finditer(r'(?:href|src)="(?P<ref>[^"#][^"]*)"', built_html)
        if not match.group("ref").startswith(("http://", "https://", "data:", "mailto:"))
    }
    assert refs, "page should reference at least the stylesheet and script"
    for ref in refs:
        assert (built / ref).exists(), f"broken reference: {ref}"


def test_build_is_deterministic(tmp_path: Path, site_dir: Path, built: Path) -> None:
    second = tmp_path / "second"
    from build import build

    build(second, site_dir / "data" / "algorithms.json")
    first_files = sorted(p.relative_to(built) for p in built.rglob("*") if p.is_file())
    second_files = sorted(p.relative_to(second) for p in second.rglob("*") if p.is_file())
    assert first_files == second_files
    for relative in first_files:
        assert (built / relative).read_bytes() == (second / relative).read_bytes()


def test_build_replaces_stale_output(tmp_path: Path, site_dir: Path) -> None:
    from build import build

    out = tmp_path / "dist"
    out.mkdir(parents=True)
    (out / "stale.html").write_text("old", encoding="utf-8")
    build(out, site_dir / "data" / "algorithms.json")
    assert not (out / "stale.html").exists()
    assert (out / "index.html").exists()


def test_check_only_validates_existing_output(built: Path, capsys: pytest.CaptureFixture[str]) -> None:
    from build import main

    assert main(["--check-only", "--out", str(built)]) == 0
    assert "valid" in capsys.readouterr().out


def test_check_only_fails_on_broken_output(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    from build import main

    empty = tmp_path / "empty"
    empty.mkdir()
    assert main(["--check-only", "--out", str(empty)]) == 1
    assert "index.html was not generated" in capsys.readouterr().err


def test_missing_data_file_fails_clearly(tmp_path: Path, site_dir: Path) -> None:
    from build import BuildError, build

    with pytest.raises(BuildError, match="export_data.py"):
        build(tmp_path / "dist", site_dir / "data" / "does-not-exist.json")


@pytest.mark.parametrize(
    "mutate,message",
    [
        (lambda d: d["algorithms"].reverse(), "bubble, quick and merge"),
        (lambda d: d["algorithms"][0].pop("complexity"), "missing"),
        (lambda d: d["algorithms"][1].update(explanation=[]), "no explanation"),
        (lambda d: d["site"].pop("legend"), "legend"),
    ],
)
def test_invalid_data_is_rejected(tmp_path: Path, data: dict, mutate, message: str) -> None:
    import copy

    from build import BuildError, build

    payload = copy.deepcopy(data)
    mutate(payload)
    data_file = tmp_path / "algorithms.json"
    data_file.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(BuildError, match=message):
        build(tmp_path / "dist", data_file)


def test_html_has_no_unrendered_template_syntax(built_html: str) -> None:
    assert "{{" not in built_html
    assert "{%" not in built_html
    assert "Undefined" not in built_html


def test_generated_pages_are_small_enough_to_ship(built: Path) -> None:
    total = sum(p.stat().st_size for p in built.rglob("*") if p.is_file())
    assert total < 512 * 1024, f"build grew to {total} bytes"
