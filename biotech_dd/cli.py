"""Orchestrator and command-line entry point.

Discovers PDF decks, runs the three DD stages per deck (with extraction cached
so later stages can be re-run independently), and writes the comparison
spreadsheet plus per-asset memos.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from rich.console import Console

from . import extract as extract_mod
from . import research as research_mod
from . import score as score_mod
from .report import AssetResult, write_memo, write_xlsx
from .schema import Schema, load_schema

console = Console()
ALL_STAGES = ("extract", "score", "research")


def _asset_name(schema: Schema, extracted, fallback: str) -> str:
    fld = getattr(extracted, schema.asset_name_field, None)
    value = getattr(fld, "value", None)
    return value or fallback


def _cache_path(out_dir: Path, stem: str) -> Path:
    return out_dir / ".cache" / f"{stem}.extracted.json"


def _load_or_extract(schema: Schema, pdf: Path, out_dir: Path, force: bool):
    """Return an Extracted model, using the on-disk cache unless forced."""
    model = schema.extracted_model()
    cache = _cache_path(out_dir, pdf.stem)
    if not force and cache.exists():
        console.print(f"  [dim]using cached extraction[/dim]")
        return model.model_validate_json(cache.read_text())

    console.print("  extracting deck…")
    file_id = extract_mod.upload_deck(pdf)
    extracted = extract_mod.extract(schema, file_id)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(extracted.model_dump(mode="json"), indent=2))
    return extracted


def run(decks_dir: Path, schema_path: Path, thesis_path: Path, out_dir: Path, stages) -> None:
    schema = load_schema(schema_path)
    thesis = Path(thesis_path).read_text()
    pdfs = sorted(decks_dir.glob("*.pdf"))
    if not pdfs:
        console.print(f"[red]No PDFs found in {decks_dir}[/red]")
        return

    results: list[AssetResult] = []
    for pdf in pdfs:
        console.print(f"[bold]{pdf.name}[/bold]")
        extracted = _load_or_extract(schema, pdf, out_dir, force="extract" in stages)
        name = _asset_name(schema, extracted, pdf.stem)

        scored = None
        if "score" in stages:
            console.print("  scoring against thesis…")
            scored = score_mod.score(schema, thesis, extracted)

        researched = None
        if "research" in stages:
            console.print("  researching public sources…")
            researched = research_mod.research(schema, extracted)

        result = AssetResult(
            name=name, source_pdf=pdf.name,
            extracted=extracted, scored=scored, researched=researched,
        )
        results.append(result)
        write_memo(schema, result, out_dir / f"{pdf.stem}.md")
        console.print(f"  [green]memo written[/green] -> {out_dir / (pdf.stem + '.md')}")

    xlsx = out_dir / "table.xlsx"
    write_xlsx(schema, results, xlsx)
    console.print(f"[green bold]Table written[/green bold] -> {xlsx}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="biotech_dd", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    run_p = sub.add_parser("run", help="Run the DD pipeline over a folder of decks.")
    run_p.add_argument("--decks", type=Path, default=Path("decks"))
    run_p.add_argument("--schema", type=Path, default=Path("config/schema.yaml"))
    run_p.add_argument("--thesis", type=Path, default=Path("config/thesis.md"))
    run_p.add_argument("--out", type=Path, default=Path("out"))
    run_p.add_argument(
        "--only",
        default=",".join(ALL_STAGES),
        help="Comma list of stages to run: extract,score,research (default: all).",
    )

    args = parser.parse_args(argv)
    if args.command == "run":
        stages = {s.strip() for s in args.only.split(",") if s.strip()}
        unknown = stages - set(ALL_STAGES)
        if unknown:
            parser.error(f"unknown stage(s): {', '.join(sorted(unknown))}")
        run(args.decks, args.schema, args.thesis, args.out, stages)


if __name__ == "__main__":
    main()
