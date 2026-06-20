"""Orchestrate one inbound email end to end.

Ties the ``biotech_dd`` brain (extract -> score -> research -> memo) to the M365
writers (Smartsheet upsert, SharePoint deposit) and the learning loop (few-shot
precedent in, agent-output snapshot out). Each external stage is wrapped so a
single failure degrades gracefully and is reported, rather than dropping the whole
intake.
"""

from __future__ import annotations

import datetime as dt
import tempfile
from pathlib import Path
from typing import Optional

from biotech_dd import extract as extract_mod
from biotech_dd import research as research_mod
from biotech_dd import score as score_mod
from biotech_dd.report import AssetResult, write_memo
from biotech_dd.research import _fact_values
from biotech_dd.schema import load_schema

from . import state
from .config import Config
from .intake import extract_intake, parse_payload
from .learning import format_examples, select_examples
from .mapping import asset_key, build_row
from .sharepoint import SharePointClient
from .smartsheet_writer import SmartsheetWriter
from .thesis_store import get_thesis


def run(raw_payload: dict, config: Config) -> dict:
    payload = parse_payload(raw_payload)
    schema = load_schema(config.schema_path)
    warnings: list[str] = []

    # SharePoint client is needed for the thesis, the corrections log, and deposit.
    sp: Optional[SharePointClient] = None
    try:
        sp = SharePointClient(
            config.graph_tenant_id,
            config.graph_client_id,
            config.graph_client_secret,
            config.sharepoint_drive_id,
        )
    except Exception as e:  # noqa: BLE001
        warnings.append(f"SharePoint client init failed: {e}")

    thesis, thesis_version = get_thesis(config, sp)
    corrections = []
    if sp is not None:
        try:
            corrections = state.load_corrections(sp, config)
        except Exception as e:  # noqa: BLE001
            warnings.append(f"could not load corrections: {e}")

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)

        # Persist attachments so we can upload them to Anthropic and SharePoint.
        saved: list[tuple[str, Path, str]] = []  # (name, path, content_type)
        for att in payload.attachments:
            p = tmpdir / att.name
            p.write_bytes(att.data)
            saved.append((att.name, p, att.content_type or "application/octet-stream"))

        pdfs = payload.pdf_attachments
        deck_file_id = None
        extracted = scored = researched = None

        # --- Anthropic stages (deck-dependent) ---------------------------- #
        if pdfs:
            deck_path = tmpdir / pdfs[0].name
            deck_file_id = extract_mod.upload_deck(deck_path)
            try:
                extracted = extract_mod.extract(schema, deck_file_id)
            except Exception as e:  # noqa: BLE001
                warnings.append(f"extraction failed: {e}")
        else:
            warnings.append("no PDF attachment found; extraction skipped")

        intake = extract_intake(payload.body, payload.sender, deck_file_id)

        if extracted is not None:
            facts = _fact_values(extracted)
            categories = [c.key for c in schema.thesis_scored]
            examples = format_examples(select_examples(corrections, facts, categories))
            try:
                scored = score_mod.score(schema, thesis, extracted, examples)
            except Exception as e:  # noqa: BLE001
                warnings.append(f"scoring failed: {e}")
            if config.run_research:
                try:
                    researched = research_mod.research(schema, extracted)
                except Exception as e:  # noqa: BLE001
                    warnings.append(f"research failed: {e}")

        # --- identity ----------------------------------------------------- #
        program = _field(extracted, schema.asset_name_field)
        company = intake.company or _field(extracted, "company")
        fallback = (pdfs[0].name.rsplit(".", 1)[0] if pdfs else payload.subject) or "asset"
        key = asset_key(program, company, fallback)
        name = program or fallback

        # --- memo --------------------------------------------------------- #
        memo_path = tmpdir / f"{key}-memo.md"
        result = AssetResult(
            name=name,
            source_pdf=pdfs[0].name if pdfs else "(no deck)",
            extracted=extracted,
            scored=scored,
            researched=researched,
        )
        write_memo(schema, result, memo_path)

        # --- SharePoint: deposit + state snapshot ------------------------- #
        folder_link = ""
        memo_link = ""
        attachment_links: list[str] = []
        folder_name = f"{key} - {dt.date.today().isoformat()}"
        if sp is not None:
            try:
                folder = sp.ensure_folder(config.sharepoint_base_folder, folder_name)
                folder_link = folder.get("webUrl", "")
                folder_path = f"{config.sharepoint_base_folder}/{folder_name}"
                memo_link = sp.upload_file(folder_path, memo_path.name, memo_path.read_bytes())
                for name_, path_, _ct in saved:
                    attachment_links.append(
                        sp.upload_file(folder_path, name_, path_.read_bytes())
                    )
            except Exception as e:  # noqa: BLE001
                warnings.append(f"SharePoint deposit failed: {e}")

            # Snapshot what the agent produced so the learning loop can diff it.
            try:
                state.save_agent_output(
                    sp,
                    config,
                    key,
                    {
                        "extracted": extracted.model_dump(mode="json") if extracted else {},
                        "scored": scored.model_dump(mode="json") if scored else {},
                        "thesis_version": thesis_version,
                    },
                )
            except Exception as e:  # noqa: BLE001
                warnings.append(f"could not save agent-output snapshot: {e}")

        # --- Smartsheet --------------------------------------------------- #
        row_id = None
        created = None
        try:
            writer = SmartsheetWriter(config.smartsheet_token, config.smartsheet_sheet_id)
            created = not writer.contains(schema, key)
            row = build_row(
                schema,
                key=key,
                status="New" if created else "Updated",
                intake=intake,
                extracted=extracted,
                scored=scored,
                researched=researched,
                subject=payload.subject,
                sender=payload.sender,
                intake_date=payload.received or dt.datetime.utcnow().isoformat(),
                thesis_version=thesis_version,
                memo_link=memo_link,
                folder_link=folder_link,
            )
            row_id, _ = writer.upsert(schema, row, key)
            writer.attach_file_to_row(row_id, str(memo_path), "text/markdown")
        except Exception as e:  # noqa: BLE001
            warnings.append(f"Smartsheet write failed: {e}")

    return {
        "asset_key": key,
        "asset_name": name,
        "thesis_version": thesis_version,
        "smartsheet_row_id": row_id,
        "smartsheet_created": created,
        "sharepoint_folder": folder_link,
        "memo_link": memo_link,
        "attachment_links": attachment_links,
        "warnings": warnings,
    }


def _field(extracted, key: str) -> str:
    fld = getattr(extracted, key, None) if extracted is not None else None
    return getattr(fld, "value", None) or "" if fld is not None else ""
