# Scorecard format

The scorecard is a one-page, nine-category document per asset. It is dense prose, not bullets, and
it is written so a reader can tell evidence from assertion without asking a question.

## Skeleton

```
<ASSET ID> | <ASSET NAME>
<Indication assessed> | <Sponsor> | Evidence checked <Month D, YYYY>

Target: <Molecular target and site of action. Mechanism as the sponsor describes it, attributed.
What human evidence validates the target, and what that evidence does not reach. Undisclosed
pharmacology flagged as a question, not filled by inference.> [D1]

Modality: <Modality, formulation, route, dose and schedule where supported by a cited source.
Delivery, manufacturing, supply, or scalability issues specific to this modality.> [D1]

Competitive landscape: <Standard of care. Approved and emerging competitors by name and stage.
Informative failures. Where this asset would land at launch, and on what axis it could
differentiate. Cross-trial comparisons named as such.> [1,2]

Commercial: <Disease market versus asset revenue. Population funnel, territory and rights, price
and payer requirements, uptake, duration and persistence, launch timing, development obligations.
Sponsor forecasts labelled. Expansion indications excluded from the base case.> [D1]

IP: <Applications versus grants. Family, jurisdictions, ownership and license obligations, claim
scope against this exact molecule or sequence, legal status, expiry, regulatory exclusivity. What
is not established and which document would establish it.> [3]

Clinical: <Stage and trial identifiers. Design, denominators, controls, endpoints, effect sizes
and uncertainty, safety and discontinuations. What is sponsor-reported versus posted or published.
The registration-enabling path and whether any agency has actually agreed to it.> [D1,4]

Non-clinical: <Model relevance and reproducibility, functional selectivity, PK/PD and
exposure-response, human exposure bridging, tissue engagement, metabolites, toxicology and
margins. Translational limits stated plainly.> [D1]

Recommendations for next step: <Conditional, stage-appropriate decision. Prioritized requests:
documents, analyses, experiments, expert questions, development changes. What advancing does and
does not commit.>

Rationale: <Why this recommendation follows from this evidence, how confident you are, the
strongest counterargument, what must be true for the asset to succeed, and what finding would
change the conclusion.>

[D1] <Supplied deck or document name, date, pages cited>
[1] <Publisher: title, date>
[2] <Author et al., Journal Year; PMID / DOI>
[3] <Patent number: subject>
[4] <ClinicalTrials.gov: NCT number>
```

Every angle-bracketed field above is a placeholder. Fill it from the asset in front of you, and put
the date you actually checked the evidence — never a date carried over from an example, a template,
or an earlier version of the same scorecard.

## Header line

- Line 1: `<Asset ID> | <Asset name>` when an ID was supplied. With no ID supplied, use the asset
  name alone and note that no ID was supplied. Never construct an ID.
- Line 2: `<Indication> | <Sponsor> | Evidence checked <Month D, YYYY>`.
- Indication is the specific indication being assessed, not the sponsor's full ambition. If the
  user scoped the asset to one indication, the whole scorecard is written to that indication and
  other indications are treated as separate optionality.
- Sponsor is the entity offering or developing the asset; note the licensor or parent separately in
  the IP category when rights flow from elsewhere.

## Citation tags

- `[D1]`, `[D2]` … for supplied documents. Give the document name, date, and pages in the source
  list; cite pages inline when a specific figure or claim depends on one.
- `[1]`, `[2]` … for public sources, numbered per scorecard in order of first use.
- Combine as `[D1,2]`; use ranges as `[2–4]`.
- Place the tag at the end of the sentence or clause carrying the claim, not only at the end of the
  paragraph, whenever a paragraph mixes sources.
- Include the useful identifier in the source list: PMID, DOI, NCT or other registry number, patent
  number, label section, dataset name and version.

## Source list

One compact list per scorecard, immediately after Rationale. Supplied documents first, then public
sources. One line each: publisher or author, what it is, identifier, date. No annotations beyond
what is needed to find the source again.

## Length and density

- About one page per asset. A substantive paragraph per category — typically three to six
  sentences, more where the evidence is genuinely contested.
- Every sentence should carry a fact, a limit on a fact, or a consequence for the decision. Delete
  sentences that only restate the category name or the sponsor's framing.
- Where a category has no evidence, the paragraph is still written: name the gap, its decision
  impact, and the document or check that would close it. A category is never left blank and never
  reduced to "not established".

## Multiple assets

Repeat the complete structure for each asset, one asset per page, in the order the user gave or in
an order you justify in one line. Do not interleave, do not share a source list, and do not
substitute a comparison for any asset's scorecard.

A qualitative cross-asset comparison may follow all the scorecards when more than one asset is in
scope and it helps the decision. Keep it non-numeric — no scores, weights, or totals — and label it
as a supplement. If the user has supplied a scoring scheme, apply it only as supplied, and say what
its unscored or missing inputs do to the result.

## Supplements and follow-ups

- A narrow question gets a direct prose answer. Do not regenerate the scorecard to answer it.
- A requested deep analysis goes under the relevant existing category if it fits the page, or into
  a named supplement after the scorecard: "Supplement: LMD commercial model", "Supplement: patent
  family schedule". Supplements never become tenth categories and never change the nine labels.
- When new evidence changes a category, reissue the scorecard with a new evidence-checked date and
  say in one line what changed since the prior version.
