"""Load the DD category config and build per-tier Pydantic models.

The whole due-diligence schema lives in ``config/schema.yaml`` so analysts can
add, remove, or rename categories without touching code. This module loads that
file and constructs the dynamic Pydantic models that drive structured-output
extraction and scoring.

Note on structured outputs: the API rejects numeric constraints (min/max) in the
schema, so a category's ``scale`` is enforced via the prompt and validated after
the call, not baked into the JSON schema. Enums (label, confidence) are supported.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, create_model


class Label(str, enum.Enum):
    """Qualitative thesis-fit verdict that accompanies a numeric score."""

    STRONG = "Strong"
    PARTIAL = "Partial"
    WEAK = "Weak"
    MISALIGNED = "Misaligned"


class Confidence(str, enum.Enum):
    """Evidence strength behind a score or finding."""

    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class ExtractedField(BaseModel):
    """One fact pulled from the deck, with the slide it came from."""

    value: Optional[str] = None
    source_slide: Optional[int] = None


class ScoredField(BaseModel):
    """A thesis-scored category: number, label, rationale, and confidence."""

    score: Optional[int] = None
    label: Optional[Label] = None
    rationale: Optional[str] = None
    confidence: Optional[Confidence] = None


class ResearchedField(BaseModel):
    """A researched category: a written summary plus its source URLs."""

    summary: Optional[str] = None
    sources: list[str] = []


@dataclass
class Category:
    """A single column in one tier of the DD table."""

    key: str
    prompt: str = ""
    scale: tuple[int, int] = (1, 5)
    query_hint: str = ""


@dataclass
class Schema:
    """The full, parsed DD configuration."""

    asset_name_field: str
    extracted: list[Category] = field(default_factory=list)
    thesis_scored: list[Category] = field(default_factory=list)
    researched: list[Category] = field(default_factory=list)

    # ---- dynamic Pydantic models, one per tier ----

    def extracted_model(self) -> type[BaseModel]:
        fields = {c.key: (ExtractedField, ...) for c in self.extracted}
        return create_model("Extracted", **fields)

    def scored_model(self) -> type[BaseModel]:
        fields = {c.key: (ScoredField, ...) for c in self.thesis_scored}
        return create_model("Scored", **fields)

    def researched_model(self) -> type[BaseModel]:
        fields = {c.key: (ResearchedField, ...) for c in self.researched}
        return create_model("Researched", **fields)


def _categories(raw: list[dict]) -> list[Category]:
    out: list[Category] = []
    for item in raw or []:
        scale = item.get("scale", [1, 5])
        out.append(
            Category(
                key=item["key"],
                prompt=item.get("prompt", ""),
                scale=(int(scale[0]), int(scale[1])),
                query_hint=item.get("query_hint", ""),
            )
        )
    return out


def load_schema(path: str | Path) -> Schema:
    """Parse ``schema.yaml`` into a :class:`Schema`."""
    data = yaml.safe_load(Path(path).read_text())
    tiers = data.get("tiers", {})
    return Schema(
        asset_name_field=data["asset_name_field"],
        extracted=_categories(tiers.get("extracted", [])),
        thesis_scored=_categories(tiers.get("thesis_scored", [])),
        researched=_categories(tiers.get("researched", [])),
    )
