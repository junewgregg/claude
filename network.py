#!/usr/bin/env python3
"""Plan who to reach out to from your LinkedIn data export.

  python network.py plan                 # rank people, write drafts for who's due
  python network.py log "Jane Doe"       # record that you reached out, resets their cadence
"""
import argparse
import csv
import json
import tempfile
from datetime import date
from pathlib import Path

from rich.console import Console
from rich.table import Table

from linkedin_messenger.network import (
    CADENCE_DAYS,
    draft_message,
    load_network,
    load_touchpoints,
    score_network,
    unpack_export,
)

console = Console()
TOUCHPOINTS_FILE = Path("touchpoints.csv")


def plan(args) -> None:
    config = json.loads(Path(args.config).read_text()) if Path(args.config).exists() else {}
    today = date.today()

    with tempfile.TemporaryDirectory() as tmp:
        export_dir = unpack_export(Path(args.export), Path(tmp))
        network = load_network(export_dir)
    load_touchpoints(network, TOUCHPOINTS_FILE)
    ranked = score_network(network, config.get("focus_keywords", []))

    if not ranked:
        console.print("[yellow]No one found with a history of helping you. "
                      "Make sure the export includes messages, recommendations and endorsements.[/yellow]")
        return

    out = Path(args.out)
    out.mkdir(exist_ok=True)
    with open(out / "network_plan.csv", "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["tier", "score", "name", "position", "company", "email", "profile_url",
                         "last_contact", "days_since", "due", "why"])
        for p in ranked:
            writer.writerow([p.tier, round(p.score, 1), p.name, p.position, p.company, p.email, p.url,
                             p.last_contact or "", p.days_since_contact(today) or "",
                             "yes" if p.is_due(today) else "", "; ".join(p.reasons)])

    due = [p for p in ranked if p.is_due(today)][: args.limit]
    lines = [f"# Outreach drafts ({today})", "",
             "Fill in the bracketed line before sending. After you reach out, run "
             '`python network.py log "Name"` so they drop off the list until their next check-in.', ""]
    for p in due:
        lines += [f"## {p.name} (tier {p.tier})", ""]
        role = ", ".join(x for x in (p.position, p.company) if x)
        if role:
            lines.append(f"- **Role:** {role}")
        if p.url:
            lines.append(f"- **Profile:** {p.url}")
        lines.append(f"- **Why:** {'; '.join(p.reasons)}")
        lines.append(f"- **Last contact:** {p.last_contact or 'never messaged'}")
        if p.help_messages:
            when, text = p.help_messages[-1]
            snippet = " ".join(text.split())[:300]
            lines.append(f"- **What they did ({when or 'undated'}):** \"{snippet}\"")
        lines += ["", "```", draft_message(p), "```", ""]
    (out / "outreach_drafts.md").write_text("\n".join(lines))

    table = Table(title=f"Due for a check-in ({len(due)} of {len(ranked)} people)")
    for col in ("Tier", "Name", "Role", "Last contact", "Why"):
        table.add_column(col)
    for p in due:
        table.add_row(p.tier, p.name, ", ".join(x for x in (p.position, p.company) if x),
                      str(p.last_contact or "never"), "; ".join(p.reasons))
    console.print(table)
    console.print(f"\nCadence: tier A every {CADENCE_DAYS['A']} days, B every {CADENCE_DAYS['B']}, "
                  f"C every {CADENCE_DAYS['C']}.")
    console.print(f"Wrote [bold]{out / 'network_plan.csv'}[/bold] and [bold]{out / 'outreach_drafts.md'}[/bold]")


def log(args) -> None:
    is_new = not TOUCHPOINTS_FILE.exists()
    with open(TOUCHPOINTS_FILE, "a", newline="") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(["date", "name", "channel", "note"])
        writer.writerow([args.date or date.today().isoformat(), args.name, args.channel, args.note])
    console.print(f"[green]Logged {args.channel} touchpoint with {args.name}.[/green]")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("plan", help="rank your network and write outreach drafts")
    p.add_argument("--export", default="linkedin_export", help="LinkedIn export .zip or unzipped folder")
    p.add_argument("--config", default="network_config.json", help="your focus keywords")
    p.add_argument("--out", default="output", help="where to write the plan and drafts")
    p.add_argument("--limit", type=int, default=15, help="max drafts per run")
    p.set_defaults(func=plan)

    l = sub.add_parser("log", help="record that you reached out to someone")
    l.add_argument("name")
    l.add_argument("--channel", default="linkedin")
    l.add_argument("--note", default="")
    l.add_argument("--date", help="YYYY-MM-DD, defaults to today")
    l.set_defaults(func=log)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
