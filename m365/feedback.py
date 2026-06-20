"""Nightly sweep: turn reviewed Smartsheet rows into stored corrections.

Reads rows the team marked Reviewed/Approved, diffs each against the agent's saved
output, appends any corrections to the SharePoint log, and stamps the row's
"Feedback Captured" timestamp so it isn't processed again.
"""

from __future__ import annotations

import datetime as dt

from biotech_dd.schema import load_schema

from . import state
from .config import Config
from .learning import compute_corrections
from .sharepoint import SharePointClient
from .smartsheet_writer import SmartsheetWriter

_REVIEWED = {"reviewed", "approved"}


def sweep(config: Config) -> dict:
    schema = load_schema(config.schema_path)
    sp = SharePointClient(
        config.graph_tenant_id,
        config.graph_client_id,
        config.graph_client_secret,
        config.sharepoint_drive_id,
    )
    writer = SmartsheetWriter(config.smartsheet_token, config.smartsheet_sheet_id)

    rows = writer.read_rows(schema)
    reviewed = 0
    corrections_written = 0

    for row in rows:
        values = row["values"]
        status = values.get("Status", "").strip().lower()
        already = values.get("Feedback Captured", "").strip()
        if status not in _REVIEWED or already:
            continue

        key = values.get("Asset Key", "")
        agent_output = state.load_agent_output(sp, config, key) if key else None
        if not agent_output:
            continue

        reviewed += 1
        corrections = compute_corrections(agent_output, values, schema)
        if corrections:
            state.append_corrections(sp, config, corrections)
            corrections_written += len(corrections)

        writer.update_row(
            row["id"], {"Feedback Captured": dt.datetime.utcnow().isoformat()}, schema
        )

    return {"rows_reviewed": reviewed, "corrections_written": corrections_written}
