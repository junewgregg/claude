# Outlook → Smartsheet + SharePoint intake — setup guide

This wires the due-diligence agent into your Microsoft 365 workflow:

```
Outlook email (PDF deck + contact/institute in the body)
   │  Power Automate: "When a new email arrives (V3)"
   ▼
Azure Function  POST /api/intake   ──►  m365.pipeline
   • LLM-parse contact + institute from the body (and deck)
   • biotech_dd: extract → score → research (ClinicalTrials.gov, CMS, FDA, …)
   • generate the memo
   • UPSERT the Smartsheet row (keyed by Asset Key → keeps it in sync)
   •   + attach the memo to that row
   • deposit memo + original attachments into a SharePoint folder
   ▼
returns { asset_key, smartsheet_row_id, sharepoint_folder, memo_link, warnings }
```

The agent owns the Smartsheet and SharePoint writes (it holds the structured data
and an idempotent key). Power Automate stays thin: trigger → call the function.

---

## 1. Prerequisites

- An Azure subscription (for the Function App) and the Azure Functions Core Tools
  (`func`) + Azure CLI for deploy.
- A Smartsheet account with API access.
- Rights to register an Microsoft Entra (Azure AD) app and grant **application**
  Graph permissions (admin consent) for the SharePoint writes.
- An Anthropic API key.

## 2. Smartsheet

1. Create a sheet (any single primary column is fine — the agent auto-creates the
   rest from `config/schema.yaml`).
2. Get the **Sheet ID**: open the sheet → *File → Properties* (or the right-panel
   *Sheet Summary*).
3. Generate an API token: *Account → Personal Settings → API Access → Generate*.

The agent upserts rows keyed on an **Asset Key** column (a slug of program +
company). Re-sending an updated deck for the same asset updates that same row.

## 3. SharePoint via Microsoft Graph (app-only)

1. **Entra admin center → App registrations → New registration.** Name it, single
   tenant. Note the **Application (client) ID** and **Directory (tenant) ID**.
2. **Certificates & secrets → New client secret.** Copy the value.
3. **API permissions → Add → Microsoft Graph → Application permissions →**
   `Sites.ReadWrite.All` (or the narrower `Sites.Selected` if you scope per-site).
   Click **Grant admin consent**.
4. Find the **drive id** of the target document library:
   ```
   GET https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{site-path}:/drives
   ```
   Use the `id` of the library you want. Files land under the base folder named by
   `SHAREPOINT_BASE_FOLDER` (default `Asset Intake`), in a per-asset subfolder.

## 4. Deploy the Azure Function

The repo root is the function app (`function_app.py` + `host.json`). `.funcignore`
excludes the unrelated `linkedin_messenger` utility and local data from the deploy.

```bash
az login
func azure functionapp publish <your-function-app-name>
```

Set **Application settings** (Configuration) on the Function App:

| Setting | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `SMARTSHEET_TOKEN` | Smartsheet API token |
| `SMARTSHEET_SHEET_ID` | numeric sheet id |
| `GRAPH_TENANT_ID` | Entra directory (tenant) id |
| `GRAPH_CLIENT_ID` | app (client) id |
| `GRAPH_CLIENT_SECRET` | client secret value |
| `SHAREPOINT_DRIVE_ID` | target document-library drive id |
| `SHAREPOINT_BASE_FOLDER` | optional, default `Asset Intake` |
| `DD_SCHEMA_PATH` | optional, default `config/schema.yaml` |
| `DD_THESIS_PATH` | optional local fallback, default `config/thesis.md` |
| `THESIS_SHAREPOINT_PATH` | optional, drive-relative path to the editable thesis doc (e.g. `Config/thesis.md`); enables versioned thesis + rescore |
| `RUN_RESEARCH` | `true`/`false` (default `true`) |

> **Timeout note:** scoring + web research on Opus can run minutes. `host.json` sets
> a 10-minute `functionTimeout` (requires a Premium or Dedicated plan; Consumption
> caps at ~10 min and the HTTP gateway at ~230 s). If you keep `RUN_RESEARCH=true`
> on Consumption, move research to an async path (queue/Durable Functions) or set
> `RUN_RESEARCH=false` and run research on a follow-up trigger. For first rollout,
> Premium plan + synchronous is simplest.

Grab the function URL + key: *Function App → Functions → intake → Get function URL*.

## 5. Power Automate flow

Create an automated cloud flow:

1. **Trigger:** *Office 365 Outlook — When a new email arrives (V3)*. Filter to a
   folder/label or a subject tag (e.g. subject contains `[Asset]`) and set
   *Has Attachments = Yes*, *Include Attachments = Yes*.
2. **Action:** *HTTP* → **POST** to your function URL (`.../api/intake?code=<key>`),
   `Content-Type: application/json`, body:

   ```json
   {
     "subject": "@{triggerOutputs()?['body/subject']}",
     "from": "@{triggerOutputs()?['body/from']}",
     "receivedDateTime": "@{triggerOutputs()?['body/receivedDateTime']}",
     "body": "@{triggerOutputs()?['body/body']}",
     "attachments": "@{triggerOutputs()?['body/attachments']}"
   }
   ```

   The Outlook trigger's `attachments` array already carries `name`,
   `contentType`, and base64 `contentBytes` — exactly what the function expects.
3. *(Optional)* Add a **Condition** on the HTTP response (`statusCode` 200 vs 207)
   to post the returned `warnings`/links to Teams or back to the sender.

That's the whole flow — the function does the rest.

## 6. Local testing

```bash
pip install -r requirements.txt
func start          # runs the function locally on :7071
```

Post a sample envelope (a tiny base64 PDF) to
`http://localhost:7071/api/intake`. Set the same settings in a local
`local.settings.json` (not committed). Without M365/Smartsheet credentials the
pipeline still runs the Anthropic stages and reports writer failures in
`warnings` rather than crashing.

## 7. What lands where

- **Smartsheet:** one row per asset — meta (contact, institute, source email,
  links), extracted facts, scores + assessments, and research summaries + sources.
  Re-runs update the same row. The memo is attached to the row.
- **SharePoint:** `…/{SHAREPOINT_BASE_FOLDER}/{asset-key} - {date}/` containing the
  generated memo and every original attachment. Agent state lives under
  `…/{SHAREPOINT_BASE_FOLDER}/_state/` (output snapshots + `corrections.jsonl`).

## 8. Learning loop & thesis updates

The agent improves from analyst review and adapts when strategy changes. Three
extra Smartsheet columns drive this (auto-created): **Status**, **Reviewer Notes**,
**Feedback Captured**, plus **Thesis Version**.

### Learn from reviewed rows

1. An analyst reviews a row, edits any wrong scores or extracted values, optionally
   writes **Reviewer Notes**, and sets **Status** to `Reviewed` or `Approved`.
2. A **nightly Power Automate Recurrence flow** POSTs to `…/api/feedback?code=<key>`.
3. The sweep diffs each reviewed row against the agent's saved output, appends the
   corrections to `_state/corrections.jsonl`, and stamps **Feedback Captured**.
4. On the next asset, the scorer retrieves the most similar past corrections (by
   indication / modality / mechanism) and injects them as worked examples — so the
   model improves while every score still carries its own rationale + confidence.

> Set up: add an automated cloud flow with a **Recurrence** trigger (e.g. daily
> 02:00) → **HTTP POST** to the `feedback` function URL. No body needed.

### Update the thesis

1. Put the thesis in SharePoint and point `THESIS_SHAREPOINT_PATH` at it (e.g.
   `Config/thesis.md`). The agent loads it each run and stamps the row's
   **Thesis Version** (a content hash) so you always know what each asset was
   scored under.
2. When the thesis changes, trigger a **rescore**: POST to `…/api/rescore?code=<key>`
   (a Power Automate button flow, or any scheduled/manual trigger).
3. Rescore re-scores every **active** asset whose Thesis Version is stale — reusing
   the cached extraction (no deck re-read, no re-research), applying the same
   few-shot precedent — and updates each row's scores, assessment, **Status**
   (`Re-scored`), and **Thesis Version**.

Rescore is manual by design so you control when (and the token cost of) a
re-evaluation happens.

### Calibration report

POST to `…/api/calibration?code=<key>` (a monthly Recurrence flow, or on demand) to
generate a report of where the agent **systematically** diverges from analysts:
per-category score bias (does it over- or under-score, by how much, over how many
reviews), the extraction fields analysts most often fix, and a model-written
summary of the patterns with recommended rubric/thesis adjustments. The report is
written to `…/{SHAREPOINT_BASE_FOLDER}/Calibration/calibration-<date>.md`; the
response returns the link and the detected biases. Use it to decide which thesis or
schema prompts to tighten — closing the loop from feedback back into the rubric.
