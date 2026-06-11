"""Load the investment thesis from a versioned source.

When ``THESIS_SHAREPOINT_PATH`` is set, the thesis is read from a SharePoint doc
the team edits directly, so strategy changes need no redeploy. Each load returns a
short content hash as the version, which is stamped onto every scored row — that is
what lets the rescore job tell which assets were scored under an older thesis.
Falls back to the bundled ``config/thesis.md`` when SharePoint isn't configured.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Optional

from .config import Config
from .sharepoint import SharePointClient


def _version(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def get_thesis(config: Config, sp: Optional[SharePointClient] = None) -> tuple[str, str]:
    """Return ``(thesis_text, version)``."""
    if config.thesis_sharepoint_path and sp is not None:
        data = sp.read_file(config.thesis_sharepoint_path)
        if data is not None:
            text = data.decode("utf-8", "replace")
            return text, _version(text)
    text = Path(config.thesis_path).read_text()
    return text, _version(text)
