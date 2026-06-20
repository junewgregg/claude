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

from m365.calibration import generate_report
from m365.config import Config, ConfigError
from m365.feedback import sweep
from m365.pipeline import run
from m365.rescore import rescore

app = func.FunctionApp()


def _config_or_500() -> tuple[Config | None, func.HttpResponse | None]:
    try:
        return Config.from_env(), None
    except ConfigError as e:
        logging.error("configuration error: %s", e)
        return None, func.HttpResponse(str(e), status_code=500)


def _json(result: dict, *, warn_key: str = "warnings") -> func.HttpResponse:
    status = 207 if result.get(warn_key) else 200
    return func.HttpResponse(
        json.dumps(result), status_code=status, mimetype="application/json"
    )


@app.route(route="intake", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def intake(req: func.HttpRequest) -> func.HttpResponse:
    """Called by Power Automate when a new asset email arrives."""
    try:
        payload = req.get_json()
    except ValueError:
        return func.HttpResponse("invalid JSON body", status_code=400)

    config, err = _config_or_500()
    if err:
        return err
    try:
        result = run(payload, config)
    except Exception as e:  # noqa: BLE001
        logging.exception("intake pipeline crashed")
        return func.HttpResponse(f"pipeline error: {e}", status_code=500)
    return _json(result)


@app.route(route="feedback", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def feedback(req: func.HttpRequest) -> func.HttpResponse:
    """Nightly sweep: capture analyst corrections from reviewed rows."""
    config, err = _config_or_500()
    if err:
        return err
    try:
        result = sweep(config)
    except Exception as e:  # noqa: BLE001
        logging.exception("feedback sweep crashed")
        return func.HttpResponse(f"sweep error: {e}", status_code=500)
    return _json(result, warn_key="_none")


@app.route(route="rescore", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def rescore_route(req: func.HttpRequest) -> func.HttpResponse:
    """Manual trigger: re-score active assets against the current thesis."""
    config, err = _config_or_500()
    if err:
        return err
    try:
        result = rescore(config)
    except Exception as e:  # noqa: BLE001
        logging.exception("rescore crashed")
        return func.HttpResponse(f"rescore error: {e}", status_code=500)
    return _json(result, warn_key="_none")


@app.route(route="calibration", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def calibration(req: func.HttpRequest) -> func.HttpResponse:
    """Periodic report: where the agent systematically over/under-scores."""
    config, err = _config_or_500()
    if err:
        return err
    try:
        result = generate_report(config)
    except Exception as e:  # noqa: BLE001
        logging.exception("calibration crashed")
        return func.HttpResponse(f"calibration error: {e}", status_code=500)
    return _json(result, warn_key="_none")
