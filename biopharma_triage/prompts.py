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


def load_panel_outcomes() -> str:
    """Render the Wave 2 Cycle 2 panel outcome table as a compact reference block."""
    outcomes_path = os.path.join(_HERE, "data", "triage_outcomes_wave2_cycle2.json")
    if not os.path.exists(outcomes_path):
        return ""
    import json
    data = json.load(open(outcomes_path))
    lines = ["WAVE 2 CYCLE 2 PANEL OUTCOMES (31 assets) — use as calibration:"]
    lines.append(f"{'Asset':<28} {'LSB ID':<13} {'Modality':<20} {'Disease':<16} {'Panel Determination'}")
    lines.append("-" * 100)
    for d in data:
        lines.append(
            f"{d.get('Asset Name',''):<28} {d.get('LSB Tracking ID',''):<13} "
            f"{d.get('Modality',''):<20} {d.get('Disease Category',''):<16} "
            f"{d.get('Determination_norm','')}"
        )
    return "\n".join(lines)


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

TWO-LAYER OUTPUT (produce both):

LAYER 1 — ANALYST SCORECARD RATING (detailed write-up):
- Overall rating: Acquire | Diligence | Deprioritize
- Disease fit: Preferred | Adjacent | Off-priority | Non-core
- Modality fit: Preferred | Workable | Acceptable | Adjacent | Challenging
- Conviction: High | Medium-High | Medium | Medium-Low | Low
- Thesis gate read: On target | Plausible | Stretched | Not met
- Evidence screen read: Positive | Mixed | Negative

LAYER 2 — PANEL DETERMINATION (committee-level call):
This is a separate, more decisive judgment that reflects what a review committee
would decide after seeing the full scorecard. It uses a different vocabulary and
frequently diverges from the analyst rating, because it incorporates:
- Commercial transactability: can we actually find a pharma buyer for this at exit?
- Asset availability: is it genuinely licensable on acceptable terms?
- Competitive crowding: are better-funded competitors ahead in the same space?
- Portfolio fit: does this asset add to the portfolio or crowd it?

Panel determination vocabulary:
- Prioritize: move forward actively into deeper diligence
- Prioritize: Tier 2: worthy but lower urgency; queue behind Tier 1 assets
- Deprioritize: do not pursue at this time
- Hold: interesting but currently blocked (e.g. not yet available, terms unclear)
- Not for sale: asset confirmed not accessible for licensing

Key calibration from Wave 2 Cycle 2 outcomes (31 assets):
- Most "Diligence" analyst scorecards → panel said "Deprioritize" (panel is stricter)
- "Acquire" scorecard assets can still → panel "Deprioritize" (if transactability poor)
- "Deprioritize" scorecard assets can → panel "Prioritize" (if committee sees a path the analyst didn't)
- When in doubt, the panel is more skeptical than the analyst scorecard

You will call emit_scorecard exactly once with the complete TriageScorecard JSON \
including the panel field. Keep prose tight and analyst-grade — 1-3 sentences per cell.

--- PANEL OUTCOME REFERENCE (ground truth determinations) ---
{panel_outcomes}
--- END PANEL OUTCOMES ---

--- HISTORICAL CALIBRATION EXAMPLES (full scorecard format) ---
{examples}
--- END EXAMPLES ---"""


def build_system_prompt(max_examples: int = 3) -> str:
    thesis = load_thesis()
    return SYSTEM_TEMPLATE.format(
        thesis=_format_thesis(thesis),
        panel_outcomes=load_panel_outcomes(),
        examples=load_examples(max_examples),
    )
