"""Biopharma due-diligence agent.

A config-driven pipeline that turns asset pitch decks (PDF) plus an investment
thesis into a populated due-diligence table across three category tiers:

1. extracted     - facts read directly from the deck (text + vision)
2. thesis_scored - categories scored against the firm's thesis
3. researched    - categories filled via independent web research

Outputs an .xlsx comparison table and a per-asset Markdown memo.
"""

__all__ = ["__version__"]

__version__ = "0.1.0"
