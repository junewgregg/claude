"""Deposit files into SharePoint via Microsoft Graph (app-only auth).

Uses the client-credentials flow (MSAL) so the service runs unattended against a
configured drive. Creates a per-asset folder under a base folder and uploads the
memo plus the original attachments, returning their web URLs.
"""

from __future__ import annotations

import msal
import requests

GRAPH = "https://graph.microsoft.com/v1.0"
_UPLOAD_CHUNK = 5 * 1024 * 1024  # 5 MiB


class SharePointClient:
    def __init__(self, tenant_id: str, client_id: str, client_secret: str, drive_id: str):
        self._app = msal.ConfidentialClientApplication(
            client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            client_credential=client_secret,
        )
        self._drive_id = drive_id

    def _token(self) -> str:
        result = self._app.acquire_token_for_client(
            scopes=["https://graph.microsoft.com/.default"]
        )
        if "access_token" not in result:
            raise RuntimeError(
                f"Graph token error: {result.get('error_description', result.get('error'))}"
            )
        return result["access_token"]

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token()}"}

    def ensure_folder(self, base_folder: str, name: str) -> dict:
        """Create ``base_folder/name`` (idempotent) and return the folder item."""
        # Ensure the base folder exists first.
        self._create_child("root", base_folder)
        return self._create_child(f"root:/{base_folder}:", name)

    def _create_child(self, parent_ref: str, name: str) -> dict:
        url = f"{GRAPH}/drives/{self._drive_id}/{parent_ref}/children"
        body = {
            "name": name,
            "folder": {},
            "@microsoft.graph.conflictBehavior": "replace",
        }
        resp = requests.post(url, headers=self._headers(), json=body, timeout=60)
        resp.raise_for_status()
        return resp.json()

    def upload_file(self, folder_path: str, filename: str, data: bytes) -> str:
        """Upload bytes into ``folder_path`` via an upload session; return webUrl."""
        item_path = f"root:/{folder_path}/{filename}:"
        session = requests.post(
            f"{GRAPH}/drives/{self._drive_id}/{item_path}/createUploadSession",
            headers=self._headers(),
            json={"item": {"@microsoft.graph.conflictBehavior": "replace"}},
            timeout=60,
        )
        session.raise_for_status()
        upload_url = session.json()["uploadUrl"]

        size = len(data)
        item: dict = {}
        for start in range(0, max(size, 1), _UPLOAD_CHUNK):
            chunk = data[start : start + _UPLOAD_CHUNK]
            end = start + len(chunk) - 1
            headers = {
                "Content-Length": str(len(chunk)),
                "Content-Range": f"bytes {start}-{end}/{size}",
            }
            resp = requests.put(upload_url, headers=headers, data=chunk, timeout=120)
            resp.raise_for_status()
            if resp.status_code in (200, 201):
                item = resp.json()
        return item.get("webUrl", "")
