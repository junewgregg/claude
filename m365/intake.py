"""Parse the inbound email and pull contact/institute details from free text.

The Power Automate flow posts a JSON envelope describing the email. We normalize
it into an :class:`EmailPayload`, then use the LLM to read the body (and the deck,
when available) and extract the originating contact and institute, which the
sender writes as free text rather than a fixed form.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Optional

from pydantic import BaseModel

from biotech_dd.llm import FILES_BETA, MODEL, client


@dataclass
class Attachment:
    name: str
    content_type: str
    data: bytes


@dataclass
class EmailPayload:
    """Normalized inbound email."""

    subject: str = ""
    sender: str = ""
    received: str = ""
    body: str = ""
    attachments: list[Attachment] = field(default_factory=list)

    @property
    def pdf_attachments(self) -> list[Attachment]:
        return [
            a
            for a in self.attachments
            if a.name.lower().endswith(".pdf") or a.content_type == "application/pdf"
        ]


class IntakeMeta(BaseModel):
    """Contact and institute details lifted from the email."""

    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_role: Optional[str] = None
    institute: Optional[str] = None
    company: Optional[str] = None
    notes: Optional[str] = None


_INTAKE_SYSTEM = (
    "You read an inbound email about a biopharma asset and extract who sent it and "
    "which organization they represent. Pull the contact name, email, phone, and "
    "role, plus the institute/academic affiliation and the company/developer if "
    "stated. Use the email body first; consult the attached deck only to fill gaps. "
    "Return null for anything not present. Do not invent contact details."
)


def parse_payload(raw: dict) -> EmailPayload:
    """Normalize the Power Automate JSON envelope into an EmailPayload.

    Accepts both camelCase (Graph/Power Automate defaults) and snake_case keys.
    Attachments carry base64 ``contentBytes``.
    """

    def pick(*keys, default=""):
        for k in keys:
            if raw.get(k):
                return raw[k]
        return default

    attachments: list[Attachment] = []
    for att in raw.get("attachments", []) or []:
        b64 = att.get("contentBytes") or att.get("content_bytes") or ""
        if not b64:
            continue
        attachments.append(
            Attachment(
                name=att.get("name", "attachment"),
                content_type=att.get("contentType") or att.get("content_type", ""),
                data=base64.b64decode(b64),
            )
        )

    return EmailPayload(
        subject=pick("subject"),
        sender=pick("from", "sender", "from_address"),
        received=pick("receivedDateTime", "received", "received_at"),
        body=pick("body", "bodyPreview", "body_text"),
        attachments=attachments,
    )


def extract_intake(body: str, sender: str, deck_file_id: Optional[str] = None) -> IntakeMeta:
    """LLM-extract contact/institute details from the email body (+ optional deck)."""
    content: list[dict] = []
    if deck_file_id:
        content.append(
            {"type": "document", "source": {"type": "file", "file_id": deck_file_id}}
        )
    content.append(
        {
            "type": "text",
            "text": (
                f"Sender address (from the mail header): {sender}\n\n"
                f"=== EMAIL BODY ===\n{body}"
            ),
        }
    )

    response = client().messages.parse(
        model=MODEL,
        max_tokens=2000,
        system=_INTAKE_SYSTEM,
        messages=[{"role": "user", "content": content}],
        output_format=IntakeMeta,
        extra_headers={"anthropic-beta": FILES_BETA} if deck_file_id else None,
    )
    meta = response.parsed_output
    # Fall back to the header address if the body didn't restate it.
    if not meta.contact_email and "@" in sender:
        meta.contact_email = sender
    return meta
