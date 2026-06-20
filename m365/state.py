"""Persist agent state in SharePoint so the learning loop can close.

Two artifacts live under ``{base_folder}/_state``:

- ``agent_output/{asset_key}.json`` — a snapshot of what the agent produced
  (extracted + scored + thesis version) for each asset. The nightly sweep diffs
  this against the analyst-edited Smartsheet row to derive corrections; the
  rescore job reuses the cached extraction so it never re-reads the deck.
- ``corrections.jsonl`` — the append-only log of analyst corrections, retrieved
  at scoring time as few-shot precedent.
"""

from __future__ import annotations

import json
from typing import Optional

from .config import Config
from .sharepoint import SharePointClient

_STATE = "_state"
_OUTPUTS = "_state/agent_output"
_CORRECTIONS = "corrections.jsonl"


def _base(config: Config, sub: str) -> str:
    return f"{config.sharepoint_base_folder}/{sub}"


def save_agent_output(sp: SharePointClient, config: Config, key: str, payload: dict) -> None:
    sp.upload_file(_base(config, _OUTPUTS), f"{key}.json", json.dumps(payload).encode())


def load_agent_output(sp: SharePointClient, config: Config, key: str) -> Optional[dict]:
    data = sp.read_file(f"{_base(config, _OUTPUTS)}/{key}.json")
    return json.loads(data) if data else None


def append_corrections(sp: SharePointClient, config: Config, records: list[dict]) -> None:
    if not records:
        return
    existing = sp.read_file(f"{_base(config, _STATE)}/{_CORRECTIONS}")
    lines = existing.decode("utf-8").splitlines() if existing else []
    lines += [json.dumps(r) for r in records]
    sp.upload_file(_base(config, _STATE), _CORRECTIONS, ("\n".join(lines) + "\n").encode())


def load_corrections(sp: SharePointClient, config: Config) -> list[dict]:
    data = sp.read_file(f"{_base(config, _STATE)}/{_CORRECTIONS}")
    if not data:
        return []
    return [json.loads(line) for line in data.decode("utf-8").splitlines() if line.strip()]
