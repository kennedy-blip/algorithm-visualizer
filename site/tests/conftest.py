"""Shared pytest fixtures for the static site build."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest

SITE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = SITE_DIR.parent

# Make build.py and scripts/export_data.py importable without packaging them.
for extra in (SITE_DIR, SITE_DIR / "scripts"):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))

import build  # noqa: E402  (import after sys.path setup)
import export_data  # noqa: E402


@pytest.fixture(scope="session")
def site_dir() -> Path:
    return SITE_DIR


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return REPO_ROOT


@pytest.fixture(scope="session")
def build_module():
    return build


@pytest.fixture(scope="session")
def export_module():
    return export_data


@pytest.fixture(scope="session")
def data(site_dir: Path) -> dict:
    return build.load_data(site_dir / "data" / "algorithms.json")


@pytest.fixture(scope="session")
def built(tmp_path_factory: pytest.TempPathFactory, site_dir: Path) -> Path:
    """Build the site once into a temporary directory."""
    out = tmp_path_factory.mktemp("site-build") / "dist"
    build.build(out, site_dir / "data" / "algorithms.json")
    return out


@pytest.fixture(scope="session")
def built_html(built: Path) -> str:
    return (built / "index.html").read_text(encoding="utf-8")


@pytest.fixture()
def clean_dist(tmp_path: Path) -> Path:
    """A throwaway source/dist pair for negative build tests."""
    return tmp_path / "dist"


@pytest.fixture()
def legacy_app_source() -> str:
    """Root-level legacy App.tsx, if the pre-migration source still exists."""
    source = REPO_ROOT / "src" / "App.tsx"
    if not source.exists():
        pytest.skip("legacy React source is gone; parity checks no longer apply")
    return source.read_text(encoding="utf-8")
