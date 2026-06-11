"""Calibration report: where the agent systematically diverges from analysts.

Aggregates the corrections log into per-category score bias (does the agent tend to
over- or under-score?), surfaces the extraction fields analysts most often fix, and
asks the model to narrate the systematic patterns and recommend rubric/thesis
adjustments. The deterministic statistics are pure and unit-testable; the narrative
is best-effort. The rendered report is deposited to SharePoint.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from typing import Optional

from biotech_dd.llm import MODEL, client
from biotech_dd.schema import load_schema

from . import state
from .config import Config
from .sharepoint import SharePointClient
from .smartsheet_writer import SmartsheetWriter

MIN_SUPPORT = 3      # corrections needed before a category's bias is called systematic
BIAS_THRESHOLD = 0.5  # mean score delta magnitude that counts as a real lean


# --------------------------------------------------------------------------- #
# Pure aggregation
# --------------------------------------------------------------------------- #


def _to_int(value: str):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def aggregate(corrections: list[dict]) -> dict:
    """Aggregate score deltas and extraction fixes per category."""
    score_deltas: dict[str, list[int]] = defaultdict(list)
    notes: dict[str, list[str]] = defaultdict(list)
    extracted_fixes: dict[str, int] = defaultdict(int)

    for c in corrections:
        field = c.get("field")
        cat = c.get("category", "")
        note = (c.get("reviewer_notes") or "").strip()
        if field == "score":
            agent = _to_int(c.get("agent_value"))
            analyst = _to_int(c.get("analyst_value"))
            if agent is not None and analyst is not None:
                # Positive delta => analyst raised it => agent under-scored.
                score_deltas[cat].append(analyst - agent)
                if note:
                    notes[cat].append(note)
        elif field == "extracted":
            extracted_fixes[cat] += 1

    by_category: dict[str, dict] = {}
    for cat, deltas in score_deltas.items():
        n = len(deltas)
        mean = sum(deltas) / n
        by_category[cat] = {
            "n": n,
            "mean_delta": round(mean, 2),
            "mean_abs": round(sum(abs(d) for d in deltas) / n, 2),
            "raised": sum(1 for d in deltas if d > 0),   # agent under-scored
            "lowered": sum(1 for d in deltas if d < 0),  # agent over-scored
            "notes": notes[cat][:5],
        }
    return {
        "by_category": by_category,
        "extracted_hotspots": dict(
            sorted(extracted_fixes.items(), key=lambda kv: kv[1], reverse=True)
        ),
    }


def detect_biases(
    by_category: dict, min_support: int = MIN_SUPPORT, threshold: float = BIAS_THRESHOLD
) -> list[dict]:
    """Categories with enough support and a real directional lean."""
    biases = []
    for cat, s in by_category.items():
        if s["n"] >= min_support and abs(s["mean_delta"]) >= threshold:
            biases.append(
                {
                    "category": cat,
                    "direction": "over-scores" if s["mean_delta"] < 0 else "under-scores",
                    "mean_delta": s["mean_delta"],
                    "n": s["n"],
                }
            )
    return sorted(biases, key=lambda b: abs(b["mean_delta"]), reverse=True)


# --------------------------------------------------------------------------- #
# Narrative + rendering
# --------------------------------------------------------------------------- #


def _narrative(stats: dict, biases: list[dict]) -> str:
    if not biases:
        return ""
    lines = ["Per-category score bias (mean delta = analyst minus agent):"]
    for b in biases:
        s = stats["by_category"][b["category"]]
        lines.append(
            f"- {b['category']}: {b['direction']} by {abs(b['mean_delta'])} on average "
            f"(n={b['n']}, raised {s['raised']} / lowered {s['lowered']}). "
            f"Reviewer notes: {' | '.join(s['notes']) or 'none'}"
        )
    prompt = (
        "You are auditing a biopharma scoring agent against analyst corrections. "
        "Given the per-category bias data below, write a brief report: (1) the "
        "systematic patterns (where and why the agent diverges), and (2) concrete, "
        "specific rubric or thesis-prompt adjustments that would close each gap. Be "
        "concise and actionable; do not restate the raw numbers.\n\n" + "\n".join(lines)
    )
    try:
        resp = client().messages.create(
            model=MODEL,
            max_tokens=2000,
            thinking={"type": "adaptive"},
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(b.text for b in resp.content if b.type == "text").strip()
    except Exception:  # noqa: BLE001 - narrative is best-effort
        return ""


def render_markdown(
    stats: dict, biases: list[dict], narrative: str, reviewed_count: int, total_corrections: int
) -> str:
    today = dt.date.today().isoformat()
    out = [f"# Scoring calibration report — {today}", ""]
    out.append(
        f"_Based on {total_corrections} corrections across {reviewed_count} reviewed "
        f"assets._"
    )
    out.append("")

    out.append("## Systematic score bias")
    if biases:
        out.append("")
        out.append("| Category | Direction | Mean delta | Support (n) |")
        out.append("| --- | --- | --- | --- |")
        for b in biases:
            out.append(
                f"| {b['category']} | {b['direction']} | {b['mean_delta']:+} | {b['n']} |"
            )
    else:
        out.append("\n_No category reached the bias threshold yet — keep reviewing._")
    out.append("")

    out.append("## All scored categories")
    out.append("")
    out.append("| Category | n | Mean delta | Mean |Δ| | Raised | Lowered |")
    out.append("| --- | --- | --- | --- | --- | --- |")
    for cat, s in sorted(
        stats["by_category"].items(), key=lambda kv: abs(kv[1]["mean_delta"]), reverse=True
    ):
        out.append(
            f"| {cat} | {s['n']} | {s['mean_delta']:+} | {s['mean_abs']} | "
            f"{s['raised']} | {s['lowered']} |"
        )
    out.append("")

    if stats["extracted_hotspots"]:
        out.append("## Most-corrected extracted fields")
        out.append("")
        for field, n in stats["extracted_hotspots"].items():
            out.append(f"- {field}: {n} corrections")
        out.append("")

    if narrative:
        out += ["## Patterns & recommended adjustments", "", narrative, ""]

    out.append(
        "> Mean delta = analyst score minus agent score. Negative = the agent scores "
        "**higher** than analysts (over-scores); positive = it scores lower "
        "(under-scores)."
    )
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #


def generate_report(config: Config) -> dict:
    schema = load_schema(config.schema_path)
    sp: Optional[SharePointClient] = SharePointClient(
        config.graph_tenant_id,
        config.graph_client_id,
        config.graph_client_secret,
        config.sharepoint_drive_id,
    )
    corrections = state.load_corrections(sp, config)
    if not corrections:
        return {"corrections": 0, "report_link": "", "biases": []}

    stats = aggregate(corrections)
    biases = detect_biases(stats["by_category"])
    narrative = _narrative(stats, biases)

    # Denominator: assets that have actually been reviewed.
    reviewed_count = 0
    try:
        writer = SmartsheetWriter(config.smartsheet_token, config.smartsheet_sheet_id)
        reviewed_count = sum(
            1
            for r in writer.read_rows(schema)
            if r["values"].get("Feedback Captured", "").strip()
        )
    except Exception:  # noqa: BLE001
        pass

    md = render_markdown(stats, biases, narrative, reviewed_count, len(corrections))
    today = dt.date.today().isoformat()
    link = sp.upload_file(
        f"{config.sharepoint_base_folder}/Calibration",
        f"calibration-{today}.md",
        md.encode(),
    )
    return {
        "corrections": len(corrections),
        "reviewed_assets": reviewed_count,
        "biases": biases,
        "report_link": link,
    }
