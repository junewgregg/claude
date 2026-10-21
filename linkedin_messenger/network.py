"""Find the people in a LinkedIn data export who have helped you, and plan outreach.

Reads the CSVs from LinkedIn's "Get a copy of your data" export (Connections,
messages, Recommendations_Received, Endorsement_Received_Info), scores each
person on how much they've helped you and how relevant they are to your career
goals, and works out who is due for a check-in.
"""

import csv
import re
import zipfile
from dataclasses import dataclass, field
from datetime import date, datetime
from itertools import zip_longest
from pathlib import Path

# Phrases in messages *they* sent that usually mean they helped you
HELP_PATTERNS = [
    r"\bintroduc\w*",
    r"\bintro\b",
    r"\bconnect(ing)? you (with|to)\b",
    r"\bput you in touch\b",
    r"\bloop(ed|ing)? (you )?in\b",
    r"\bcc'?ing\b",
    r"\breferr(ed|al)\b",
    r"\brecommend(ed)? you\b",
    r"\bas a reference\b",
    r"\bhappy to help\b",
    r"\bglad to help\b",
    r"\bpass(ed)? (your|it) along\b",
    r"\bforward(ed)? your\b",
    r"\bshared your\b",
    r"\bvouch\w*",
]

# Phrases in messages *you* sent that usually mean they helped you
GRATITUDE_PATTERNS = [
    r"\bthank you so much\b",
    r"\bthanks so much\b",
    r"\breally appreciate\w*",
    r"\bgrateful\b",
    r"\bowe you\b",
    r"\bmeans a lot\b",
    r"\bcouldn'?t have\b",
    r"\bthanks? (you )?for (the|your) (intro|introduction|referral|help|advice|support|recommendation|time)\b",
]

SENIOR_TITLES = [
    "founder", "ceo", "cto", "coo", "cfo", "chief", "president", "partner",
    "principal", "vp", "vice president", "head of", "director", "professor",
    "investor", "managing", "board",
]

# Days between check-ins for each tier
CADENCE_DAYS = {"A": 60, "B": 120, "C": 180}

_HELP_RE = re.compile("|".join(HELP_PATTERNS), re.I)
_GRATITUDE_RE = re.compile("|".join(GRATITUDE_PATTERNS), re.I)

_DATE_FORMATS = [
    "%d %b %Y",                # Connections: 21 Oct 2024
    "%Y-%m-%d %H:%M:%S %Z",    # messages: 2024-10-21 14:03:00 UTC
    "%Y/%m/%d %H:%M:%S %Z",    # endorsements: 2024/10/21 14:03:00 UTC
    "%m/%d/%y, %I:%M %p",      # recommendations: 10/21/24, 02:03 PM
    "%m/%d/%y",
    "%Y-%m-%d",
]


def parse_date(value: str) -> date | None:
    value = (value or "").strip()
    if not value:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def profile_key(url: str) -> str:
    """Reduce any form of a LinkedIn profile URL to its /in/<slug> part."""
    match = re.search(r"linkedin\.com/in/([^/?#\s]+)", url or "", re.I)
    return match.group(1).lower() if match else ""


def name_key(name: str) -> str:
    return re.sub(r"[^a-z ]", "", re.sub(r"\s+", " ", (name or "").lower())).strip()


def read_export_csv(path: Path, required_column: str) -> list[dict]:
    """Read a LinkedIn export CSV, skipping any notes LinkedIn puts above the header.

    Column names come back lowercased.
    """
    rows = []
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        header = None
        for row in csv.reader(f):
            cells = [c.strip() for c in row]
            if header is None:
                if required_column.lower() in (c.lower() for c in cells):
                    header = [c.lower() for c in cells]
                continue
            if any(cells):
                rows.append(dict(zip(header, cells)))
    return rows


def find_export_file(export_dir: Path, filename: str) -> Path | None:
    for path in export_dir.rglob("*.csv"):
        if path.name.lower() == filename.lower():
            return path
    return None


def unpack_export(export_path: Path, work_dir: Path) -> Path:
    """Accept either the export .zip or an already-unzipped folder."""
    if export_path.is_dir():
        return export_path
    if zipfile.is_zipfile(export_path):
        target = work_dir / export_path.stem
        with zipfile.ZipFile(export_path) as zf:
            zf.extractall(target)
        return target
    raise FileNotFoundError(f"{export_path} is not a folder or a .zip file")


@dataclass
class Person:
    name: str
    url: str = ""
    email: str = ""
    company: str = ""
    position: str = ""
    connected_on: date | None = None
    sent: int = 0
    received: int = 0
    last_message: date | None = None
    last_touch: date | None = None
    recommendation: str = ""
    endorsements: list[str] = field(default_factory=list)
    help_messages: list[tuple[date | None, str]] = field(default_factory=list)
    thanks_messages: list[tuple[date | None, str]] = field(default_factory=list)
    help_score: float = 0.0
    relevance_score: float = 0.0
    tier: str = ""
    reasons: list[str] = field(default_factory=list)

    @property
    def first_name(self) -> str:
        return self.name.split(" ")[0] if self.name else "there"

    @property
    def last_contact(self) -> date | None:
        dates = [d for d in (self.last_message, self.last_touch) if d]
        return max(dates) if dates else None

    @property
    def score(self) -> float:
        return self.help_score + self.relevance_score

    def days_since_contact(self, today: date) -> int | None:
        return (today - self.last_contact).days if self.last_contact else None

    def is_due(self, today: date) -> bool:
        days = self.days_since_contact(today)
        return days is None or days >= CADENCE_DAYS.get(self.tier, 365)


class Network:
    def __init__(self):
        self.people: dict[str, Person] = {}
        self._by_name: dict[str, str] = {}

    def get(self, name: str = "", url: str = "", create: bool = True) -> Person | None:
        key = profile_key(url)
        nkey = name_key(name)
        if not key and nkey in self._by_name:
            key = self._by_name[nkey]
        if not key and not nkey:
            return None
        key = key or f"name:{nkey}"
        person = self.people.get(key)
        if person is None:
            # Someone first seen by name only may later turn up with a URL
            old_key = self._by_name.get(nkey)
            if old_key and old_key.startswith("name:") and old_key in self.people:
                person = self.people.pop(old_key)
                person.url = person.url or url
            elif create:
                person = Person(name=name.strip(), url=url.strip())
            else:
                return None
            self.people[key] = person
        if nkey:
            self._by_name[nkey] = key
        if not person.name and name:
            person.name = name.strip()
        if not person.url and url:
            person.url = url.strip()
        return person


def load_network(export_dir: Path) -> Network:
    network = Network()

    connections = find_export_file(export_dir, "Connections.csv")
    if connections:
        for row in read_export_csv(connections, "First Name"):
            name = f"{row.get('first name', '')} {row.get('last name', '')}".strip()
            person = network.get(name, row.get("url", ""))
            if not person:
                continue
            person.email = row.get("email address", "")
            person.company = row.get("company", "")
            person.position = row.get("position", "")
            person.connected_on = parse_date(row.get("connected on", ""))

    recommendations = find_export_file(export_dir, "Recommendations_Received.csv")
    if recommendations:
        for row in read_export_csv(recommendations, "Text"):
            if row.get("status", "").upper() in ("HIDDEN", "PENDING"):
                continue
            name = f"{row.get('first name', '')} {row.get('last name', '')}".strip()
            person = network.get(name)
            if person:
                person.recommendation = row.get("text", "")

    endorsements = find_export_file(export_dir, "Endorsement_Received_Info.csv")
    if endorsements:
        for row in read_export_csv(endorsements, "Skill Name"):
            name = f"{row.get('endorser first name', '')} {row.get('endorser last name', '')}".strip()
            person = network.get(name, row.get("endorser public url", ""))
            if person and row.get("skill name"):
                person.endorsements.append(row["skill name"])

    messages = find_export_file(export_dir, "messages.csv")
    if messages:
        _load_messages(network, read_export_csv(messages, "Content"))

    return network


def _load_messages(network: Network, rows: list[dict]) -> None:
    rows = [r for r in rows if "spam" not in r.get("folder", "").lower()]

    # Whoever sent the most messages in your own export is you
    sender_counts: dict[str, int] = {}
    for row in rows:
        key = profile_key(row.get("sender profile url", "")) or name_key(row.get("from", ""))
        sender_counts[key] = sender_counts.get(key, 0) + 1
    me = max(sender_counts, key=sender_counts.get) if sender_counts else ""

    for row in rows:
        when = parse_date(row.get("date", ""))
        content = row.get("content", "")
        sender_url = row.get("sender profile url", "")
        is_me = (profile_key(sender_url) or name_key(row.get("from", ""))) == me

        if is_me:
            names = [n.strip() for n in row.get("to", "").split(",")]
            urls = [u.strip() for u in row.get("recipient profile urls", "").split(",")]
            others = [
                network.get(name, url)
                for name, url in zip_longest(names, urls, fillvalue="")
                if (profile_key(url) or name_key(name)) != me
            ]
            for person in filter(None, others):
                person.sent += 1
                _bump_last_message(person, when)
                if _GRATITUDE_RE.search(content):
                    person.thanks_messages.append((when, content))
        else:
            person = network.get(row.get("from", ""), sender_url)
            if not person:
                continue
            person.received += 1
            _bump_last_message(person, when)
            if _HELP_RE.search(content):
                person.help_messages.append((when, content))


def _bump_last_message(person: Person, when: date | None) -> None:
    if when and (person.last_message is None or when > person.last_message):
        person.last_message = when


def load_touchpoints(network: Network, path: Path) -> None:
    """Apply your own outreach log (date,name,channel,note) so cadences reset."""
    if not path.exists():
        return
    for row in read_export_csv(path, "name"):
        person = network.get(row.get("name", ""), row.get("url", ""), create=False)
        when = parse_date(row.get("date", ""))
        if person and when and (person.last_touch is None or when > person.last_touch):
            person.last_touch = when


def score_network(network: Network, focus_keywords: list[str]) -> list[Person]:
    """Score everyone, assign tiers, and return the people worth keeping warm."""
    focus = [k.lower() for k in focus_keywords if k.strip()]
    ranked = []
    for person in network.people.values():
        help_score = 0.0
        reasons = []
        if person.recommendation:
            help_score += 10
            reasons.append("wrote you a recommendation")
        if person.help_messages:
            help_score += min(4 * len(person.help_messages), 12)
            reasons.append(f"{len(person.help_messages)} message(s) offering intros/referrals/help")
        if person.thanks_messages:
            help_score += min(3 * len(person.thanks_messages), 9)
            reasons.append(f"you thanked them warmly {len(person.thanks_messages)} time(s)")
        if person.endorsements:
            help_score += min(len(person.endorsements), 4)
            reasons.append(f"endorsed you ({', '.join(sorted(set(person.endorsements))[:3])})")
        two_way = min(person.sent, person.received)
        if two_way:
            help_score += min(0.5 * two_way, 5)
            reasons.append(f"{person.sent + person.received} messages back and forth")

        relevance = 0.0
        role = f"{person.position} {person.company}".lower()
        if any(t in role for t in SENIOR_TITLES):
            relevance += 3
            reasons.append("senior role")
        matched = [k for k in focus if k in role]
        if matched:
            relevance += min(4 * len(matched), 8)
            reasons.append(f"matches your focus: {', '.join(matched)}")

        person.help_score = help_score
        person.relevance_score = relevance
        person.reasons = reasons
        if help_score == 0:
            continue
        total = person.score
        person.tier = "A" if total >= 15 else "B" if total >= 7 else "C" if total >= 3 else ""
        if person.tier:
            ranked.append(person)

    ranked.sort(key=lambda p: p.score, reverse=True)
    return ranked


def _month(d: date | None) -> str:
    return d.strftime("%B %Y") if d else ""


def draft_message(person: Person) -> str:
    """A starting-point note built on the strongest thing they did for you.

    The bracketed line is for you to fill in; never send a draft with it left in.
    """
    first = person.first_name
    if person.help_messages:
        when = _month(person.help_messages[-1][0])
        opener = f"I was thinking recently about the help you gave me{' back in ' + when if when else ''}. It made a real difference, and I don't think I thanked you enough at the time."
    elif person.recommendation:
        opener = "I came across the recommendation you wrote for me and it still means a lot. Thank you again for taking the time."
    elif person.thanks_messages:
        when = _month(person.thanks_messages[-1][0])
        opener = f"I still remember how generous you were with your help{' in ' + when if when else ''}, and wanted to say thank you again."
    elif person.endorsements:
        skill = sorted(set(person.endorsements))[0]
        opener = f"I noticed your endorsement for {skill} and wanted to say thanks, it's kind of you."
    else:
        when = _month(person.last_message)
        opener = f"It's been a while since we last talked{' (' + when + ')' if when else ''} and you came to mind."

    at = f" at {person.company}" if person.company else ""
    return (
        f"Hi {first},\n\n"
        f"{opener}\n\n"
        f"[One or two lines on what you're working on now and where you're heading.]\n\n"
        f"How are things going{at}? I'd love to hear what you're focused on these days, "
        f"and if there's anything I can help with, I'm glad to return the favour.\n\n"
        f"Best,"
    )
