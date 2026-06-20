"""Triage agent: deck + public sources -> LSB TriageScorecard.

Uses the Claude API with tool use to pull public evidence, then emits a
structured scorecard via a forced final tool call.
"""
from __future__ import annotations

import json
import os
from typing import List, Optional

import anthropic

from .prompts import build_system_prompt
from .scorecard import TriageScorecard
from .tools import TOOL_FUNCS, TOOL_SCHEMAS, deck_to_prompt_block

DEFAULT_MODEL = os.environ.get("LSB_TRIAGE_MODEL", "claude-opus-4-8")
MAX_TURNS = 12


def _scorecard_tool() -> dict:
    """Force the final structured answer through a tool with the Pydantic schema."""
    return {
        "name": "emit_scorecard",
        "description": "Emit the final LSB asset-evaluation scorecard. Call exactly once, last.",
        "input_schema": TriageScorecard.model_json_schema(),
    }


class TriageAgent:
    def __init__(self, model: str = DEFAULT_MODEL, max_examples: int = 3, verbose: bool = True):
        self.client = anthropic.Anthropic()
        self.model = model
        self.system = build_system_prompt(max_examples=max_examples)
        self.verbose = verbose
        self.tools = TOOL_SCHEMAS + [_scorecard_tool()]

    def _log(self, *a):
        if self.verbose:
            print(*a, flush=True)

    def triage(self, deck_paths: List[str], asset_hint: str = "") -> TriageScorecard:
        deck_blocks = []
        for p in deck_paths:
            try:
                deck_blocks.append(deck_to_prompt_block(p))
            except Exception as e:  # noqa: BLE001
                self._log(f"[warn] could not parse {p}: {e}")
        deck_text = "\n\n".join(deck_blocks) if deck_blocks else "(no deck provided)"

        user = (
            f"Triage the following asset for the LevelSet Bio (LSB) screen.\n"
            f"Analyst hint: {asset_hint or '(none)'}\n\n"
            f"=== UPLOADED NON-CONFIDENTIAL MATERIALS ===\n{deck_text}\n\n"
            "Steps:\n"
            "1. Read the materials and identify the lead asset, mechanism, modality, "
            "lead indication, stage, sponsor/institution, and IP status.\n"
            "2. Check all pre-screen hard filters. If any fail, flag clearly and "
            "recommend Deprioritize before going further.\n"
            "3. Use the public-data tools to verify or fill gaps in the sponsor's "
            "claims — especially: ClinicalTrials.gov for trial stage/status, "
            "PubMed for independent evidence depth, USPTO for IP coverage, "
            "CMS for SoC reimbursement context. Only cite what you retrieve.\n"
            "4. Assess pharma M&A/BD exit likelihood: which large pharma would "
            "plausibly acquire this, and does it land in their stated priority TAs?\n"
            "5. Score the four LSB thesis gates.\n"
            "6. Call emit_scorecard exactly once with the complete scorecard."
        )

        messages = [{"role": "user", "content": user}]

        for turn in range(MAX_TURNS):
            force_final = turn == MAX_TURNS - 1
            resp = self.client.messages.create(
                model=self.model,
                max_tokens=8000,
                system=self.system,
                tools=self.tools,
                tool_choice={"type": "tool", "name": "emit_scorecard"} if force_final else {"type": "auto"},
                messages=messages,
            )
            messages.append({"role": "assistant", "content": resp.content})

            tool_uses = [b for b in resp.content if b.type == "tool_use"]
            if not tool_uses:
                # No tool call and not done — nudge toward final output.
                messages.append({"role": "user", "content": "Now call emit_scorecard with the final scorecard."})
                continue

            results = []
            for tu in tool_uses:
                if tu.name == "emit_scorecard":
                    self._log("[agent] emitting scorecard")
                    return TriageScorecard.model_validate(tu.input)
                fn = TOOL_FUNCS.get(tu.name)
                self._log(f"[agent] tool: {tu.name}({json.dumps(tu.input)[:120]})")
                output = fn(**tu.input) if fn else {"error": f"unknown tool {tu.name}"}
                results.append({
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": json.dumps(output)[:8000],
                })
            messages.append({"role": "user", "content": results})

        raise RuntimeError("Agent did not produce a scorecard within MAX_TURNS")
