"""Structured scorecard schema for the LSB biopharma triage agent.

The schema mirrors the exact section/table structure of the historical
asset-evaluation reports so generated scorecards are drop-in comparable.
"""
from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


# --- Controlled vocabularies (derived from historical reports) -------------

class OverallRating(str, Enum):
    acquire = "Acquire"
    diligence = "Diligence"
    deprioritize = "Deprioritize"


class DiseaseFit(str, Enum):
    preferred = "Preferred"
    adjacent = "Adjacent"
    off_priority = "Off-priority"
    non_core = "Non-core"  # observed in FLD201


class ModalityFit(str, Enum):
    preferred = "Preferred"
    workable = "Workable"
    acceptable = "Acceptable"
    adjacent = "Adjacent"   # observed in FLD103/FLD201
    challenging = "Challenging"


class Conviction(str, Enum):
    high = "High"
    medium_high = "Medium-High"
    medium = "Medium"
    medium_low = "Medium-Low"
    low = "Low"


class GateRead(str, Enum):
    on_target = "On target"
    plausible = "Plausible"
    stretched = "Stretched"
    not_met = "Not met"


class ScreenRead(str, Enum):
    positive = "Positive"
    mixed = "Mixed"
    negative = "Negative"


# Panel determination — the committee-level output, distinct from the
# analyst scorecard rating. Sourced from Wave 2 Cycle 2 compiled outcomes.
class PanelDetermination(str, Enum):
    prioritize = "Prioritize"
    prioritize_tier2 = "Prioritize: Tier 2"
    deprioritize = "Deprioritize"
    hold = "Hold"
    not_for_sale = "Not for sale"


class PanelView(BaseModel):
    determination: PanelDetermination = Field(
        ...,
        description=(
            "Committee-level outcome. 'Prioritize' = move forward actively. "
            "'Prioritize: Tier 2' = worthy but lower urgency than Tier 1. "
            "'Hold' = interesting but blocked (e.g. not yet available). "
            "'Not for sale' = asset not accessible. "
            "'Deprioritize' = do not pursue at this time."
        ),
    )
    rationale: str = Field(
        ...,
        description="1-3 sentences explaining the panel determination, especially where it diverges from the analyst scorecard rating.",
    )
    key_swing_factor: str = Field(
        ...,
        description="The single most decisive factor that drove the panel determination (positive or negative).",
    )


# --- Component models ------------------------------------------------------

class RatingSummary(BaseModel):
    overall_rating: OverallRating
    disease_fit: DiseaseFit
    modality_fit: ModalityFit
    conviction: Conviction
    recommended_posture: str = Field(
        ..., description="One-line posture, e.g. 'Keep active for focused diligence; do not widen scope yet.'"
    )


class AssetSnapshot(BaseModel):
    asset_code: str
    sponsor_source: str
    mechanism: str
    modality: str
    lead_indication: str
    other_indications: str = ""
    stage: str
    source_base: str = Field(..., description="Decks / public sources the read is built on")
    priority_fit: str
    near_term_value_trigger: str


class PriorityFitRow(BaseModel):
    dimension: str  # e.g. "Disease priority", "Modality priority"
    rating: str
    what_supports: str
    what_needs_to_be_true: str


class EvidenceRow(BaseModel):
    source_page: str = Field(..., description="e.g. 'Sponsor deck p.18' or 'ClinicalTrials.gov NCT0...'")
    signal: str
    decision_implication: str
    screen_read: ScreenRead


class ThesisGateRow(BaseModel):
    gate: str  # "Acquisition: Low/no upfront", "Time to value <= 3-5 years",
               # "Dev cost <= $25M", "High POS exit: pharma M&A/BD fit"
    read: GateRead
    commentary: str
    implication: str


class RatingMovement(BaseModel):
    move_to_acquire_if: List[str] = Field(default_factory=list)
    move_to_deprioritize_if: List[str] = Field(default_factory=list)


# --- Top-level scorecard ---------------------------------------------------

class TriageScorecard(BaseModel):
    """Full LSB asset evaluation scorecard."""

    asset_name: str
    headline_modality: str
    screening_view: str = Field(..., description="1-2 sentence top-of-report screen framing")
    lead_asset_framing: str
    why_it_lands: str = Field(..., description="Why it lands at the chosen rating")

    rating: RatingSummary
    executive_conclusion: str
    snapshot: AssetSnapshot

    priority_fit: List[PriorityFitRow]
    evidence: List[EvidenceRow]
    thesis_gates: List[ThesisGateRow]

    best_fit_entry_indication: str
    differentiation_claim: str
    most_coherent_first_story: str
    broadening_risk: str = Field(..., description="What broadening too early would risk")

    key_risks: List[str]
    priority_diligence_requests: List[str]
    out_of_rating_watchouts: List[str]

    rating_movement: RatingMovement
    bottom_line: str
    date_prepared: str

    # Panel-level determination (committee call, distinct from analyst rating)
    panel: PanelView

    def gate_summary(self) -> str:
        return "  ".join(f"{g.gate}: {g.read.value}" for g in self.thesis_gates)
