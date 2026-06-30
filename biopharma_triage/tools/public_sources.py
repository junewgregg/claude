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


# --- Analytical lenses (competitive / SoC / commercial / deal flow) --------

_PHASE_RANK = {
    "EARLY_PHASE1": 0, "PHASE1": 1, "PHASE1/PHASE2": 1.5, "PHASE2": 2,
    "PHASE2/PHASE3": 2.5, "PHASE3": 3, "PHASE4": 4, "NA": -1,
}
_ACTIVE_STATUSES = {"RECRUITING", "ACTIVE_NOT_RECRUITING", "ENROLLING_BY_INVITATION",
                    "NOT_YET_RECRUITING", "AVAILABLE"}


@_safe
def competitive_landscape(target_or_drug: str, indication: str = "",
                          max_results: int = 100) -> Dict:
    """Build a competitive-intensity read for a target/mechanism in an indication.

    Pulls ClinicalTrials.gov interventional studies for the target (and optional
    indication) and aggregates: how many programs are in development, their phase
    distribution, the most-advanced competitor, and the most active sponsors.
    This directly informs the 'too competitive' rejection pattern.
    """
    url = "https://clinicaltrials.gov/api/v2/studies"
    params = {
        "query.intr": target_or_drug,
        "pageSize": min(max_results, 200),
        "filter.advanced": "AREA[StudyType]INTERVENTIONAL",
        "fields": "NCTId,BriefTitle,Phase,OverallStatus,Condition,"
                  "LeadSponsorName,StartDate",
    }
    if indication:
        params["query.cond"] = indication
    r = requests.get(url, params=params, headers=_UA, timeout=_TIMEOUT)
    r.raise_for_status()
    studies = r.json().get("studies", [])

    phase_counts: Dict[str, int] = {}
    sponsor_counts: Dict[str, int] = {}
    active = 0
    most_advanced = {"rank": -2, "phase": "NA", "nct_id": None,
                     "title": None, "sponsor": None, "status": None}
    examples = []
    for s in studies:
        p = s.get("protocolSection", {})
        phases = p.get("designModule", {}).get("phases") or ["NA"]
        phase = phases[-1]
        phase_counts[phase] = phase_counts.get(phase, 0) + 1
        sponsor = (p.get("sponsorCollaboratorsModule", {})
                   .get("leadSponsor", {}).get("name", "Unknown"))
        sponsor_counts[sponsor] = sponsor_counts.get(sponsor, 0) + 1
        status = p.get("statusModule", {}).get("overallStatus", "")
        if status in _ACTIVE_STATUSES:
            active += 1
        rank = _PHASE_RANK.get(phase.upper().replace(" ", ""), -1)
        if rank > most_advanced["rank"]:
            idm = p.get("identificationModule", {})
            most_advanced = {
                "rank": rank, "phase": phase, "nct_id": idm.get("nctId"),
                "title": idm.get("briefTitle"), "sponsor": sponsor, "status": status,
            }
        if len(examples) < 8:
            idm = p.get("identificationModule", {})
            examples.append({
                "nct_id": idm.get("nctId"), "phase": phase,
                "status": status, "sponsor": sponsor,
                "title": idm.get("briefTitle"),
            })
    top_sponsors = sorted(sponsor_counts.items(), key=lambda kv: -kv[1])[:6]
    intensity = ("crowded" if (phase_counts.get("PHASE3", 0)
                 + phase_counts.get("PHASE2/PHASE3", 0)) >= 3
                 else "moderate" if len(studies) >= 8 else "sparse")
    most_advanced.pop("rank", None)
    return {
        "target_or_drug": target_or_drug,
        "indication": indication or "(any)",
        "total_programs": len(studies),
        "active_programs": active,
        "phase_distribution": phase_counts,
        "most_advanced_competitor": most_advanced,
        "top_sponsors": [{"sponsor": s, "trials": n} for s, n in top_sponsors],
        "competitive_intensity": intensity,
        "examples": examples,
    }


@_safe
def standard_of_care(indication: str, max_results: int = 10) -> List[Dict]:
    """Identify the approved standard of care for an indication via openFDA labels.

    Returns FDA-approved drugs whose labeling covers the indication — i.e. the
    benchmark a new asset must beat. Use to frame differentiation and the
    'what must be true clinically' bar.
    """
    url = "https://api.fda.gov/drug/label.json"
    params = {
        "search": f'indications_and_usage:"{indication}"',
        "limit": min(max_results, 25),
    }
    r = requests.get(url, params=params, headers=_UA, timeout=_TIMEOUT)
    r.raise_for_status()
    results = r.json().get("results", [])
    out = []
    seen = set()
    for rec in results:
        openfda = rec.get("openfda", {})
        brand = (openfda.get("brand_name") or ["?"])[0]
        if brand in seen:
            continue
        seen.add(brand)
        usage = (rec.get("indications_and_usage") or [""])[0]
        out.append({
            "brand_name": brand,
            "generic_name": (openfda.get("generic_name") or [""])[0],
            "manufacturer": (openfda.get("manufacturer_name") or [""])[0],
            "route": (openfda.get("route") or [""])[0],
            "pharm_class": (openfda.get("pharm_class_epc") or []),
            "indication_snippet": usage[:400],
        })
        if len(out) >= max_results:
            break
    return out


@_safe
def commercial_cms(drug_name: str, max_results: int = 3) -> Dict:
    """Size the commercial/reimbursement footprint of a comparator via CMS Part D.

    Aggregates Medicare Part D 'Spending by Drug' fields (total spend, beneficiary
    count, spend-per-beneficiary, and year-over-year trend) so a comparator's
    real-world payer footprint can anchor market-size and pricing assumptions.
    """
    dataset = ("https://data.cms.gov/data-api/v1/dataset/"
               "7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b/data")
    r = requests.get(dataset, params={
        "filter[Brnd_Name]": drug_name, "size": max_results,
    }, headers=_UA, timeout=_TIMEOUT)
    r.raise_for_status()
    rows = r.json()
    if isinstance(rows, dict):
        rows = rows.get("data", [])
    rows = rows[:max_results]
    summaries = []
    for row in rows:
        spend = {k: v for k, v in row.items() if k.startswith("Tot_Spndng")}
        benes = {k: v for k, v in row.items() if k.startswith("Tot_Benes")}
        per_bene = {k: v for k, v in row.items() if k.startswith("Avg_Spnd_Per_Bene")}
        years = sorted(k.rsplit("_", 1)[-1] for k in spend if k.rsplit("_", 1)[-1].isdigit())
        trend = None
        if len(years) >= 2:
            try:
                first = float(row.get(f"Tot_Spndng_{years[0]}") or 0)
                last = float(row.get(f"Tot_Spndng_{years[-1]}") or 0)
                if first:
                    trend = round((last - first) / first * 100, 1)
            except (TypeError, ValueError):
                trend = None
        summaries.append({
            "brand_name": row.get("Brnd_Name"),
            "generic_name": row.get("Gnrc_Name"),
            "years_covered": years,
            "total_spending_by_year": spend,
            "beneficiaries_by_year": benes,
            "spend_per_beneficiary_by_year": per_bene,
            "spend_trend_pct_first_to_last": trend,
        })
    return {"drug_name": drug_name, "matches": summaries}


@_safe
def deal_flow(query: str, max_results: int = 10) -> List[Dict]:
    """Surface recent biopharma deal activity (licensing / M&A) via SEC EDGAR.

    Runs an EDGAR full-text search for a company, target, or modality and returns
    recent filings (8-K, license/collaboration agreements, etc.) that signal
    partnership or acquisition activity — a proxy for 'recent deal flow' comps.
    """
    url = "https://efts.sec.gov/LATEST/search-index"
    params = {"q": f'"{query}"', "forms": "8-K", "dateRange": "custom"}
    r = requests.get(url, params={"q": f'"{query}"'},
                     headers={**_UA, "Accept": "application/json"}, timeout=_TIMEOUT)
    r.raise_for_status()
    hits = (r.json().get("hits", {}) or {}).get("hits", [])
    out = []
    for h in hits[:max_results]:
        src = h.get("_source", {})
        out.append({
            "company": (src.get("display_names") or ["?"])[0],
            "form_type": src.get("file_type") or src.get("root_form"),
            "filed_date": src.get("file_date"),
            "doc": (h.get("_id") or "").split(":")[0],
        })
    return out


# Tool registry exposed to the Claude agent loop ---------------------------

TOOL_FUNCS = {
    "clinical_trials": clinical_trials,
    "pubmed": pubmed,
    "uspto_patents": uspto_patents,
    "cms_spending": cms_spending,
    "competitive_landscape": competitive_landscape,
    "standard_of_care": standard_of_care,
    "commercial_cms": commercial_cms,
    "deal_flow": deal_flow,
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
    {
        "name": "competitive_landscape",
        "description": "COMPETITIVE ANALYSIS. Aggregate ClinicalTrials.gov to gauge how crowded a "
                       "target/mechanism is in an indication: program count, phase distribution, "
                       "most-advanced competitor, and most active sponsors. Use to test the "
                       "'too competitive / window closed' risk before scoring.",
        "input_schema": {
            "type": "object",
            "properties": {
                "target_or_drug": {"type": "string", "description": "Target, mechanism, or drug name (intervention)"},
                "indication": {"type": "string", "description": "Optional disease/condition to scope the landscape"},
                "max_results": {"type": "integer", "default": 100},
            },
            "required": ["target_or_drug"],
        },
    },
    {
        "name": "standard_of_care",
        "description": "STANDARD-OF-CARE ANALYSIS. Return FDA-approved drugs (openFDA labels) whose "
                       "labeling covers an indication — the benchmark a new asset must beat. Use to "
                       "frame the differentiation bar and 'what must be true clinically'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "indication": {"type": "string", "description": "Disease/condition, e.g. 'chronic spontaneous urticaria'"},
                "max_results": {"type": "integer", "default": 10},
            },
            "required": ["indication"],
        },
    },
    {
        "name": "commercial_cms",
        "description": "COMMERCIAL ANALYSIS. Aggregate Medicare Part D 'Spending by Drug' for a "
                       "comparator/SoC: total spend, beneficiaries, spend-per-beneficiary, and "
                       "multi-year trend. Use to anchor market-size and pricing assumptions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "drug_name": {"type": "string", "description": "Brand name of a comparator/SoC drug"},
                "max_results": {"type": "integer", "default": 3},
            },
            "required": ["drug_name"],
        },
    },
    {
        "name": "deal_flow",
        "description": "RECENT DEAL FLOW. Search SEC EDGAR filings for a company, target, or modality "
                       "to surface recent licensing/collaboration/M&A activity as transactability "
                       "comps. Use to test pharma BD/M&A appetite and exit plausibility.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Company, target, mechanism, or modality"},
                "max_results": {"type": "integer", "default": 10},
            },
            "required": ["query"],
        },
    },
]
