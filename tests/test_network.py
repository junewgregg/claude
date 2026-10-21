import csv
from datetime import date
from pathlib import Path

from linkedin_messenger.network import load_network, profile_key, score_network, draft_message


def write_csv(path: Path, header, rows, preamble=""):
    with open(path, "w", newline="") as f:
        f.write(preamble)
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def make_export(d: Path):
    me = "https://www.linkedin.com/in/me-123"
    ana = "https://www.linkedin.com/in/ana-lee"
    bo = "https://www.linkedin.com/in/bo-kim"
    write_csv(d / "Connections.csv",
              ["First Name", "Last Name", "URL", "Email Address", "Company", "Position", "Connected On"],
              [["Ana", "Lee", ana, "", "BioVentures", "Partner", "03 Feb 2021"],
               ["Bo", "Kim", bo, "", "Acme", "Director", "10 Jan 2022"],
               ["Cy", "Stranger", "https://www.linkedin.com/in/cy", "", "Foo", "Engineer", "01 Jan 2023"]],
              preamble='Notes:\n"When exporting your connection data, you may notice that some of the email addresses are missing."\n\n')
    msg_header = ["CONVERSATION ID", "CONVERSATION TITLE", "FROM", "SENDER PROFILE URL", "TO",
                  "RECIPIENT PROFILE URLS", "DATE", "SUBJECT", "CONTENT", "FOLDER"]
    write_csv(d / "messages.csv", msg_header, [
        ["1", "", "Ana Lee", ana, "Me Person", me, "2023-05-01 10:00:00 UTC", "", "Happy to introduce you to Dr. Patel,\nlooping her in now.", "INBOX"],
        ["1", "", "Me Person", me, "Ana Lee", ana, "2023-05-02 10:00:00 UTC", "", "Thank you so much for the intro!", "INBOX"],
        ["2", "", "Me Person", me, "Bo Kim", bo, "2024-01-01 10:00:00 UTC", "", "hey", "INBOX"],
        ["2", "", "Bo Kim", bo, "Me Person", me, "2024-01-02 10:00:00 UTC", "", "hi!", "INBOX"],
        ["3", "", "Me Person", me, "Bo Kim", bo, "2024-01-03 10:00:00 UTC", "", "cool", "INBOX"],
        ["4", "", "Spammer", "https://www.linkedin.com/in/spam", "Me Person", me, "2024-01-03 10:00:00 UTC", "", "happy to help you buy", "SPAM"],
    ])
    write_csv(d / "Recommendations_Received.csv",
              ["First Name", "Last Name", "Company", "Job Title", "Text", "Creation Date", "Status"],
              [["Ana", "Lee", "BioVentures", "Partner", "Jun is great.", "06/01/23, 10:00 AM", "VISIBLE"]])
    write_csv(d / "Endorsement_Received_Info.csv",
              ["Endorsement Date", "Skill Name", "Endorser First Name", "Endorser Last Name", "Endorser Public Url", "Endorsement Status"],
              [["2022/01/01 10:00:00 UTC", "Grant Writing", "Bo", "Kim", "www.linkedin.com/in/bo-kim", "ACCEPTED"]])


def test_ranks_helpers_and_skips_strangers(tmp_path):
    make_export(tmp_path)
    ranked = score_network(load_network(tmp_path), ["biotech", "ventures"])
    names = [p.name for p in ranked]
    assert names == ["Ana Lee", "Bo Kim"]

    ana, bo = ranked
    assert bo.tier == "C"
    assert ana.tier == "A" and ana.recommendation and len(ana.help_messages) == 1
    assert len(ana.thanks_messages) == 1
    assert ana.last_message == date(2023, 5, 2)
    assert bo.endorsements == ["Grant Writing"] and bo.sent == 2 and bo.received == 1
    assert ana.is_due(date(2026, 10, 21))

    draft = draft_message(ana)
    assert draft.startswith("Hi Ana,") and "May 2023" in draft and "BioVentures" in draft


def test_profile_key_normalises_url_forms():
    assert profile_key("www.linkedin.com/in/Bo-Kim/") == "bo-kim"
    assert profile_key("https://www.linkedin.com/in/bo-kim?trk=x") == "bo-kim"
    assert profile_key("") == ""
