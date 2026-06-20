"""Public-data lookups used to augment sponsor decks during triage.

All functions are network calls to public APIs. They degrade gracefully:
on any error they return a structured 'error' record rather than raising, so
the agent loop can continue and simply note the gap.
"""
from __future__ import annotations

from typing import Dict, List

import requests

_TIMEOUT = 20
_UA = {"User-Agent": "LSB-triage-agent/0.1 (research; contact: analyst@lsb)"}


def _safe(fn):
    def wrapper(*a, **k):
        try:
            return fn(*a, **k)
        except Exception as e:  # noqa: BLE001
            return {"error": f"{type(e).__name__}: {e}", "source": fn.__name__}
    return wrapper


@_safe
def clinical_trials(query: str, max_results: int = 10) -> List[Dict]:
    """Search ClinicalTrials.gov v2 API for trials matching a term/intervention."""
    url = "https://clinicaltrials.gov/api/v2/studies"
    params = {
        "query.term": query,
        "pageSize": max_results,
        "fields": "NCTId,BriefTitle,Phase,OverallStatus,Condition,InterventionName,"
                  "PrimaryOutcomeMeasure,StartDate,CompletionDate",
    }
    r = requests.get(url, params=params, headers=_UA, timeout=_TIMEOUT)
    r.raise_for_status()
    studies = r.json().get("studies", [])
    out = []
    for s in studies:
        p = s.get("protocolSection", {})
        idm = p.get("identificationModule", {})
        out.append({
            "nct_id": idm.get("nctId"),
            "title": idm.get("briefTitle"),
            "phase": (p.get("designModule", {}).get("phases") or ["NA"]),
            "status": p.get("statusModule", {}).get("overallStatus"),
            "conditions": p.get("conditionsModule", {}).get("conditions", []),
        })
    return out


@_safe
def pubmed(query: str, max_results: int = 8) -> List[Dict]:
    """Search PubMed via NCBI E-utilities; return PMID + title + journal/year."""
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    s = requests.get(f"{base}/esearch.fcgi", params={
        "db": "pubmed", "term": query, "retmax": max_results, "retmode": "json",
    }, headers=_UA, timeout=_TIMEOUT)
    s.raise_for_status()
    ids = s.json().get("esearchresult", {}).get("idlist", [])
    if not ids:
        return []
    sm = requests.get(f"{base}/esummary.fcgi", params={
        "db": "pubmed", "id": ",".join(ids), "retmode": "json",
    }, headers=_UA, timeout=_TIMEOUT)
    sm.raise_for_status()
    res = sm.json().get("result", {})
    out = []
    for pmid in ids:
        rec = res.get(pmid, {})
        out.append({
            "pmid": pmid,
            "title": rec.get("title"),
            "journal": rec.get("fulljournalname") or rec.get("source"),
            "year": (rec.get("pubdate") or "")[:4],
        })
    return out


@_safe
def uspto_patents(query: str, max_results: int = 10) -> List[Dict]:
    """Search USPTO PatentsView for granted patents matching a query term."""
    url = "https://search.patentsview.org/api/v1/patent/"
    body = {
        "q": {"_text_any": {"patent_title": query}},
        "f": ["patent_id", "patent_title", "patent_date", "assignees.assignee_organization"],
        "o": {"size": max_results},
    }
    r = requests.post(url, json=body, headers=_UA, timeout=_TIMEOUT)
    r.raise_for_status()
    pats = r.json().get("patents", []) or []
    return [{
        "patent_id": p.get("patent_id"),
        "title": p.get("patent_title"),
        "date": p.get("patent_date"),
        "assignees": [a.get("assignee_organization") for a in (p.get("assignees") or [])],
    } for p in pats]


@_safe
def cms_spending(drug_name: str, max_results: int = 5) -> List[Dict]:
    """Look up Medicare Part D / Part B spending for a drug via the CMS data API."""
    # CMS Medicare Part D Spending by Drug dataset (datastore SQL endpoint).
    dataset = "https://data.cms.gov/data-api/v1/dataset/" \
              "7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b/data"
    r = requests.get(dataset, params={
        "filter[Brnd_Name]": drug_name, "size": max_results,
    }, headers=_UA, timeout=_TIMEOUT)
    r.raise_for_status()
    rows = r.json()
    if isinstance(rows, dict):
        rows = rows.get("data", [])
    return rows[:max_results]


# Tool registry exposed to the Claude agent loop ---------------------------

TOOL_FUNCS = {
    "clinical_trials": clinical_trials,
    "pubmed": pubmed,
    "uspto_patents": uspto_patents,
    "cms_spending": cms_spending,
}

TOOL_SCHEMAS = [
    {
        "name": "clinical_trials",
        "description": "Search ClinicalTrials.gov for trials by drug, mechanism, or indication. "
                       "Use to verify trial stage, status, and endpoints claimed in a deck.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Drug name, intervention, or condition"},
                "max_results": {"type": "integer", "default": 10},
            },
            "required": ["query"],
        },
    },
    {
        "name": "pubmed",
        "description": "Search PubMed for publications on a drug, target, or mechanism to "
                       "assess evidence depth and independent validation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "max_results": {"type": "integer", "default": 8},
            },
            "required": ["query"],
        },
    },
    {
        "name": "uspto_patents",
        "description": "Search granted US patents (PatentsView) to gauge IP coverage and assignees "
                       "for an asset or mechanism.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "max_results": {"type": "integer", "default": 10},
            },
            "required": ["query"],
        },
    },
    {
        "name": "cms_spending",
        "description": "Look up Medicare (CMS) drug spending to size reimbursement context for a "
                       "marketed comparator or standard of care.",
        "input_schema": {
            "type": "object",
            "properties": {
                "drug_name": {"type": "string", "description": "Brand name of a comparator drug"},
                "max_results": {"type": "integer", "default": 5},
            },
            "required": ["drug_name"],
        },
    },
]
