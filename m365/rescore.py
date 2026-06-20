"""Manual rescore: re-judge active assets against the current thesis.

Run after the thesis changes. For each active asset whose stamped Thesis Version
is stale, it reloads the cached extraction (no deck re-read, no re-research),
re-scores against the current thesis with few-shot precedent applied, and updates
the row's score cells, assessment, status, and thesis version.
"""

from __future__ import annotations

from biotech_dd import score as score_mod
from biotech_dd.research import _fact_values
from biotech_dd.schema import load_schema

from . import state
from .config import Config
from .learning import format_examples, select_examples
from .sharepoint import SharePointClient
from .smartsheet_writer import SmartsheetWriter
from .thesis_store import get_thesis

_INACTIVE = {"rejected", "archived"}


def rescore(config: Config) -> dict:
    schema = load_schema(config.schema_path)
    sp = SharePointClient(
        config.graph_tenant_id,
        config.graph_client_id,
        config.graph_client_secret,
        config.sharepoint_drive_id,
    )
    writer = SmartsheetWriter(config.smartsheet_token, config.smartsheet_sheet_id)
    thesis, version = get_thesis(config, sp)
    corrections = state.load_corrections(sp, config)
    scored_categories = [c.key for c in schema.thesis_scored]
    extracted_model = schema.extracted_model()
    scored_model = schema.scored_model()

    rows = writer.read_rows(schema)
    rescored = 0
    skipped = 0

    for row in rows:
        values = row["values"]
        status = values.get("Status", "").strip().lower()
        if status in _INACTIVE or values.get("Thesis Version", "") == version:
            continue

        key = values.get("Asset Key", "")
        agent_output = state.load_agent_output(sp, config, key) if key else None
        if not agent_output or not agent_output.get("extracted"):
            skipped += 1
            continue

        extracted = extracted_model.model_validate(agent_output["extracted"])
        facts = _fact_values(extracted)
        examples = format_examples(select_examples(corrections, facts, scored_categories))
        scored = score_mod.score(schema, thesis, extracted, examples)

        updates = {"Thesis Version": version, "Status": "Re-scored"}
        for c in schema.thesis_scored:
            fld = getattr(scored, c.key)
            updates[c.key] = "" if fld.score is None else str(fld.score)
            label = fld.label.value if fld.label else ""
            conf = fld.confidence.value if fld.confidence else ""
            head = " / ".join(p for p in (label, conf) if p)
            rationale = fld.rationale or ""
            updates[f"{c.key} (assessment)"] = (
                head + (" — " if head and rationale else "") + rationale
            ).strip()
        writer.update_row(row["id"], updates, schema)

        # Refresh the stored snapshot so future diffs/rescores use the new scores.
        agent_output["scored"] = scored.model_dump(mode="json")
        agent_output["thesis_version"] = version
        state.save_agent_output(sp, config, key, agent_output)
        rescored += 1

    return {"rescored": rescored, "skipped": skipped, "thesis_version": version}
