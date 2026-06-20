"""System prompt construction and few-shot grounding for the triage agent."""
from __future__ import annotations

import glob
import os

import yaml

_HERE = os.path.dirname(__file__)
EXAMPLES_DIR = os.path.join(_HERE, "examples")
THESIS_PATH = os.path.join(_HERE, "data", "thesis.yaml")


def load_thesis() -> dict:
    with open(THESIS_PATH) as f:
        return yaml.safe_load(f)


def _format_thesis(thesis: dict) -> str:
    lines = [
        f"FUND: {thesis['fund']}",
        "",
        "INVESTMENT PREMISE:",
        "- Assets must be available for full acquisition/licensing with IP rights transfer",
        "- Single-asset Newco formed for each acquired asset (LSB owns IP)",
        "- Target: Low/no upfront payment",
        "- Portfolio goal: up to 20 Newcos over 5 years from 300+ triaged assets",
        "- Partner for diligence & development planning: Radyus Research",
        "",
        "PRE-SCREEN HARD FILTERS (if an asset fails any, overall rating is Deprioritize):",
    ]
    for c in thesis.get("pre_screen_criteria", []):
        lines.append(f"  ✗ {c}")
    lines.append("")
    lines.append("ECONOMIC THESIS GATES (rate each: On target / Plausible / Stretched / Not met):")
    for g in thesis["thesis_gates"]:
        lines.append(f"  - {g['label']}: {g['description']}")
    lines.append("")
    lines.append("DISEASE / TA PRIORITIES (disease fit is the dominant rating hurdle):")
    for tier, items in thesis["disease_priorities"].items():
        lines.append(f"  {tier.upper().replace('_',' ')}:")
        for it in (items if isinstance(items, list) else [items]):
            lines.append(f"    - {it}")
    lines.append("")
    lines.append("MODALITY PRIORITIES:")
    for tier, items in thesis["modality_priorities"].items():
        lines.append(f"  {tier.upper()}: " + "; ".join(items))
    lines.append("")
    lines.append("EXIT THESIS: High probability-of-success exit = strong overlap with Top Pharma M&A/BD areas.")
    lines.append("Preferred TAs map directly to where AbbVie, Ipsen, Sanofi, AstraZeneca, Pfizer, Roche, etc. actively acquire.")
    return "\n".join(lines)


def load_examples(max_examples: int = 3) -> str:
    files = sorted(glob.glob(os.path.join(EXAMPLES_DIR, "*.md")))[:max_examples]
    blocks = []
    for fp in files:
        with open(fp) as f:
            blocks.append(f"<example_report name=\"{os.path.basename(fp)}\">\n{f.read()}\n</example_report>")
    return "\n\n".join(blocks)


SYSTEM_TEMPLATE = """You are the asset triage analyst for LevelSet Bio (LSB), a \
non-profit pharma company that licenses clinical-stage assets from universities \
and pharma, forms single-asset Newcos, and drives each to a transactable \
inflection point for pharma M&A / BD exit. You screen non-confidential materials \
(decks, public data) and produce a structured asset-evaluation scorecard that is \
calibrated exactly to the LSB investment thesis below and indistinguishable in \
voice and structure from the historical reports provided.

{thesis}

OPERATING PRINCIPLES
1. Pre-screen first. Check the hard-filter criteria before scoring. A failed \
hard filter (non-therapeutic, no COM patent, pre-IND with no IND path, wrong \
modality, wrong stage) means Deprioritize regardless of other attributes.
2. Disease fit is the dominant hurdle. An off-priority disease caps the overall \
rating at Deprioritize even when modality and mechanism are excellent. Always \
assess pharma M&A exit likelihood: would AbbVie, Ipsen, Sanofi, AZ, Pfizer, \
Roche or peers plausibly acquire this asset?
3. Be a screen, not a sponsor. Separate sponsor-framed claims from \
decision-grade evidence. Explicitly call out gaps (no clinical data, stage \
unclear, IP unconfirmed). Only cite evidence you actually retrieved (deck pages \
or tool results). Never invent NCT IDs, patent numbers, or data.
4. Conviction = package quality, not story excitement. Low conviction means the \
evidence base is thin, not that the program is bad.
5. Match the historical report voice: calm, hedged, decision-oriented, no hype.

RATING VOCABULARY (use exactly these strings)
- Overall rating: Acquire | Diligence | Deprioritize
- Disease fit: Preferred | Adjacent | Off-priority
- Modality fit: Preferred | Workable | Challenging
- Conviction: High | Medium | Low
- Thesis gate read: On target | Plausible | Stretched | Not met
- Evidence screen read: Positive | Mixed | Negative

You will call emit_scorecard exactly once with the complete TriageScorecard JSON. \
Populate every field. Keep prose tight and analyst-grade — 1-3 sentences per cell.

--- HISTORICAL CALIBRATION EXAMPLES ---
{examples}
--- END EXAMPLES ---"""


def build_system_prompt(max_examples: int = 3) -> str:
    thesis = load_thesis()
    return SYSTEM_TEMPLATE.format(
        thesis=_format_thesis(thesis),
        examples=load_examples(max_examples),
    )
