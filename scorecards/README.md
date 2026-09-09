# LSB Asset Triage Scorecards

`LSB_Asset_Scorecards.pptx` — one scorecard per asset, sized 20" x 11.25" to match
*LSB Disease Priorities for Acquisition (7.17.26)*, so slides paste in without rescaling.

| Slide | Contents |
|---|---|
| 1 | ASP2616 (DGKζ) — populated scorecard |
| 2 | DGK competitive landscape — the four programs, verified against public sources Sep-2026 |
| 3 | Scoring key: the 7 weighted criteria, hard gates, stage gates |
| 4 | Blank template — duplicate this per new asset |

## Scoring

Each criterion is rated 0–3 and multiplied by its weight, per slide 4 of the thesis deck:
weighted score = Σ (weight × rating), reported out of 3.00.

Oncology assets are scored twice. The **LSB portfolio lane** rates therapeutic-area fit 0
(the Roche build-to-buy reservation applied); the **Roche build-to-buy lane** rates the same
criterion on merit. The gap between the two is the cost of the reservation — it separates
assets that are only excluded because the oncology slots are held from assets that are weak
on their own terms.

## Adding an asset

Edit `build_scorecards.js` — copy the slide-1 block, replace the card text and the
`scoreRows` ratings, then:

```
npm install pptxgenjs
node build_scorecards.js
```

Source facts belong in the cards verbatim from the non-confidential summary. Where the
source is silent (deal terms, COM vs. MOU split, FTO), say so on the card rather than
scoring an assumption as fact. Competitive claims get checked against public sources
before they carry weight in a rating — on ASP2616 that check moved the differentiation
score from 2 to 1 and reordered the diligence questions.
