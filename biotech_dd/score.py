"""Tier 2 - score the asset against the investment thesis.

Each scored category returns a numeric score, a qualitative label, a written
rationale grounded in the extracted facts, and a confidence flag. The thesis is
placed at the front of the prompt (cached) so it is reused cheaply across assets.
"""

from __future__ import annotations

import json

from pydantic import BaseModel

from .llm import MODEL, client
from .schema import Schema

_SYSTEM_PREFIX = (
    "You are an investment-committee analyst at a biopharma private-equity firm. "
    "Score a candidate asset against the firm's investment thesis. For each "
    "category: assign a score within the stated scale, a label (Strong, Partial, "
    "Weak, or Misaligned), a one-to-three sentence rationale that cites the "
    "specific extracted fact(s) you relied on, and a confidence level (High, "
    "Medium, Low) reflecting how much deck evidence supports the judgment. If the "
    "deck lacks the evidence to judge a category, say so in the rationale and set "
    "confidence to Low.\n\n=== INVESTMENT THESIS ===\n"
)


def _facts_block(extracted: BaseModel) -> str:
    return json.dumps(extracted.model_dump(mode="json"), indent=2)


def _category_instructions(schema: Schema) -> str:
    lines = ["Score these categories:"]
    for cat in schema.thesis_scored:
        lines.append(f"- {cat.key} (scale {cat.scale[0]}-{cat.scale[1]}): {cat.prompt}")
    return "\n".join(lines)


def _clamp_scores(scored: BaseModel, schema: Schema) -> BaseModel:
    """Keep scores inside each category's configured scale."""
    by_key = {c.key: c for c in schema.thesis_scored}
    for key, value in scored:
        cat = by_key.get(key)
        if cat and value.score is not None:
            lo, hi = cat.scale
            value.score = max(lo, min(hi, value.score))
    return scored


def score(
    schema: Schema, thesis: str, extracted: BaseModel, examples: str = ""
) -> BaseModel:
    """Score one asset's extracted facts against the thesis.

    ``examples`` is optional few-shot text (precedent analyst corrections on
    similar past deals) injected to steer the rubric without changing it.
    """
    model = schema.scored_model()
    user = f"{_category_instructions(schema)}\n\n"
    if examples:
        user += f"=== PRECEDENT FROM REVIEWED DEALS ===\n{examples}\n\n"
    user += f"=== EXTRACTED ASSET FACTS ===\n{_facts_block(extracted)}"

    response = client().messages.parse(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        system=[
            {
                "type": "text",
                "text": _SYSTEM_PREFIX + thesis,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user}],
        output_format=model,
    )
    return _clamp_scores(response.parsed_output, schema)
