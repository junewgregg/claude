"""Direct ClinicalTrials.gov enrichment (public API v2, no key required).

Web search can find trials, but mining the registry directly is deterministic and
authoritative. Given the deck's extracted facts, this pulls matching study records
— first by any NCT ids mentioned, then by condition + intervention — and returns a
compact, URL-stamped digest that is prepended to the research notes so the model
works from real registry data rather than what a search happens to surface.
"""

from __future__ import annotations

import re

import requests

API = "https://clinicaltrials.gov/api/v2/studies"
_NCT = re.compile(r"NCT\d{8}", re.IGNORECASE)
_TIMEOUT = 30
_FIELDS = (
    "NCTId,BriefTitle,OverallStatus,Phase,Condition,InterventionName,"
    "EnrollmentCount,StudyType,LeadSponsorName,PrimaryCompletionDate"
)


def find_nct_ids(facts: dict[str, str]) -> list[str]:
    ids: list[str] = []
    for value in facts.values():
        ids += [m.upper() for m in _NCT.findall(value or "")]
    # De-dupe, preserve order.
    return list(dict.fromkeys(ids))


def _summarize(study: dict) -> str:
    ps = study.get("protocolSection", {})
    ident = ps.get("identificationModule", {})
    status = ps.get("statusModule", {})
    design = ps.get("designModule", {})
    arms = ps.get("armsInterventionsModule", {})
    conds = ps.get("conditionsModule", {})

    nct = ident.get("nctId", "")
    title = ident.get("briefTitle", "")
    phases = ", ".join(design.get("phases", []) or [])
    overall = status.get("overallStatus", "")
    enroll = (design.get("enrollmentInfo", {}) or {}).get("count", "")
    interventions = ", ".join(
        i.get("name", "") for i in (arms.get("interventions", []) or [])
    )
    conditions = ", ".join(conds.get("conditions", []) or [])
    url = f"https://clinicaltrials.gov/study/{nct}" if nct else ""

    return (
        f"- {nct} ({phases or 'phase n/a'}, {overall or 'status n/a'}): {title}\n"
        f"  conditions: {conditions or 'n/a'}; interventions: {interventions or 'n/a'}; "
        f"enrollment: {enroll or 'n/a'}\n  {url}"
    )


def _get(params: dict) -> list[dict]:
    try:
        resp = requests.get(API, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json().get("studies", []) or []
    except Exception:  # noqa: BLE001 - enrichment is best-effort
        return []


def fetch_by_ids(nct_ids: list[str]) -> list[dict]:
    if not nct_ids:
        return []
    return _get(
        {
            "filter.ids": ",".join(nct_ids[:20]),
            "fields": _FIELDS,
            "pageSize": 20,
        }
    )


def search(condition: str, intervention: str, max_results: int = 5) -> list[dict]:
    params: dict = {"fields": _FIELDS, "pageSize": max_results}
    if condition:
        params["query.cond"] = condition
    if intervention:
        params["query.intr"] = intervention
    if "query.cond" not in params and "query.intr" not in params:
        return []
    return _get(params)


def digest(facts: dict[str, str]) -> str:
    """Build a registry digest from the asset's extracted facts."""
    studies = fetch_by_ids(find_nct_ids(facts))
    if not studies:
        studies = search(
            facts.get("lead_indication", ""),
            facts.get("program_name", "") or facts.get("mechanism", ""),
        )
    if not studies:
        return ""
    lines = ["ClinicalTrials.gov registry matches (authoritative, via API v2):"]
    lines += [_summarize(s) for s in studies]
    return "\n".join(lines)
