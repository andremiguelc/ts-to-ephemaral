"""Parser test helpers — runs ts-to-ephemaral on fixture .ts files."""

import subprocess
import json
from datetime import datetime
from pathlib import Path

PARSER_DIR = Path(__file__).parent.parent
FIXTURES_DIR = Path(__file__).parent / "fixtures"
SNAPSHOTS_DIR = Path(__file__).parent / "snapshots"


def run_parser(fixture_name: str) -> subprocess.CompletedProcess:
    """Run the TS parser on a fixture file. Returns the completed process."""
    fixture_path = FIXTURES_DIR / fixture_name
    assert fixture_path.exists(), f"Fixture not found: {fixture_path}"
    return subprocess.run(
        ["npx", "tsx", "src/index.ts", str(fixture_path)],
        capture_output=True,
        text=True,
        cwd=str(PARSER_DIR),
        timeout=30,
    )


def parse_fixture(fixture_name: str) -> dict:
    """Run parser on fixture and return parsed JSON. Fails if parser errors."""
    result = run_parser(fixture_name)
    assert result.returncode == 0, f"Parser failed on {fixture_name}:\n{result.stderr}"
    return json.loads(result.stdout)


def parse_fixture_error(fixture_name: str) -> str:
    """Run parser on fixture expecting an error. Returns stderr."""
    result = run_parser(fixture_name)
    assert result.returncode != 0, (
        f"Expected parser to fail on {fixture_name} but it succeeded:\n{result.stdout}"
    )
    return result.stderr


def write_snapshot(name: str, content: str) -> None:
    """Write a diagnostic snapshot for LLM evaluation.
    Filename includes date+time stamp so we can tell which snapshots are current."""
    SNAPSHOTS_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M")
    (SNAPSHOTS_DIR / f"{name}-{stamp}.txt").write_text(content)
