#!/usr/bin/env python3
"""Post a sample intake payload to the running function — for local live testing.

Builds the same JSON envelope Power Automate sends (subject, from, body, base64
attachments) from a real PDF and posts it to the /intake endpoint, so you can
exercise the full pipeline + Smartsheet/SharePoint writers without wiring Outlook
first.

Examples:
  python scripts/post_intake.py --pdf deck.pdf \
      --from "jane@institute.edu" \
      --subject "[Asset] KRAS program" \
      --body "Hi — sharing our lead asset. Contact: Dr Jane Doe, MIT, 617-555-1212."

  # Against a deployed function (needs the function key):
  python scripts/post_intake.py --pdf deck.pdf --body-file note.txt \
      --url https://<app>.azurewebsites.net/api/intake --code "<function-key>"
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import sys
from pathlib import Path

import requests


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default="http://localhost:7071/api/intake")
    ap.add_argument("--code", default="", help="function key (deployed only)")
    ap.add_argument("--pdf", action="append", required=True, help="attachment path (repeatable)")
    ap.add_argument("--subject", default="[Asset] Test intake")
    ap.add_argument("--from", dest="sender", default="tester@example.com")
    ap.add_argument("--body", default="")
    ap.add_argument("--body-file", default="")
    args = ap.parse_args()

    body = args.body
    if args.body_file:
        body = Path(args.body_file).read_text()

    attachments = []
    for path in args.pdf:
        p = Path(path)
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        attachments.append(
            {
                "name": p.name,
                "contentType": ctype,
                "contentBytes": base64.b64encode(p.read_bytes()).decode(),
            }
        )

    payload = {
        "subject": args.subject,
        "from": args.sender,
        "receivedDateTime": "",
        "body": body,
        "attachments": attachments,
    }

    url = args.url + (f"?code={args.code}" if args.code else "")
    print(f"POST {args.url}  ({len(attachments)} attachment(s))")
    resp = requests.post(url, json=payload, timeout=900)
    print(f"status: {resp.status_code}")
    try:
        print(json.dumps(resp.json(), indent=2))
    except ValueError:
        print(resp.text)
    return 0 if resp.status_code < 400 else 1


if __name__ == "__main__":
    sys.exit(main())
