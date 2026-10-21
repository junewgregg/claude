# LinkedIn network tools

## Keep your network warm (`network.py`)

Finds the people who have helped you (recommendations, intros and referrals in
messages, notes where you thanked them, endorsements, real back-and-forth
conversations), ranks them by how much they've helped you and how relevant they
are to your goals, and drafts a check-in note for whoever is due.

1. On LinkedIn: **Settings → Data privacy → Get a copy of your data**. Choose
   **Connections, Messages, Recommendations, Endorsements**. Save the .zip
   LinkedIn emails you as `linkedin_export.zip`, or unzip it into `linkedin_export/`.
2. Copy `network_config.example.json` to `network_config.json` and list the
   industries, roles or companies that matter to where you're heading.
3. Run `python network.py plan --export linkedin_export.zip`. It writes
   `output/network_plan.csv` (everyone, ranked) and
   `output/outreach_drafts.md` (drafts for the people due a check-in).
4. After you reach out, run `python network.py log "Jane Doe"`. Tier A people
   come back up every 60 days, B every 120, C every 180.

Your export, config, outputs and outreach log are git-ignored. Don't commit them.

## Send a message (`main.py`)

`python main.py` opens a browser, logs you in to LinkedIn and sends messages you type.
