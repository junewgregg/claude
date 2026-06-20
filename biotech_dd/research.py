"""Tier 3 - independent web research on public sources.

Two passes:

1. An agentic web-research turn using the server-side ``web_search`` and
   ``web_fetch`` tools, scoped to the asset via per-category query hints that
   interpolate the Tier-1 extracted facts.
2. A structured-output pass that normalizes the gathered notes into the
   ``Researched`` model: a summary plus source URLs per category.
"""

from __future__ import annotations

from pydantic import BaseModel

from . import clinicaltrials
from .llm import MODEL, WEB_FETCH_TOOL, WEB_SEARCH_TOOL, client
from .schema import Schema

_RESEARCH_SYSTEM = (
    "You are a biopharma research analyst. Investigate each topic below using web "
    "search and fetch. Prioritize authoritative public databases and pull from them "
    "explicitly:\n"
    "- ClinicalTrials.gov for trial status, design, enrollment, and read-out timing\n"
    "- FDA (Drugs@FDA, Orange Book, labels) and EMA for approvals and exclusivity\n"
    "- CMS for reimbursement: Medicare coverage (NCDs/LCDs), Part B ASP drug "
    "pricing, and fee schedules\n"
    "- PubMed and peer-reviewed literature plus clinical-practice guidelines for "
    "standard of care\n"
    "- Company press releases, SEC/EDGAR filings, and reputable deal trackers for "
    "competitive and transaction intelligence\n"
    "A ClinicalTrials.gov registry digest pulled directly from the API may be "
    "provided below; treat it as ground truth and build on it. For every claim, "
    "keep the source URL. Be specific and current; note publication dates where "
    "they matter. If evidence is thin, say so rather than guessing."
)

_MAX_CONTINUATIONS = 8


class _SafeDict(dict):
    """str.format_map helper that leaves unknown placeholders untouched."""

    def __missing__(self, key: str) -> str:  # noqa: D401
        return ""


def _fill(hint: str, facts: dict[str, str]) -> str:
    return hint.format_map(_SafeDict(facts))


def _fact_values(extracted: BaseModel) -> dict[str, str]:
    """Flatten extracted fields to key -> value strings for interpolation."""
    out: dict[str, str] = {}
    for key, fld in extracted:
        out[key] = (getattr(fld, "value", None) or "")
    return out


def _topics(schema: Schema, facts: dict[str, str]) -> str:
    lines = []
    for cat in schema.researched:
        hint = _fill(cat.query_hint, facts) if cat.query_hint else cat.key
        lines.append(f"- {cat.key}: {hint}")
    return "\n".join(lines)


def _gather(schema: Schema, facts: dict[str, str]) -> str:
    """Run the agentic web-research loop and return the accumulated notes."""
    registry = clinicaltrials.digest(facts)
    user = (
        "Research the following topics for this drug asset and write detailed "
        "notes with source URLs for each:\n\n" + _topics(schema, facts)
    )
    if registry:
        user += f"\n\n=== ClinicalTrials.gov registry digest ===\n{registry}"
    messages = [{"role": "user", "content": user}]
    tools = [WEB_SEARCH_TOOL, WEB_FETCH_TOOL]
    notes: list[str] = []

    for _ in range(_MAX_CONTINUATIONS):
        response = client().messages.create(
            model=MODEL,
            max_tokens=16000,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            system=_RESEARCH_SYSTEM,
            messages=messages,
            tools=tools,
        )
        notes.extend(b.text for b in response.content if b.type == "text")
        if response.stop_reason != "pause_turn":
            break
        # Server-side tool loop hit its limit; re-send to resume.
        messages.append({"role": "assistant", "content": response.content})

    return "\n\n".join(n for n in notes if n.strip())


def _normalize(schema: Schema, notes: str) -> BaseModel:
    """Second pass: structure the gathered notes into the Researched model."""
    model = schema.researched_model()
    instructions = ["Organize the research notes into these categories:"]
    for cat in schema.researched:
        instructions.append(f"- {cat.key}: {cat.prompt or cat.query_hint}")
    instructions.append(
        "\nFor each category, write a concise summary and list the source URLs the "
        "notes cite. Use only URLs that appear in the notes; do not invent sources."
    )
    response = client().messages.parse(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system="You convert research notes into a structured summary.",
        messages=[
            {
                "role": "user",
                "content": f"{chr(10).join(instructions)}\n\n=== RESEARCH NOTES ===\n{notes}",
            }
        ],
        output_format=model,
    )
    return response.parsed_output


def research(schema: Schema, extracted: BaseModel) -> BaseModel:
    """Run both research passes for one asset."""
    facts = _fact_values(extracted)
    notes = _gather(schema, facts)
    return _normalize(schema, notes)
