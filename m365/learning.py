"""Pure learning logic: derive corrections and select few-shot precedent.

No network or SDK calls here so the diffing and retrieval can be unit-tested.
The orchestration that fetches state and writes back lives in ``feedback.py`` and
``rescore.py``.
"""

from __future__ import annotations

import datetime as dt
import re

from biotech_dd.schema import Schema

_TAG_FIELDS = ("lead_indication", "modality", "mechanism")
_STOP = {"the", "and", "for", "with", "of", "in", "a", "an", "to"}


def _tokens(text: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", (text or "").lower()) if len(t) > 2 and t not in _STOP}


def tags_from_facts(facts: dict[str, str]) -> dict[str, str]:
    return {f: facts.get(f, "") for f in _TAG_FIELDS}


def _similarity(a: dict[str, str], b: dict[str, str]) -> float:
    ta = set().union(*[_tokens(a.get(f, "")) for f in _TAG_FIELDS]) if a else set()
    tb = set().union(*[_tokens(b.get(f, "")) for f in _TAG_FIELDS]) if b else set()
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


# --------------------------------------------------------------------------- #
# Corrections
# --------------------------------------------------------------------------- #


def compute_corrections(agent_output: dict, row_values: dict, schema: Schema) -> list[dict]:
    """Diff the agent's snapshot against the analyst-edited row."""
    extracted = agent_output.get("extracted", {}) or {}
    scored = agent_output.get("scored", {}) or {}
    tags = {f: (extracted.get(f, {}) or {}).get("value", "") for f in _TAG_FIELDS}
    notes = row_values.get("Reviewer Notes", "").strip()
    key = row_values.get("Asset Key", "")
    version = agent_output.get("thesis_version", "")
    now = dt.datetime.utcnow().isoformat()

    out: list[dict] = []

    def record(category: str, field: str, agent_value, analyst_value) -> None:
        out.append(
            {
                "asset_key": key,
                "category": category,
                "field": field,
                "agent_value": "" if agent_value is None else str(agent_value),
                "analyst_value": "" if analyst_value is None else str(analyst_value),
                "reviewer_notes": notes,
                "tags": tags,
                "thesis_version": version,
                "captured_at": now,
            }
        )

    for c in schema.thesis_scored:
        agent_score = (scored.get(c.key, {}) or {}).get("score")
        analyst_score = row_values.get(c.key, "").strip()
        if analyst_score and str(agent_score) != analyst_score:
            record(c.key, "score", agent_score, analyst_score)

    for c in schema.extracted:
        agent_val = (extracted.get(c.key, {}) or {}).get("value")
        analyst_val = row_values.get(c.key, "").strip()
        if analyst_val and (agent_val or "").strip() != analyst_val:
            record(c.key, "extracted", agent_val, analyst_val)

    # Standalone reviewer note with no field-level diff is still signal.
    if notes and not out:
        record("", "note", "", "")

    return out


# --------------------------------------------------------------------------- #
# Few-shot retrieval
# --------------------------------------------------------------------------- #


def select_examples(
    corrections: list[dict], facts: dict[str, str], categories: list[str], k: int = 3
) -> list[dict]:
    """Pick the most relevant past corrections for scoring this asset."""
    target = tags_from_facts(facts)
    scored = []
    for corr in corrections:
        sim = _similarity(corr.get("tags", {}), target)
        relevant = corr.get("field") == "score" and corr.get("category") in categories
        # Rank: prefer scoring precedent, then tag similarity, then recency.
        rank = (1 if relevant else 0, round(sim, 3), corr.get("captured_at", ""))
        if sim > 0 or relevant:
            scored.append((rank, corr))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:k]]


def format_examples(examples: list[dict]) -> str:
    """Render selected corrections as compact few-shot text."""
    if not examples:
        return ""
    lines = []
    for ex in examples:
        tags = ex.get("tags", {})
        tag_str = "; ".join(f"{f}={tags.get(f, '')}" for f in _TAG_FIELDS if tags.get(f))
        head = f"[{tag_str}] " if tag_str else ""
        if ex.get("field") == "score":
            lines.append(
                f"- {head}category '{ex['category']}': agent scored {ex['agent_value']}, "
                f"analyst corrected to {ex['analyst_value']}."
            )
        elif ex.get("field") == "extracted":
            lines.append(
                f"- {head}extracted '{ex['category']}': agent had "
                f"'{ex['agent_value']}', analyst corrected to '{ex['analyst_value']}'."
            )
        else:
            lines.append(f"- {head}analyst note on a similar deal.")
        if ex.get("reviewer_notes"):
            lines.append(f"  rationale: {ex['reviewer_notes']}")
    return "\n".join(lines)
