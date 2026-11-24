"""Guards for the Render build contract.

The production service builds with `npm ci && ./node_modules/.bin/vite build`,
a command written for the legacy Vite app that calls the binary directly. It is
satisfied by `tools/vite-render-shim` (installed as `file:` dev dependency),
which renders the site via `scripts/build.sh`. These tests keep that contract
intact and keep the committed `dist/` honest.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_package_declares_the_vite_shim(repo_root: Path) -> None:
    package = load_json(repo_root / "package.json")
    assert package["devDependencies"] == {"vite": "file:tools/vite-render-shim"}
    assert package["scripts"]["build"] == "bash scripts/build.sh dist"


def test_shim_package_exposes_a_vite_bin(repo_root: Path) -> None:
    shim_dir = repo_root / "tools" / "vite-render-shim"
    package = load_json(shim_dir / "package.json")
    assert package["bin"] == {"vite": "cli.js"}
    cli = shim_dir / "cli.js"
    assert cli.exists()
    assert os.access(cli, os.X_OK), "cli.js must be executable for node_modules/.bin/vite"
    body = cli.read_text(encoding="utf-8")
    assert "scripts" in body and "build.sh" in body


def test_lockfile_installs_the_shim_as_a_link(repo_root: Path) -> None:
    lock = load_json(repo_root / "package-lock.json")
    assert lock["packages"][""]["devDependencies"] == {"vite": "file:tools/vite-render-shim"}
    assert lock["packages"]["node_modules/vite"]["link"] is True
    assert lock["packages"]["tools/vite-render-shim"]["bin"] == {"vite": "cli.js"}


def test_build_script_is_executable_and_guards_python(repo_root: Path) -> None:
    script = repo_root / "scripts" / "build.sh"
    assert os.access(script, os.X_OK)
    body = script.read_text(encoding="utf-8")
    assert "exit 3" in body, "build.sh must signal a missing interpreter with exit code 3"


def test_build_script_exits_3_without_python(repo_root: Path) -> None:
    env = dict(os.environ, PYTHON="definitely-not-a-python-binary")
    result = subprocess.run(
        ["bash", "scripts/build.sh", "dist"],
        cwd=repo_root,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 3
    assert "cannot render the site" in result.stderr


def test_committed_dist_is_publishable(repo_root: Path) -> None:
    dist = repo_root / "dist"
    index = dist / "index.html"
    assert index.exists(), "dist/ must be committed as the no-Python fallback"
    html = index.read_text(encoding="utf-8")
    assert "<title>Algorithm Visualization - Sorting Algorithms</title>" in html
    assert (dist / "assets" / "js" / "app.js").exists()
    assert (dist / "data" / "algorithms.json").exists()


def test_committed_dist_matches_a_fresh_build(repo_root: Path, site_dir: Path, tmp_path: Path) -> None:
    """A stale committed dist/ would silently ship old content - catch it here."""
    from build import build

    fresh = tmp_path / "dist"
    build(fresh, site_dir / "data" / "algorithms.json")

    committed_files = sorted(p.relative_to(repo_root / "dist") for p in (repo_root / "dist").rglob("*") if p.is_file())
    fresh_files = sorted(p.relative_to(fresh) for p in fresh.rglob("*") if p.is_file())
    assert committed_files == fresh_files, "committed dist/ has a different file list; run: bash scripts/build.sh"
    for relative in fresh_files:
        assert (repo_root / "dist" / relative).read_bytes() == (fresh / relative).read_bytes(), (
            f"committed dist/{relative} is out of date; run: bash scripts/build.sh"
        )


@pytest.mark.skipif(
    subprocess.run(["node", "--version"], capture_output=True, check=False).returncode != 0,
    reason="node is not installed",
)
def test_shim_builds_the_site(repo_root: Path) -> None:
    result = subprocess.run(
        ["node", "tools/vite-render-shim/cli.js", "build"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "rendering the static site instead" in result.stderr
    assert (repo_root / "dist" / "index.html").exists()


@pytest.mark.skipif(
    subprocess.run(["node", "--version"], capture_output=True, check=False).returncode != 0,
    reason="node is not installed",
)
def test_shim_falls_back_to_committed_dist_without_python(repo_root: Path) -> None:
    env = dict(os.environ, PYTHON="definitely-not-a-python-binary")
    result = subprocess.run(
        ["node", "tools/vite-render-shim/cli.js", "build"],
        cwd=repo_root,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "publishing the committed dist/" in result.stderr
