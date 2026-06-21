#!/usr/bin/env python3
"""CLI entrypoint for the LSB biopharma triage agent.

Usage:
    python -m biopharma_triage.run deck.pdf [more_decks...] \
        --hint "FLQ-106 integrin inhibitor" --out report.docx

Requires ANTHROPIC_API_KEY in the environment.
"""
from __future__ import annotations

import argparse
import json
import os
import sys


def main(argv=None):
    ap = argparse.ArgumentParser(description="LSB biopharma asset triage agent")
    ap.add_argument("decks", nargs="*", help="Deck/report files (pdf, docx, pptx, txt, md)")
    ap.add_argument("--hint", default="", help="Optional analyst hint about the asset")
    ap.add_argument("--out", default=None, help="Output .docx path (default: <asset>_triage.docx)")
    ap.add_argument("--json", dest="json_out", default=None, help="Also write scorecard JSON here")
    ap.add_argument("--model", default=os.environ.get("LSB_TRIAGE_MODEL", "claude-opus-4-8"))
    ap.add_argument("--examples", type=int, default=3, help="Few-shot examples to include")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    if not args.decks:
        ap.error("provide at least one deck file")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: set ANTHROPIC_API_KEY", file=sys.stderr)
        return 2

    from .agent import TriageAgent
    from .report import render_docx

    agent = TriageAgent(model=args.model, max_examples=args.examples, verbose=not args.quiet)
    sc = agent.triage(args.decks, asset_hint=args.hint)

    safe = "".join(c if c.isalnum() else "_" for c in sc.snapshot.asset_code or sc.asset_name)[:40]
    out = args.out or f"{safe}_triage.docx"
    render_docx(sc, out)
    print(f"\n=== {sc.asset_name} ===")
    print(f"Analyst rating:     {sc.rating.overall_rating.value} | Disease: {sc.rating.disease_fit.value} | "
          f"Modality: {sc.rating.modality_fit.value} | Conviction: {sc.rating.conviction.value}")
    print(f"Panel determination: {sc.panel.determination.value}")
    print(f"Swing factor: {sc.panel.key_swing_factor}")
    print(f"Gates: {sc.gate_summary()}")
    print(f"Bottom line: {sc.bottom_line}")
    print(f"Report written: {out}")

    if args.json_out:
        with open(args.json_out, "w") as f:
            json.dump(sc.model_dump(mode="json"), f, indent=2)
        print(f"JSON written: {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
