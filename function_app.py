"""Azure Functions entry point for the asset-intake service.

Power Automate ("When a new email arrives" in Outlook) posts the email — subject,
sender, body, and base64 attachments — to this HTTP endpoint. The function runs
the full pipeline (extract -> score -> research -> memo -> Smartsheet -> SharePoint)
and returns the resulting links and any warnings.

Deploy with the bundled host.json / requirements.txt; set the secrets from
m365.config as application settings.
"""

from __future__ import annotations

import json
import logging

import azure.functions as func

from m365.config import Config, ConfigError
from m365.pipeline import run

app = func.FunctionApp()


@app.route(route="intake", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def intake(req: func.HttpRequest) -> func.HttpResponse:
    try:
        payload = req.get_json()
    except ValueError:
        return func.HttpResponse("invalid JSON body", status_code=400)

    try:
        config = Config.from_env()
    except ConfigError as e:
        logging.error("configuration error: %s", e)
        return func.HttpResponse(str(e), status_code=500)

    try:
        result = run(payload, config)
    except Exception as e:  # noqa: BLE001
        logging.exception("intake pipeline crashed")
        return func.HttpResponse(f"pipeline error: {e}", status_code=500)

    status = 200 if not result["warnings"] else 207
    return func.HttpResponse(
        json.dumps(result), status_code=status, mimetype="application/json"
    )
