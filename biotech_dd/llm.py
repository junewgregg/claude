"""Anthropic client and shared model configuration.

Centralizes the SDK client, model id, and the beta header needed for the
Files API so the rest of the package never hardcodes those details.
"""

from __future__ import annotations

import functools

import anthropic

# Most capable model; adaptive thinking is the default reasoning mode.
MODEL = "claude-opus-4-8"

# Beta header for uploading and referencing PDFs via the Files API.
FILES_BETA = "files-api-2025-04-14"

# Server-side web tools (current versions ship dynamic filtering, which writes
# and runs code to filter results before they reach the context window).
WEB_SEARCH_TOOL = {"type": "web_search_20260209", "name": "web_search"}
WEB_FETCH_TOOL = {"type": "web_fetch_20260209", "name": "web_fetch"}


@functools.lru_cache(maxsize=1)
def client() -> anthropic.Anthropic:
    """Return a process-wide Anthropic client.

    Credentials resolve from the environment (ANTHROPIC_API_KEY or an
    ``ant auth login`` profile); we never hardcode a key.
    """
    return anthropic.Anthropic()
