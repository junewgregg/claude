"""Configuration for the Microsoft 365 integration service.

All secrets and resource ids come from environment variables (set as Azure
Function application settings in production). Validation is lazy: a missing
value only raises when the feature that needs it actually runs, so the pure
pipeline logic stays importable and testable without credentials.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


class ConfigError(RuntimeError):
    """Raised when a required environment variable is absent."""


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ConfigError(f"missing required environment variable: {name}")
    return value


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Config:
    """Resolved settings for one pipeline run."""

    # Anthropic
    # (ANTHROPIC_API_KEY is read by the SDK directly.)

    # DD config files (bundled in the function app or mounted).
    schema_path: Path
    thesis_path: Path  # local fallback if the SharePoint thesis isn't configured

    # Drive-relative path to the editable thesis doc in SharePoint (e.g.
    # "Config/thesis.md"). When set, the thesis is loaded from there each run and
    # the asset's row records the version used.
    thesis_sharepoint_path: str

    # Smartsheet
    smartsheet_token: str
    smartsheet_sheet_id: int

    # Microsoft Graph (app-only / client-credentials) for SharePoint.
    graph_tenant_id: str
    graph_client_id: str
    graph_client_secret: str
    sharepoint_drive_id: str
    sharepoint_base_folder: str

    # Behavior toggles.
    run_research: bool = True

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            schema_path=Path(os.environ.get("DD_SCHEMA_PATH", "config/schema.yaml")),
            thesis_path=Path(os.environ.get("DD_THESIS_PATH", "config/thesis.md")),
            thesis_sharepoint_path=os.environ.get("THESIS_SHAREPOINT_PATH", ""),
            smartsheet_token=_require("SMARTSHEET_TOKEN"),
            smartsheet_sheet_id=int(_require("SMARTSHEET_SHEET_ID")),
            graph_tenant_id=_require("GRAPH_TENANT_ID"),
            graph_client_id=_require("GRAPH_CLIENT_ID"),
            graph_client_secret=_require("GRAPH_CLIENT_SECRET"),
            sharepoint_drive_id=_require("SHAREPOINT_DRIVE_ID"),
            sharepoint_base_folder=os.environ.get("SHAREPOINT_BASE_FOLDER", "Asset Intake"),
            run_research=_flag("RUN_RESEARCH", True),
        )
