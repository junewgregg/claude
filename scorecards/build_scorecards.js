const pptxgen = require("pptxgenjs");

const TEAL = "317A80", TEAL_DK = "22585C", TEAL_TINT = "E9F1F1";
const RED = "B00020", GREEN = "2E7D32", AMBER = "9A5B00";
const GRAY = "595959", INK = "1F2A2B", LINE = "CDDCDC", CARD = "F6FAFA", MUTE = "8A9A9A";
const F = "Arial";

const pres = new pptxgen();
pres.defineLayout({ name: "LSB", width: 20, height: 11.25 });
pres.layout = "LSB";
pres.author = "LevelSet Bio";
pres.title = "LSB Asset Scorecards";

// ---------- geometry ----------
const M = 0.6;
const LX = M, LW = 11.5, CW = 5.55, CGAP = 0.4;
const RX = 12.4, RW = 7.0;
const ROW_Y = [2.25, 4.53, 6.81], ROW_H = 2.06;
const BAR_Y = 9.28, BAR_H = 1.42;
const SCORE_H = 4.80, GATE_Y = 7.30, GATE_H = 1.78;

// ---------- helpers ----------
function header(s, title, sub) {
  s.addText(title, {
    x: M, y: 0.38, w: 15.5, h: 0.7, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 40, bold: true, color: TEAL_DK, valign: "middle",
  });
  s.addText(sub, {
    x: M, y: 1.08, w: 15.5, h: 0.36, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 15, color: GRAY, valign: "middle",
  });
}

function footer(s, n) {
  s.addText("LevelSet Bio — Asset Triage Scorecard   |   Scoring rubric per LSB Disease Priorities for Acquisition (7.17.26)", {
    x: M, y: 10.82, w: 15, h: 0.3, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 11, color: MUTE, valign: "middle",
  });
  s.addText(String(n), {
    x: 19.0, y: 10.82, w: 0.4, h: 0.3, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 11, color: MUTE, align: "right", valign: "middle",
  });
}

function chip(s, x, y, w, label, value, tone) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h: 0.5, rectRadius: 0.08,
    fill: { color: tone.bg }, line: { color: tone.ln, width: 1 },
  });
  s.addText(
    [
      { text: label + "  ", options: { fontSize: 11, bold: true, color: tone.fg, charSpacing: 1 } },
      { text: value, options: { fontSize: 14, bold: true, color: tone.fg } },
    ],
    { x: x + 0.16, y, w: w - 0.32, h: 0.5, isTextBox: true, margin: 0, fontFace: F, valign: "middle" }
  );
}

// A titled content card. `body` is an array of {text, opts} runs.
function card(s, x, y, w, h, title, runs, accent) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.05,
    fill: { color: CARD }, line: { color: LINE, width: 1 },
  });
  s.addText(title, {
    x: x + 0.22, y: y + 0.12, w: w - 0.44, h: 0.32, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 15, bold: true, color: accent || TEAL, valign: "middle",
  });
  s.addText(runs, {
    x: x + 0.22, y: y + 0.46, w: w - 0.44, h: h - 0.6, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 14, color: INK, valign: "top", lineSpacingMultiple: 1.08,
  });
}

function panel(s, x, y, w, h, title) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.05,
    fill: { color: "FFFFFF" }, line: { color: LINE, width: 1 },
  });
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h: 0.46, rectRadius: 0.05, fill: { color: TEAL }, line: { color: TEAL, width: 1 },
  });
  s.addShape(pres.ShapeType.rect, {
    x, y: y + 0.28, w, h: 0.18, fill: { color: TEAL }, line: { color: TEAL, width: 0 },
  });
  s.addText(title, {
    x: x + 0.2, y, w: w - 0.4, h: 0.46, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 14, bold: true, color: "FFFFFF", valign: "middle", charSpacing: 0.6,
  });
}

// 0-3 rating shown as three segments
function ratingBar(s, x, y, rating) {
  for (let i = 0; i < 3; i++) {
    const on = i < rating;
    s.addShape(pres.ShapeType.rect, {
      x: x + i * 0.34, y: y + 0.12, w: 0.28, h: 0.2,
      fill: { color: on ? TEAL : "DCE6E6" }, line: { type: "none" },
    });
  }
}

function scoreRows(s, x, y, w, rows) {
  const rh = 0.44;
  const inL = x + 0.22, inR = x + w - 0.22;
  const cPts = 0.75, cBar = 1.1, cWt = 0.8;
  const xPts = inR - cPts, xBar = xPts - cBar, xWt = xBar - cWt;
  rows.forEach((r, i) => {
    const ry = y + i * rh;
    const zero = r.rating === 0;
    if (i % 2 === 0) {
      s.addShape(pres.ShapeType.rect, {
        x: x + 0.06, y: ry, w: w - 0.12, h: rh, fill: { color: TEAL_TINT }, line: { type: "none" },
      });
    }
    s.addText(r.name, {
      x: inL, y: ry, w: xWt - inL - 0.1, h: rh, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 13, color: zero ? RED : INK, bold: zero, valign: "middle",
    });
    s.addText(r.weight + "%", {
      x: xWt, y: ry, w: cWt, h: rh, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 13, color: GRAY, align: "center", valign: "middle",
    });
    ratingBar(s, xBar, ry + (rh - 0.44) / 2, r.rating === null ? 0 : r.rating);
    s.addText(r.pts, {
      x: xPts, y: ry, w: cPts, h: rh, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 13, bold: true, color: zero ? RED : (r.rating === null ? MUTE : TEAL_DK),
      align: "right", valign: "middle",
    });
  });
}

// Column headers for the score panel, aligned to the same grid as scoreRows
function scoreHead(s, x, y, w) {
  const inL = x + 0.22, inR = x + w - 0.22;
  const cPts = 0.75, cBar = 1.1, cWt = 0.8;
  const xPts = inR - cPts, xBar = xPts - cBar, xWt = xBar - cWt;
  const o = { h: 0.3, isTextBox: true, margin: 0, fontFace: F, fontSize: 11, bold: true, color: MUTE };
  s.addText("Criterion", { ...o, x: inL, y, w: 3.0, charSpacing: 0.6 });
  s.addText("WT", { ...o, x: xWt, y, w: cWt, align: "center" });
  s.addText("0-3", { ...o, x: xBar, y, w: cBar });
  s.addText("PTS", { ...o, x: xPts, y, w: cPts, align: "right" });
}

function statusLines(s, x, y, w, h, lines, size) {
  const runs = [];
  lines.forEach((l, i) => {
    runs.push({ text: l.mark + "  ", options: { color: l.color, bold: true, fontSize: size } });
    runs.push({
      text: l.text,
      options: { color: INK, fontSize: size, breakLine: i < lines.length - 1 },
    });
  });
  s.addText(runs, {
    x, y, w, h, isTextBox: true, margin: 0, fontFace: F,
    valign: "top", lineSpacingMultiple: 1.15,
  });
}

// =====================================================================
// SLIDE 1 — ASP2616 populated scorecard
// =====================================================================
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  header(s, "ASP2616  —  DGKζ Inhibitor",
    "Astellas  ·  Small molecule, oral (10 mg / 50 mg tablets)  ·  Advanced solid tumors  ·  Source: ASP2616 non-confidential summary, v. 12-Jun-2026");

  const neutral = { bg: TEAL_TINT, ln: LINE, fg: TEAL_DK };
  const warn = { bg: "FBEAEC", ln: "E8BFC6", fg: RED };
  const caut = { bg: "FCF3E6", ln: "EAD5B4", fg: AMBER };
  chip(s, M, 1.55, 3.5, "WEIGHTED SCORE", "1.85 / 3.00", neutral);
  chip(s, M + 3.75, 1.55, 4.7, "HARD GATE", "Reserved — Roche B2B", warn);
  chip(s, M + 8.7, 1.55, 4.35, "STAGE", "IND lapsed 08-May-26", caut);
  chip(s, M + 13.3, 1.55, 3.3, "IP RUNWAY", "2041 / 2043", neutral);

  // ---- narrative cards ----
  card(s, LX, ROW_Y[0], CW, ROW_H, "Target & mechanism", [
    { text: "DGKζ", options: { bold: true } },
    { text: " (diacylglycerol kinase zeta) — intracellular negative regulator of TCR signaling that converts DAG to phosphatidic acid. Inhibition sustains DAG-driven RAS/ERK/AP-1 and PKCθ/IKK/NF-κB signaling, restoring T-cell activation " },
    { text: "downstream of and independent from PD-1 blockade", options: { bold: true } },
    { text: "." },
  ]);

  card(s, LX + CW + CGAP, ROW_Y[0], CW, ROW_H, "Competitive landscape", [
    { text: "No approved DGKζ inhibitor. Bayer and BMS each hold one Phase 1 asset; class has shown " },
    { text: "neurotoxicity and only moderate efficacy", options: { bold: true, color: RED } },
    { text: ". The differentiators that decide the winner: brain penetrance / CNS safety margin, and DGKζ-vs-DGKα selectivity. Note: first-in-class mechanism — in tension with the best-in-class-only criterion." },
  ]);

  card(s, LX, ROW_Y[1], CW, ROW_H, "Commercial", [
    { text: "PD-1-resistant solid tumors — NSCLC, melanoma, RCC, HNSCC and selected gastric / other tumors. Addressable market " },
    { text: "$1.5–3B", options: { bold: true } },
    { text: ". Monotherapy vs. IO-combination positioning is unresolved; a combination path adds checkpoint-partner dependency and dilutes the mono > combo preference in the thesis." },
  ]);

  card(s, LX + CW + CGAP, ROW_Y[1], CW, ROW_H, "Intellectual property", [
    { text: "WO-2022114164 (filed 29-Nov-2021) and WO-2023248109 (filed 19-Jun-2023) → nominal expiry " },
    { text: "2041 / 2043", options: { bold: true } },
    { text: "; 15+ year runway clears the ≥10-year stage gate. Non-con does not state the COM vs. MOU split, national-phase status, or FTO position — confirm in the confidential review." },
  ]);

  card(s, LX, ROW_Y[2], CW, ROW_H, "Clinical", [
    { text: "IND submitted 31-May-2022; study-may-proceed letter 30-Jun-2022. Asset was then deprioritized — " },
    { text: "no site initiation visits, no subject screening", options: { bold: true } },
    { text: ". IND inactivated 08-May-2026. Zero human exposure to date; latest development phase is stated as pre-clinical. Reactivation of the IND is required before dosing." },
  ], RED);

  card(s, LX + CW + CGAP, ROW_Y[2], CW, ROW_H, "Non-clinical", [
    { text: "Potent DGKζ inhibition vs. other DGK subtypes; reverses T-cell exhaustion; tumor growth inhibition in TIL-poor and inflamed syngeneic models. Oral BA moderate–high; CYP2D6/3A4 metabolism with time-dependent CYP2D6 inhibition. Non-genotoxic; 4-week rat and cyno tox findings reversible." },
  ], GREEN);

  // ---- recommendation bar ----
  s.addShape(pres.ShapeType.roundRect, {
    x: LX, y: BAR_Y, w: LW, h: BAR_H, rectRadius: 0.05,
    fill: { color: TEAL_TINT }, line: { color: TEAL, width: 1.25 },
  });
  s.addText("RECOMMENDED NEXT STEP", {
    x: LX + 0.22, y: BAR_Y + 0.1, w: LW - 0.44, h: 0.28, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 12, bold: true, color: TEAL, charSpacing: 1, valign: "middle",
  });
  s.addText([
    { text: "Request the confidential package and run initial technical diligence (2–3 h oncology non-clinical + clinical SME review). " },
    { text: "Route to the Roche build-to-buy lane, not an LSB portfolio slot", options: { bold: true } },
    { text: " — oncology spots are reserved. Advance only if the confidential data clear three gates: (1) brain penetrance and CNS safety margin vs. Bayer/BMS, (2) DGKζ-vs-DGKα selectivity, (3) a costed IND-reactivation path." },
  ], {
    x: LX + 0.22, y: BAR_Y + 0.4, w: LW - 0.44, h: BAR_H - 0.52, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 14, color: INK, valign: "top", lineSpacingMultiple: 1.08,
  });

  // ---- score panel ----
  panel(s, RX, ROW_Y[0], RW, SCORE_H, "WEIGHTED TRIAGE SCORE");
  scoreHead(s, RX, ROW_Y[0] + 0.52, RW);

  scoreRows(s, RX, ROW_Y[0] + 0.86, RW, [
    { name: "Development stage & POC feasibility", weight: 20, rating: 2, pts: "0.40" },
    { name: "Therapeutic-area fit", weight: 15, rating: 0, pts: "0.00" },
    { name: "Translational readiness", weight: 15, rating: 2, pts: "0.30" },
    { name: "Differentiation & unmet need", weight: 20, rating: 2, pts: "0.40" },
    { name: "IP strength", weight: 10, rating: 3, pts: "0.30" },
    { name: "Deal economics", weight: 15, rating: 2, pts: "0.30" },
    { name: "Regulatory & endpoint fit", weight: 5, rating: 3, pts: "0.15" },
  ]);

  const totY = ROW_Y[0] + 0.86 + 7 * 0.44 + 0.10;
  s.addShape(pres.ShapeType.rect, {
    x: RX + 0.02, y: totY, w: RW - 0.04, h: 0.68, fill: { color: "FFFFFF" }, line: { type: "none" },
  });
  s.addShape(pres.ShapeType.rect, {
    x: RX + 0.2, y: totY, w: RW - 0.4, h: 0.02, fill: { color: TEAL }, line: { type: "none" },
  });
  s.addText([
    { text: "LSB portfolio lane", options: { fontSize: 13, bold: true, color: INK } },
    { text: "   (oncology gate applied)", options: { fontSize: 12, color: GRAY } },
  ], {
    x: RX + 0.2, y: totY + 0.06, w: RW - 1.7, h: 0.3, isTextBox: true, margin: 0, fontFace: F, valign: "middle",
  });
  s.addText("1.85 / 3.00", {
    x: RX + RW - 1.9, y: totY + 0.06, w: 1.7, h: 0.3, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 15, bold: true, color: RED, align: "right", valign: "middle",
  });
  s.addText([
    { text: "Roche build-to-buy lane", options: { fontSize: 13, bold: true, color: INK } },
    { text: "   (oncology is in scope)", options: { fontSize: 12, color: GRAY } },
  ], {
    x: RX + 0.2, y: totY + 0.38, w: RW - 1.7, h: 0.3, isTextBox: true, margin: 0, fontFace: F, valign: "middle",
  });
  s.addText("2.30 / 3.00", {
    x: RX + RW - 1.9, y: totY + 0.38, w: 1.7, h: 0.3, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 15, bold: true, color: GREEN, align: "right", valign: "middle",
  });

  // ---- gate panel ----
  const GY = GATE_Y, GH = GATE_H;
  panel(s, RX, GY, RW, GH, "GATE & STAGE-GATE CHECK");
  statusLines(s, RX + 0.22, GY + 0.54, RW - 0.44, GH - 0.62, [
    { mark: "✓", color: GREEN, text: "Small molecule, oral — modality gate passed" },
    { mark: "⚑", color: RED, text: "Oncology solid tumor — hard gate → Roche build-to-buy" },
    { mark: "✓", color: GREEN, text: "IP runway 15+ yrs; non-confidential briefing provided" },
    { mark: "!", color: AMBER, text: "IND-cleared but inactivated — conditional on reactivation" },
    { mark: "?", color: AMBER, text: "COM vs. MOU split undisclosed; deal terms unknown" },
  ], 12.5);

  // ---- open questions ----
  panel(s, RX, BAR_Y, RW, BAR_H, "OPEN QUESTIONS FOR THE CONFIDENTIAL REVIEW");
  statusLines(s, RX + 0.22, BAR_Y + 0.54, RW - 0.44, BAR_H - 0.62, [
    { mark: "1", color: TEAL, text: "Brain Kp,uu and CNS NOAEL margin vs. class neurotoxicity" },
    { mark: "2", color: TEAL, text: "DGKζ:DGKα selectivity ratio; biomarker for patient selection" },
    { mark: "3", color: TEAL, text: "What drove Astellas' deprioritization — portfolio or data?" },
  ], 12.5);

  footer(s, 1);
}

// =====================================================================
// SLIDE 2 — scoring rubric
// =====================================================================
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  header(s, "Scoring Key",
    "How every asset scorecard in this deck is rated — criteria and weights per LSB Disease Priorities for Acquisition (7.17.26), slide 4");

  const rows = [
    [
      { text: "Criterion", options: { bold: true } },
      { text: "Weight", options: { bold: true, align: "center" } },
      { text: "Score 3 — ideal", options: { bold: true } },
      { text: "Score 0 — disqualifier", options: { bold: true } },
    ],
    ["Development stage & POC feasibility", "20%", "IND-ready → Phase 2-ready; clinical POC (Phase-2 completion) achievable in <5 years", "Discovery-stage, or POC requires Phase 3 / open-ended 8–10 year timeline"],
    ["Therapeutic-area fit", "15%", "In-scope, commercially attractive area (immunology, CNS & specialty, select metabolic e.g. obesity/T2D)", "Oncology (reserved for Roche) or Phase-3-POC area (MASH, neurodegeneration, cardio-renal)"],
    ["Translational readiness", "15%", "Validated MoA with defined, biomarker-driven patient selection", "Poorly understood MoA; no biomarker or clinical validation"],
    ["Differentiation & unmet need", "20%", "Best-in-class vs. SOC & pipeline; addresses clear unmet need", "Marginally differentiated 'me-too'; crowded standard of care"],
    ["IP strength", "10%", "Composition-of-matter + FTO; long IP life", "Weak or short IP life; freedom-to-operate risk"],
    ["Deal economics", "15%", "Low upfront, minimal/no royalties; right-sized capital", "High upfront / heavy royalties; overcapitalized program"],
    ["Regulatory & endpoint fit", "5%", "Pharma-aligned endpoints; clear regulatory path", "Non-pharma-aligned endpoints; unclear regulatory path"],
  ];

  s.addTable(rows, {
    x: M, y: 1.75, w: 18.8, colW: [4.0, 1.3, 6.75, 6.75],
    fontFace: F, fontSize: 13, color: INK, valign: "middle",
    border: { type: "solid", color: LINE, pt: 1 },
    fill: { color: "FFFFFF" },
    rowH: [0.5, 0.78, 0.9, 0.62, 0.62, 0.55, 0.55, 0.55],
    margin: [0.06, 0.12, 0.06, 0.12],
  });

  // header row + zebra styling has to be applied per-cell, so restyle via overlay shapes is avoided;
  // instead the header row text is bold (above) and we tint it with a shape behind is not possible after
  // the table — so the visual weight comes from bold + the rule below.
  s.addShape(pres.ShapeType.rect, {
    x: M, y: 1.75, w: 18.8, h: 0.03, fill: { color: TEAL }, line: { type: "none" },
  });

  const noteY = 7.5;
  // hard gates
  panel(s, M, noteY, 9.1, 1.55, "HARD GATES  —  AUTO-EXCLUDE REGARDLESS OF SCORE");
  statusLines(s, M + 0.22, noteY + 0.58, 8.66, 0.9, [
    { mark: "✕", color: RED, text: "Non–small-molecule modality (biologics, mAbs, ADCs, RNA, cell & gene)" },
    { mark: "⚑", color: RED, text: "Oncology assets — reserved for Roche's build-to-buy; scored, then flagged, not dropped" },
  ], 14);

  // stage gates
  panel(s, M + 9.7, noteY, 9.1, 1.55, "STAGE GATES  —  ALL MUST PASS TO ADVANCE");
  statusLines(s, M + 9.92, noteY + 0.58, 8.66, 0.9, [
    { mark: "✓", color: GREEN, text: "Available for licensing · ≥10-year IP runway · COM patent · non-confidential briefing" },
    { mark: "✓", color: GREEN, text: "Priority modality (no cell/gene) · IND-cleared or Phase 1 data-ready · no Gensci assets" },
  ], 14);

  // dual-lane note
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: noteY + 1.75, w: 18.8, h: 0.95, rectRadius: 0.05,
    fill: { color: TEAL_TINT }, line: { color: TEAL, width: 1.25 },
  });
  s.addText([
    { text: "Two-lane scoring.  ", options: { bold: true, color: TEAL_DK } },
    { text: "Oncology assets are scored twice: an ", options: { color: INK } },
    { text: "LSB portfolio score", options: { bold: true, color: INK } },
    { text: " with therapeutic-area fit rated 0 (the reservation applied), and a ", options: { color: INK } },
    { text: "Roche build-to-buy score", options: { bold: true, color: INK } },
    { text: " with the same criterion rated on merit. The gap between the two numbers is the cost of the reservation — it makes visible which assets are only excluded because the oncology slots are held, and which are weak on their own terms.", options: { color: INK } },
  ], {
    x: M + 0.25, y: noteY + 1.85, w: 18.3, h: 0.75, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 14, valign: "middle", lineSpacingMultiple: 1.05,
  });

  footer(s, 2);
}

// =====================================================================
// SLIDE 3 — blank template
// =====================================================================
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  header(s, "Asset name  —  target / mechanism",
    "Originator  ·  Modality and formulation  ·  Lead indication  ·  Source document and version date");

  const neutral = { bg: TEAL_TINT, ln: LINE, fg: TEAL_DK };
  chip(s, M, 1.55, 3.5, "WEIGHTED SCORE", "— / 3.00", neutral);
  chip(s, M + 3.75, 1.55, 4.7, "HARD GATE", "Pass / flag", neutral);
  chip(s, M + 8.7, 1.55, 4.35, "STAGE", "Development phase", neutral);
  chip(s, M + 13.3, 1.55, 3.3, "IP RUNWAY", "Expiry year", neutral);

  const prompt = (t) => [{ text: t, options: { italic: true, color: MUTE } }];
  card(s, LX, ROW_Y[0], CW, ROW_H, "Target & mechanism",
    prompt("Target, biology, and why inhibiting or engaging it changes disease course. Modality, route, formulation. Keep to what the source document actually states."));
  card(s, LX + CW + CGAP, ROW_Y[0], CW, ROW_H, "Competitive landscape",
    prompt("Approved agents against the target. Named competitors by phase and sponsor. Class-wide liabilities seen to date. The one or two properties that decide who wins."));
  card(s, LX, ROW_Y[1], CW, ROW_H, "Commercial",
    prompt("Addressable population and indications. Market size with the basis for the estimate. Monotherapy vs. combination positioning and any partner dependency it creates."));
  card(s, LX + CW + CGAP, ROW_Y[1], CW, ROW_H, "Intellectual property",
    prompt("Patent families with filing dates and nominal expiry. COM vs. MOU split. National-phase status, FTO, and any encumbrance. Note explicitly what the source does not disclose."));
  card(s, LX, ROW_Y[2], CW, ROW_H, "Clinical",
    prompt("Regulatory filings and dates. Patients dosed, if any. Efficacy and safety read-outs. If the asset has never been in humans, say so plainly rather than implying data exist."));
  card(s, LX + CW + CGAP, ROW_Y[2], CW, ROW_H, "Non-clinical",
    prompt("Pharmacology, in vivo efficacy models, ADME, and toxicology. Reversibility of tox findings. Anything that would gate a first-in-human dose."));

  s.addShape(pres.ShapeType.roundRect, {
    x: LX, y: BAR_Y, w: LW, h: BAR_H, rectRadius: 0.05,
    fill: { color: TEAL_TINT }, line: { color: TEAL, width: 1.25 },
  });
  s.addText("RECOMMENDED NEXT STEP", {
    x: LX + 0.22, y: BAR_Y + 0.1, w: LW - 0.44, h: 0.28, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 12, bold: true, color: TEAL, charSpacing: 1, valign: "middle",
  });
  s.addText(prompt("One decision, stated as an action: request the confidential package, pass, or advance to full diligence. Name the lane (LSB portfolio vs. Roche build-to-buy) and the specific gates the confidential data must clear."), {
    x: LX + 0.22, y: BAR_Y + 0.4, w: LW - 0.44, h: BAR_H - 0.52, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 14, valign: "top", lineSpacingMultiple: 1.08,
  });

  panel(s, RX, ROW_Y[0], RW, SCORE_H, "WEIGHTED TRIAGE SCORE");
  scoreHead(s, RX, ROW_Y[0] + 0.52, RW);
  scoreRows(s, RX, ROW_Y[0] + 0.86, RW, [
    { name: "Development stage & POC feasibility", weight: 20, rating: 0, pts: "—" },
    { name: "Therapeutic-area fit", weight: 15, rating: 0, pts: "—" },
    { name: "Translational readiness", weight: 15, rating: 0, pts: "—" },
    { name: "Differentiation & unmet need", weight: 20, rating: 0, pts: "—" },
    { name: "IP strength", weight: 10, rating: 0, pts: "—" },
    { name: "Deal economics", weight: 15, rating: 0, pts: "—" },
    { name: "Regulatory & endpoint fit", weight: 5, rating: 0, pts: "—" },
  ].map((r) => ({ ...r, rating: null, pts: "—" })));

  const totY3 = ROW_Y[0] + 0.86 + 7 * 0.44 + 0.10;
  s.addShape(pres.ShapeType.rect, {
    x: RX + 0.2, y: totY3, w: RW - 0.4, h: 0.02, fill: { color: TEAL }, line: { type: "none" },
  });
  s.addText("LSB portfolio lane", {
    x: RX + 0.2, y: totY3 + 0.06, w: RW - 1.7, h: 0.3, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 13, bold: true, color: INK, valign: "middle",
  });
  s.addText("— / 3.00", {
    x: RX + RW - 1.9, y: totY3 + 0.06, w: 1.7, h: 0.3, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 15, bold: true, color: MUTE, align: "right", valign: "middle",
  });
  s.addText("Roche build-to-buy lane", {
    x: RX + 0.2, y: totY3 + 0.38, w: RW - 1.7, h: 0.3, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 13, bold: true, color: INK, valign: "middle",
  });
  s.addText("— / 3.00", {
    x: RX + RW - 1.9, y: totY3 + 0.38, w: 1.7, h: 0.3, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 15, bold: true, color: MUTE, align: "right", valign: "middle",
  });

  const GY3 = GATE_Y, GH3 = GATE_H;
  panel(s, RX, GY3, RW, GH3, "GATE & STAGE-GATE CHECK");
  s.addText(prompt("Mark each: modality gate · therapeutic-area gate · IP runway ≥10 yrs · COM patent · available for licensing · IND-cleared or Phase 1 data-ready. Flag every item the source leaves undisclosed rather than assuming a pass."), {
    x: RX + 0.22, y: GY3 + 0.54, w: RW - 0.44, h: GH3 - 0.62, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 13, valign: "top", lineSpacingMultiple: 1.1,
  });

  panel(s, RX, BAR_Y, RW, BAR_H, "OPEN QUESTIONS FOR THE CONFIDENTIAL REVIEW");
  s.addText(prompt("Three questions whose answers would change the recommendation."), {
    x: RX + 0.22, y: BAR_Y + 0.54, w: RW - 0.44, h: BAR_H - 0.62, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 12.5, valign: "top", lineSpacingMultiple: 1.1,
  });

  footer(s, 3);
}

pres.writeFile({ fileName: "/tmp/claude-0/-home-user-claude/d2f5455d-7c3f-5235-b1e7-82237e3dc413/scratchpad/LSB_Asset_Scorecards.pptx" })
  .then((f) => console.log("wrote", f));
