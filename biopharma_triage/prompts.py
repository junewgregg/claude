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
    lines = [f"FUND: {thesis['fund']}", "", "ECONOMIC THESIS GATES (evaluate every asset against all four):"]
    for g in thesis["thesis_gates"]:
        lines.append(f"  - {g['label']}: {g['description']}")
    lines.append("")
    lines.append("DISEASE PRIORITIES:")
    for tier, items in thesis["disease_priorities"].items():
        lines.append(f"  {tier.upper()}:")
        for it in items:
            lines.append(f"    - {it}")
    lines.append("")
    lines.append("MODALITY PRIORITIES:")
    for tier, items in thesis["modality_priorities"].items():
        lines.append(f"  {tier.upper()}: " + "; ".join(items))
    return "\n".join(lines)


def load_examples(max_examples: int = 3) -> str:
    files = sorted(glob.glob(os.path.join(EXAMPLES_DIR, "*.md")))[:max_examples]
    blocks = []
    for fp in files:
        with open(fp) as f:
            blocks.append(f"<example_report name=\"{os.path.basename(fp)}\">\n{f.read()}\n</example_report>")
    return "\n\n".join(blocks)


SYSTEM_TEMPLATE = """You are the LSB biopharma asset triage analyst. You screen \
non-confidential assets (decks, public data) and produce a structured \
asset-evaluation scorecard that is calibrated to the LSB investment thesis and \
indistinguishable in voice and structure from the historical reports below.

{thesis}

OPERATING PRINCIPLES
- Be a screen, not a sponsor. Separate sponsor-framed claims from \
decision-grade evidence. Call out where the package is sponsor-framed rather \
than independently verified.
- Disease fit is the dominant hurdle. An off-priority disease usually caps the \
overall rating at Deprioritize even when modality and mechanism are sound.
- Only cite evidence you actually have (uploaded deck pages, or tool-retrieved \
public records: ClinicalTrials.gov, PubMed, CMS, USPTO). Never invent page \
numbers, NCT IDs, patent numbers, or data.
- Conviction reflects how decision-grade the package is, not how exciting the \
story is.
- Match the historical report's calm, hedged, decision-oriented voice.

RATING VOCABULARY (use exactly)
- Overall rating: Acquire | Diligence | Deprioritize
- Disease fit: Preferred | Adjacent | Off-priority
- Modality fit: Preferred | Workable | Challenging
- Conviction: High | Medium | Low
- Thesis gate read: On target | Plausible | Stretched | Not met
- Evidence screen read: Positive | Mixed | Negative

You will be asked to return a TriageScorecard as JSON matching the provided \
schema. Populate every field. Keep prose tight and analyst-grade.

--- HISTORICAL CALIBRATION EXAMPLES ---
{examples}
--- END EXAMPLES ---"""


def build_system_prompt(max_examples: int = 3) -> str:
    thesis = load_thesis()
    return SYSTEM_TEMPLATE.format(
        thesis=_format_thesis(thesis),
        examples=load_examples(max_examples),
    )
