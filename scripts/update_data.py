#!/usr/bin/env python3
"""Pull the Credits desk tracker Google Sheet and regenerate data.js.

Runs in GitHub Actions (scheduled 4x/day + manual "Run workflow" button).
Needs a Google service account with "Viewer" access to the sheet; its JSON
key must be in the GOOGLE_SERVICE_ACCOUNT_JSON secret/env var.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

import requests
from google.oauth2 import service_account

SHEET_ID = "1t_8jx6aXRzU2puanGdnrvqwxNx_o7ddDmcB8A3ofDgY"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
HERE = os.path.dirname(os.path.abspath(__file__))
DATA_JS_PATH = os.path.join(HERE, "..", "data.js")


def get_values(session, a1_range):
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{a1_range}"
    resp = session.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json().get("values", [])


def parse_money(cell):
    if not cell:
        return None
    digits = re.sub(r"[^\d.]", "", str(cell))
    return float(digits) if digits else None


def row_to_dict(headers, row):
    return {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}


def extract_program(row):
    """The programs sheet (Sheet7) has ragged rows (blank cells mid-row get
    dropped by the API), so columns don't line up by index. Classify each
    cell by shape instead: program name / provider are always first two;
    credit_amount is the first cell with a currency sign; tier starts with
    'Tier'; notes is the longest remaining descriptive cell."""
    if not row or not row[0]:
        return None
    program = row[0]
    provider = row[1] if len(row) > 1 else ""
    rest = row[2:]

    credit_amount = ""
    tier = ""
    notes_candidates = []
    used = set()

    for i, cell in enumerate(rest):
        cell = (cell or "").strip()
        if not cell:
            continue
        if not credit_amount and ("$" in cell or "€" in cell):
            credit_amount = cell
            used.add(i)
        elif not tier and cell.lower().startswith("tier"):
            tier = cell
            used.add(i)

    for i, cell in enumerate(rest):
        cell = (cell or "").strip()
        if not cell or i in used:
            continue
        if cell.startswith("http"):
            continue
        if re.fullmatch(r"[\d,.]+", cell):
            continue
        if cell in ("🟢 Active", "🔴 Inactive", "Active", "Inactive"):
            continue
        notes_candidates.append(cell)

    notes = max(notes_candidates, key=len) if notes_candidates else ""

    return {
        "program": program,
        "provider": provider,
        "credit_amount": credit_amount,
        "tier": tier,
        "notes": notes,
    }


def main():
    creds_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not creds_json:
        print("ERROR: GOOGLE_SERVICE_ACCOUNT_JSON env var is not set.", file=sys.stderr)
        sys.exit(1)

    credentials = service_account.Credentials.from_service_account_info(json.loads(creds_json), scopes=SCOPES)
    session = requests.Session()
    credentials.refresh(__import__("google.auth.transport.requests", fromlist=["Request"]).Request())
    session.headers.update({"Authorization": f"Bearer {credentials.token}"})

    app_rows = get_values(session, "Applications!A1:Q5000")
    app_headers = app_rows[0]
    applications = []
    for row in app_rows[1:]:
        r = row_to_dict(app_headers, row)
        if not r.get("Company") and not r.get("Program"):
            continue
        applications.append(
            {
                "id": r.get("ID") or "",
                "company": r.get("Company") or "",
                "program": r.get("Program") or "",
                "provider": r.get("Provider") or "",
                "consultant": r.get("Consultant") or "",
                "status": r.get("Status") or "",
                "requested_usd": parse_money(r.get("Requested $")),
                "approved_usd": parse_money(r.get("Approved $")),
                "date_applied": r.get("Date applied") or None,
                "date_received": r.get("Date received") or None,
                "next_action": r.get("Next action") or "",
            }
        )

    prog_rows = get_values(session, "Programs_new!A1:K500")
    programs = [p for p in (extract_program(row) for row in prog_rows[1:]) if p]

    comp_rows = get_values(session, "Companies!A1:J200")
    comp_headers = comp_rows[0]
    companies = []
    for row in comp_rows[1:]:
        r = row_to_dict(comp_headers, row)
        if not r.get("Company"):
            continue
        companies.append(r)

    team_rows = get_values(session, "Team!A1:J50")
    team_headers = team_rows[0]
    team = []
    for row in team_rows[1:]:
        r = row_to_dict(team_headers, row)
        if not r.get("Consultant"):
            continue
        team.append(r)

    OPEN_STATUSES = {"Applied", "Pending", "Action required", "Planned", "Blocked", "Blocked / unable to apply", "(blank)"}
    total_received_usd = 0.0
    open_pipeline_usd = 0.0
    status_counts = {}
    for a in applications:
        status_counts[a["status"]] = status_counts.get(a["status"], 0) + 1
        if a["status"] == "Received":
            total_received_usd += a["approved_usd"] or 0
        elif a["status"] in OPEN_STATUSES:
            open_pipeline_usd += a["requested_usd"] or 0

    applied_by_day = {}
    received_by_day = {}
    for a in applications:
        if a["date_applied"] and a["date_applied"] >= "2021-01-01":
            applied_by_day[a["date_applied"]] = applied_by_day.get(a["date_applied"], 0) + 1
        if a["status"] == "Received" and a["date_received"] and a["date_received"] >= "2021-01-01":
            received_by_day[a["date_received"]] = received_by_day.get(a["date_received"], 0) + (a["approved_usd"] or 0)

    bundle = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "source": "Credits desk tracker (Google Sheet)",
        "overall": {
            "total_applications": len(applications),
            "total_received_usd": total_received_usd,
            "open_pipeline_usd": open_pipeline_usd,
            "status_counts": status_counts,
        },
        "companies": companies,
        "team": team,
        "programs": programs,
        "applications": applications,
        "timeseries": {
            "applied": sorted(applied_by_day.items()),
            "received": sorted(received_by_day.items()),
        },
    }

    js = "window.DASHBOARD_DATA = " + json.dumps(bundle, ensure_ascii=False, indent=2) + ";\n"
    with open(DATA_JS_PATH, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"Wrote {DATA_JS_PATH}: {len(applications)} applications, {len(programs)} programs.")


if __name__ == "__main__":
    main()
