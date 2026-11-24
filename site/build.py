#!/usr/bin/env python3
"""Build the Algorithm Visualization static site with Jinja2.

Pipeline
--------
1. Read ``site/data/algorithms.json`` (exported from the legacy React app).
2. Render ``site/templates/index.html`` into ``<repo>/dist/index.html``.
3. Copy ``site/static/**`` to ``<repo>/dist/assets/**``.
4. Publish the JSON data at ``<repo>/dist/data/algorithms.json``.
5. Verify the result: every local href/src resolves, the page has no unrendered
   template syntax, and the data file round-trips through json.load.

The build is deterministic (no timestamps, sorted keys) so that CI can diff two
builds.  It has no network access and no dependency beyond Jinja2.

Usage:
    python3 site/build.py [--out DIR] [--data FILE] [--check-only]

``--out`` defaults to ``dist/`` at the repository root, which is the directory
Render publishes for the static site.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Iterable

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

SITE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = SITE_DIR / "templates"
STATIC_DIR = SITE_DIR / "static"
DATA_FILE = SITE_DIR / "data" / "algorithms.json"
DEFAULT_OUT = SITE_DIR.parent / "dist"

# Inline SVG bodies for the icons used by the page (lucide geometry, 24x24).
ICONS: dict[str, str] = {
    "zap": '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    "git-branch": (
        '<line x1="6" x2="6" y1="3" y2="15"/>'
        '<circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>'
        '<path d="M18 9a9 9 0 0 1-9 9"/>'
    ),
    "git-merge": (
        '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/>'
        '<path d="M6 21V9a9 9 0 0 0 9 9"/>'
    ),
    "settings": (
        '<circle cx="12" cy="12" r="3"/>'
        '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 '
        '1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 '
        '1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 '
        '4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 '
        '1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 '
        '1.65 0 0 0 19.4 9c.2.46.65.79 1.16.83H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
    ),
    "play": '<polygon points="6 3 20 12 6 21 6 3"/>',
    "pause": (
        '<rect x="14" y="4" width="4" height="16" rx="1"/>'
        '<rect x="6" y="4" width="4" height="16" rx="1"/>'
    ),
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "skip-back": (
        '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>'
    ),
    "fast-forward": (
        '<polygon points="13 19 22 12 13 5 13 19"/>'
        '<polygon points="2 19 11 12 2 5 2 19"/>'
    ),
    "rotate-ccw": (
        '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>'
        '<path d="M3 3v5h5"/>'
    ),
    "bar-chart-3": (
        '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>'
    ),
    "circle": '<circle cx="12" cy="12" r="9"/>',
}

REQUIRED_ALGORITHM_FIELDS = (
    "key",
    "name",
    "description",
    "complexity",
    "color",
    "icon",
    "accent_hex",
    "button_label",
    "explanation",
    "notes",
    "steps_hint",
)

ASSET_REF_RE = re.compile(r'(?:href|src)="(?P<ref>[^"#][^"]*)"')


class BuildError(RuntimeError):
    """Raised when the build inputs or outputs are invalid."""


def load_data(path: Path) -> dict:
    if not path.exists():
        raise BuildError(
            f"missing data file {path}; run: python3 site/scripts/export_data.py"
        )
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)

    algorithms = data.get("algorithms") or []
    if [algo.get("key") for algo in algorithms] != ["bubble", "quick", "merge"]:
        raise BuildError("data must define bubble, quick and merge in that order")
    for algo in algorithms:
        missing = [field for field in REQUIRED_ALGORITHM_FIELDS if field not in algo]
        if missing:
            raise BuildError(f"algorithm {algo.get('key')} is missing {missing}")
        if not algo["explanation"] or not algo["notes"]:
            raise BuildError(f"algorithm {algo['key']} has no explanation copy")
    if "site" not in data:
        raise BuildError("data is missing the 'site' block")
    if "legend" not in data["site"]:
        raise BuildError("data is missing the legend")
    return data


def icon_key(component_name: str) -> str:
    """Map a lucide-react component name (GitBranch) to an icon id (git-branch)."""
    return re.sub(r"(?<!^)(?=[A-Z])", "-", component_name).lower()


def make_environment() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(("html", "xml")),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.globals["icons"] = ICONS
    env.filters["icon_key"] = icon_key
    return env


def render_index(data: dict) -> str:
    env = make_environment()
    template = env.get_template("index.html")
    site = data["site"]
    config = {
        "site": site,
        "algorithms": [
            {
                "key": algo["key"],
                "name": algo["name"],
                "button_label": algo["button_label"],
                "accent_hex": algo["accent_hex"],
            }
            for algo in data["algorithms"]
        ],
    }
    return template.render(
        site=site,
        algorithms=data["algorithms"],
        legend=site["legend"],
        defaults=site["defaults"],
        array_size=site["array_size"],
        speed=site["speed"],
        config_json=json.dumps(config, ensure_ascii=False),
    )


def copy_assets(out_dir: Path) -> list[Path]:
    written: list[Path] = []
    target_root = out_dir / "assets"
    for source in sorted(STATIC_DIR.rglob("*")):
        if source.is_dir():
            continue
        relative = source.relative_to(STATIC_DIR)
        target = target_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        written.append(target)
    return written


def verify_output(out_dir: Path) -> None:
    index = out_dir / "index.html"
    if not index.exists():
        raise BuildError("index.html was not generated")
    html = index.read_text(encoding="utf-8")

    if "{{" in html or "{%" in html or "Undefined" in html:
        raise BuildError("generated HTML contains unrendered template syntax")

    missing: list[str] = []
    for match in ASSET_REF_RE.finditer(html):
        ref = match.group("ref")
        if ref.startswith(("http://", "https://", "data:", "mailto:")):
            continue
        candidate = (out_dir / ref).resolve()
        if not candidate.exists():
            missing.append(ref)
    if missing:
        raise BuildError(f"generated HTML references missing files: {sorted(set(missing))}")

    data_file = out_dir / "data" / "algorithms.json"
    if not data_file.exists():
        raise BuildError("data/algorithms.json was not published")
    json.loads(data_file.read_text(encoding="utf-8"))

    for required in ("assets/css/styles.css", "assets/js/app.js", "assets/js/algorithms.js"):
        if not (out_dir / required).exists():
            raise BuildError(f"missing required asset: {required}")


def build(out_dir: Path = DEFAULT_OUT, data_file: Path = DATA_FILE) -> Path:
    data = load_data(data_file)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / "index.html").write_text(render_index(data), encoding="utf-8")
    copy_assets(out_dir)
    (out_dir / "data").mkdir(parents=True, exist_ok=True)
    shutil.copy2(data_file, out_dir / "data" / "algorithms.json")
    (out_dir / "robots.txt").write_text("User-agent: *\nAllow: /\n", encoding="utf-8")
    verify_output(out_dir)
    return out_dir


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the static algorithm visualizer.")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--data", type=Path, default=DATA_FILE)
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="validate the existing build output without rebuilding",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    try:
        if args.check_only:
            verify_output(args.out)
            print(f"build output at {args.out} is valid")
            return 0
        out_dir = build(args.out, args.data)
    except BuildError as exc:
        print(f"build failed: {exc}", file=sys.stderr)
        return 1

    file_count = sum(1 for path in out_dir.rglob("*") if path.is_file())
    size = sum(path.stat().st_size for path in out_dir.rglob("*") if path.is_file())
    print(f"built {out_dir} ({file_count} files, {size / 1024:.1f} KiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
