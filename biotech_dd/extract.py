"""Tier 1 - extract structured facts from a PDF deck.

The deck is uploaded once via the Files API and referenced as a ``document``
content block, so Claude reads both the text and the figures/charts (vision).
Output is constrained to the dynamic ``Extracted`` model, and every field
carries the slide it came from for provenance.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel

from .llm import FILES_BETA, MODEL, client
from .schema import Schema

_SYSTEM = (
    "You are a meticulous biopharma due-diligence analyst. Extract the requested "
    "fields from the asset pitch deck. Read figures, tables, and charts as well as "
    "body text. For each field, record the value exactly as supported by the deck "
    "and the slide number it appears on. If a field is not addressed anywhere in "
    "the deck, return null for its value and null for its source_slide. Never "
    "infer, estimate, or invent a value that the deck does not state."
)


def upload_deck(pdf_path: str | Path) -> str:
    """Upload a PDF and return its file id for reuse across calls."""
    path = Path(pdf_path)
    uploaded = client().beta.files.upload(
        file=(path.name, path.open("rb"), "application/pdf"),
    )
    return uploaded.id


def _field_instructions(schema: Schema) -> str:
    lines = ["Extract these fields:"]
    for cat in schema.extracted:
        lines.append(f"- {cat.key}: {cat.prompt}")
    return "\n".join(lines)


def extract(schema: Schema, file_id: str) -> BaseModel:
    """Run extraction against an already-uploaded deck."""
    model = schema.extracted_model()
    response = client().messages.parse(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {"type": "file", "file_id": file_id},
                    },
                    {"type": "text", "text": _field_instructions(schema)},
                ],
            }
        ],
        output_format=model,
        extra_headers={"anthropic-beta": FILES_BETA},
    )
    return response.parsed_output
