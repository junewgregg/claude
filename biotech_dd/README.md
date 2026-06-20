# Biopharma Due-Diligence Agent

Turns asset pitch decks (PDF) plus your investment thesis into a populated
due-diligence table, across three category tiers:

1. **Extracted** — facts read directly from the deck (text **and** figures/charts,
   via Claude's native PDF vision). Every fact records the slide it came from.
2. **Thesis-scored** — categories scored against `config/thesis.md`: a numeric
   score, a label (Strong/Partial/Weak/Misaligned), a rationale, and a confidence.
3. **Researched** — categories filled by independent web research over public
   sources (standard of care, competitors, reimbursement, recent deals), with
   source URLs.

Outputs an `.xlsx` comparison table (one row per asset, color-scaled scores,
rationale/sources in cell comments) **and** a per-asset Markdown memo.

## Setup

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-...
```

## Configure

- **`config/schema.yaml`** — your category list, grouped into the three tiers.
  This is the artifact you control; edit it freely. `query_hint` templates in the
  `researched` tier interpolate extracted fields, e.g. `{lead_indication}`.
- **`config/thesis.md`** — paste your investment thesis. The scoring stage reads
  it verbatim.

## Run

```bash
# Drop PDFs into ./decks, then:
python -m biotech_dd run --decks ./decks --thesis config/thesis.md --out ./out

# Iterate on one stage at a time (extraction is cached under out/.cache):
python -m biotech_dd run --only extract
python -m biotech_dd run --only score
python -m biotech_dd run --only research
```

Outputs land in `./out`: `table.xlsx` plus one `<deck>.md` memo per asset.

## Notes

- Extraction never fabricates — fields absent from the deck come back empty.
- Provenance uses an explicit `source_slide` field rather than the citations API,
  because citations and structured outputs cannot be combined in one request.
- This is decision support for an investment committee, not an automated verdict —
  a human should review every cell.
