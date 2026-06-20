# LSB Biopharma Triage Agent

A CLI agent that screens non-confidential biopharma assets (pitch decks + public
data) and produces a structured **asset-evaluation scorecard** calibrated to the
LSB investment thesis. Output matches the historical LSB report template exactly
(rating table, asset snapshot, disease/modality fit, source evidence, thesis-gate
test, risks, diligence requests, rating-movement conditions, bottom line).

## How it works

```
deck(s) ──▶ parse ──▶ Claude (tool-use loop) ──▶ TriageScorecard ──▶ .docx + .json
                          │
                          ├─ clinical_trials  (ClinicalTrials.gov v2)
                          ├─ pubmed           (NCBI E-utilities)
                          ├─ uspto_patents    (PatentsView)
                          └─ cms_spending     (CMS data API)
```

The agent is grounded by:
- **`data/thesis.yaml`** — the LSB thesis: economic gates ($30M cap, ≤5yr, 5x
  upfront, 10x TDV), disease priorities, modality priorities. Edit to retune the
  screen without touching code.
- **`examples/*.md`** — historical LSB reports used as few-shot calibration.

## Install

```bash
pip install -r biopharma_triage/requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
```

## Run

```bash
python -m biopharma_triage.run path/to/deck.pdf \
    --hint "FLQ-106 broad integrin inhibitor, pterygium" \
    --out FLQ106_triage.docx --json FLQ106_triage.json
```

Multiple decks for one asset can be passed positionally. Supported inputs:
`.pdf .docx .pptx .txt .md`.

## Design notes

- **Disease fit is the dominant hurdle** — an off-priority disease caps the
  overall rating regardless of modality strength, matching the historical screen.
- **Screen, not sponsor** — the prompt forces separation of sponsor-framed claims
  from decision-grade evidence; the agent only cites evidence it actually
  retrieves (deck pages or tool results), never invented IDs/data.
- **Structured output** is enforced via a forced final `emit_scorecard` tool call
  validated against `scorecard.TriageScorecard` (Pydantic).
- Public-data tools **degrade gracefully**: a blocked/failed source returns an
  error record and the agent notes the gap rather than failing.

## Files

| File | Purpose |
|------|---------|
| `scorecard.py` | Pydantic schema for the full scorecard (controlled vocab) |
| `prompts.py` | System prompt + thesis + few-shot loader |
| `agent.py` | Claude tool-use loop, forced structured output |
| `tools/pdf_parser.py` | PDF/DOCX/PPTX → page-tagged text |
| `tools/public_sources.py` | ClinicalTrials.gov, PubMed, USPTO, CMS lookups |
| `report.py` | Scorecard → `.docx` in the LSB template |
| `run.py` | CLI entrypoint |
| `data/thesis.yaml` | Editable thesis calibration |
| `examples/` | Historical reports for few-shot grounding |
