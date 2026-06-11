"""Map DD results to a flat Smartsheet row (pure, no network).

Smartsheet columns are flat, so the nested DD schema is flattened here into a
single ``{column_name: value}`` dict, plus the intake metadata and links. The
same column plan drives both row writes and column auto-creation, so the two
never drift. Kept dependency-free so it can be unit-tested without credentials.
"""

from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel

from biotech_dd.schema import Schema

# Fixed meta columns, in display order.
META_COLUMNS = [
    "Asset Key",
    "Status",
    "Intake Date",
    "Company",
    "Contact Name",
    "Contact Email",
    "Contact Phone",
    "Contact Role",
    "Institute",
    "Source Subject",
    "Source Sender",
    "Memo Link",
    "SharePoint Folder",
]


def asset_key(program_name: Optional[str], company: Optional[str], fallback: str) -> str:
    """Stable, human-readable key used to upsert the row."""
    basis = " ".join(p for p in (program_name, company) if p).strip()
    basis = basis or fallback
    slug = re.sub(r"[^a-z0-9]+", "-", basis.lower()).strip("-")
    return slug or "asset"


def column_plan(schema: Schema) -> list[str]:
    """Ordered list of every column the sheet needs."""
    cols = list(META_COLUMNS)
    for c in schema.extracted:
        cols.append(c.key)
    for c in schema.thesis_scored:
        cols.append(c.key)
        cols.append(f"{c.key} (assessment)")
    for c in schema.researched:
        cols.append(c.key)
        cols.append(f"{c.key} (sources)")
    # De-dupe while preserving order (a meta and extracted key could collide).
    seen: set[str] = set()
    out: list[str] = []
    for name in cols:
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def _v(model: Optional[BaseModel], key: str):
    return getattr(model, key, None) if model is not None else None


def _enum(value) -> str:
    return value.value if value is not None else ""


def build_row(
    schema: Schema,
    *,
    key: str,
    status: str,
    intake,  # IntakeMeta
    extracted: Optional[BaseModel],
    scored: Optional[BaseModel],
    researched: Optional[BaseModel],
    subject: str,
    sender: str,
    intake_date: str,
    memo_link: str = "",
    folder_link: str = "",
) -> dict[str, str]:
    """Produce the flat ``{column_name: value}`` mapping for one asset row."""
    row: dict[str, str] = {
        "Asset Key": key,
        "Status": status,
        "Intake Date": intake_date,
        "Company": intake.company or _val(extracted, "company") or "",
        "Contact Name": intake.contact_name or "",
        "Contact Email": intake.contact_email or "",
        "Contact Phone": intake.contact_phone or "",
        "Contact Role": intake.contact_role or "",
        "Institute": intake.institute or "",
        "Source Subject": subject,
        "Source Sender": sender,
        "Memo Link": memo_link,
        "SharePoint Folder": folder_link,
    }

    for c in schema.extracted:
        row[c.key] = _val(extracted, c.key)

    for c in schema.thesis_scored:
        fld = _v(scored, c.key)
        row[c.key] = "" if getattr(fld, "score", None) is None else str(fld.score)
        label = _enum(getattr(fld, "label", None))
        conf = _enum(getattr(fld, "confidence", None))
        rationale = getattr(fld, "rationale", None) or ""
        head = " / ".join(p for p in (label, conf) if p)
        row[f"{c.key} (assessment)"] = (head + (" — " if head and rationale else "") + rationale).strip()

    for c in schema.researched:
        fld = _v(researched, c.key)
        row[c.key] = getattr(fld, "summary", None) or ""
        sources = getattr(fld, "sources", None) or []
        row[f"{c.key} (sources)"] = "\n".join(sources)

    return row


def _val(extracted: Optional[BaseModel], key: str) -> str:
    fld = _v(extracted, key)
    return getattr(fld, "value", None) or "" if fld is not None else ""
