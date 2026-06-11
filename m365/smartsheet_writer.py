"""Write/upsert asset rows into Smartsheet and attach the memo.

Idempotent by design: rows are keyed on an "Asset Key" column, so re-processing
the same asset updates the existing row instead of duplicating it — that is what
"keep the Smartsheet updated" requires. Missing columns are auto-created from the
DD schema so the sheet only needs to exist, not be pre-built.
"""

from __future__ import annotations

from typing import Optional

import smartsheet

from biotech_dd.schema import Schema

from .mapping import column_plan

KEY_COLUMN = "Asset Key"


class SmartsheetWriter:
    def __init__(self, token: str, sheet_id: int):
        self._ss = smartsheet.Smartsheet(token)
        self._ss.errors_as_exceptions(True)
        self._sheet_id = sheet_id

    # -- columns ----------------------------------------------------------- #

    def ensure_columns(self, schema: Schema) -> dict[str, int]:
        """Create any missing columns; return a name -> column_id map."""
        sheet = self._ss.Sheets.get_sheet(self._sheet_id)
        existing = {c.title: c.id for c in sheet.columns}
        wanted = column_plan(schema)

        missing = [name for name in wanted if name not in existing]
        if missing:
            # Append to the right; the first wanted column is the primary key but
            # the sheet already has a primary column, so all new ones are added.
            new_cols = [
                smartsheet.models.Column(
                    {"title": name, "type": "TEXT_NUMBER", "index": len(existing) + i}
                )
                for i, name in enumerate(missing)
            ]
            self._ss.Sheets.add_columns(self._sheet_id, new_cols)
            sheet = self._ss.Sheets.get_sheet(self._sheet_id)
            existing = {c.title: c.id for c in sheet.columns}
        return existing

    # -- rows -------------------------------------------------------------- #

    def _find_row(self, key_col_id: int, key: str) -> Optional[int]:
        sheet = self._ss.Sheets.get_sheet(self._sheet_id)
        for row in sheet.rows:
            for cell in row.cells:
                if cell.column_id == key_col_id and str(cell.value or "") == key:
                    return row.id
        return None

    def contains(self, schema: Schema, key: str) -> bool:
        """Whether a row with this asset key already exists."""
        col_ids = self.ensure_columns(schema)
        return self._find_row(col_ids[KEY_COLUMN], key) is not None

    def upsert(self, schema: Schema, values: dict[str, str], key: str) -> tuple[int, bool]:
        """Insert or update the row for ``key``. Returns (row_id, created)."""
        col_ids = self.ensure_columns(schema)
        key_col_id = col_ids[KEY_COLUMN]

        cells = [
            smartsheet.models.Cell(
                {"column_id": col_ids[name], "value": value if value != "" else None}
            )
            for name, value in values.items()
            if name in col_ids
        ]

        existing_row_id = self._find_row(key_col_id, key)
        if existing_row_id is not None:
            row = smartsheet.models.Row({"id": existing_row_id, "cells": cells})
            self._ss.Sheets.update_rows(self._sheet_id, [row])
            return existing_row_id, False

        row = smartsheet.models.Row({"to_top": True, "cells": cells})
        result = self._ss.Sheets.add_rows(self._sheet_id, [row])
        return result.result[0].id, True

    # -- attachments ------------------------------------------------------- #

    def attach_file_to_row(self, row_id: int, path: str, content_type: str) -> None:
        """Attach a local file (e.g. the memo) directly to the row."""
        with open(path, "rb") as fh:
            self._ss.Attachments.attach_file_to_row(
                self._sheet_id,
                row_id,
                (path.split("/")[-1], fh, content_type),
            )
