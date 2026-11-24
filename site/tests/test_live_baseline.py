"""Compare the generated page against the recorded production baseline.

``fixtures/live_baseline_2026-11-24.txt`` holds the stable text observed on
https://algorithm-visualizer-tzld.onrender.com before the migration.  Every
phrase there must still be readable on the new page, so nothing the live site
told users has silently disappeared.
"""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

import pytest

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "live_baseline_2026-11-24.txt"
SKIP_TAGS = {"script", "style", "svg", "path", "circle", "polygon", "rect", "line"}


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in SKIP_TAGS:
            self.skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in SKIP_TAGS and self.skip_depth:
            self.skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.skip_depth == 0:
            self.parts.append(data)


def visible_text(html: str) -> str:
    parser = TextExtractor()
    parser.feed(html)
    return " ".join("".join(parser.parts).split())


def baseline_phrases() -> tuple[str, list[str]]:
    title = ""
    phrases: list[str] = []
    for line in FIXTURE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("TITLE: "):
            title = line.removeprefix("TITLE: ")
            continue
        phrases.append(" ".join(line.split()))
    return title, phrases


def test_fixture_is_present_and_populated() -> None:
    title, phrases = baseline_phrases()
    assert title == "Algorithm Visualization - Sorting Algorithms"
    assert len(phrases) > 20


def test_every_baseline_phrase_survives(built_html: str) -> None:
    _, phrases = baseline_phrases()
    text = visible_text(built_html)
    missing = [phrase for phrase in phrases if phrase not in text]
    assert not missing, "production copy missing from the new page:\n" + "\n".join(missing)


def test_baseline_title_matches(built_html: str) -> None:
    title, _ = baseline_phrases()
    assert f"<title>{title}</title>" in built_html


def test_default_control_state_matches_live_site(built_html: str) -> None:
    text = visible_text(built_html)
    # The live site loads with Bubble sort, 20 bars and a 500ms speed setting.
    assert "Array Size: 20" in text
    assert "Speed: 500ms" in text
    assert "Step: 0" in text
    assert 'aria-pressed="true"' in built_html
