# drug-asset-diligence

A Claude Code skill that evaluates therapeutic assets for investment, licensing, acquisition,
partnership, and development decisions, and writes them up as fixed nine-category asset scorecards.

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | Analyst stance, output contract, workflow, evidence discipline, condensed rubrics |
| `references/scorecard-format.md` | Annotated template, header, citation tags, source list, multi-asset and supplement handling |
| `references/evidence-standards.md` | Evidence labels, source hierarchy and where to search, identity and verification checklists, date and provenance rules |
| `references/category-rubrics.md` | Per-category requirements, disallowed inferences, how to write a category with missing evidence |
| `references/commercial-model.md` | Population funnel, CMS data pitfalls, sensitivities, rights and timing |

`.claude/agents/drug-asset-diligence.md` wraps the same skill as a subagent for delegated diligence.

## The nine categories

`Target` · `Modality` · `Competitive landscape` · `Commercial` · `IP` · `Clinical` ·
`Non-clinical` · `Recommendations for next step` · `Rationale`

Fixed labels, fixed order, never renamed, merged, or omitted. A category with no evidence is
retained and the gap is explained.

## Use

Invoke with `/drug-asset-diligence`, or just describe the task — the skill's description triggers
on asset screening, scorecard, and deal-evaluation requests. Supply: asset name and any ID,
indication, sponsor, territory, decision purpose, documents, and whether external verification is
permitted.

## Scope boundaries

Asset diligence only. Not individualized medical advice, not legal opinions (patent conclusions go
to counsel), not personalized financial recommendations.
