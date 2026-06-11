"""Microsoft 365 integration for the biopharma due-diligence agent.

Wraps the ``biotech_dd`` pipeline as a service that an Outlook -> Power Automate
flow can call: it ingests an inbound email (PDF deck + free-text contact/institute
details), runs extraction/scoring/research, generates a memo, upserts a Smartsheet
row, and deposits the memo and attachments into SharePoint.
"""

__all__ = ["__version__"]

__version__ = "0.1.0"
