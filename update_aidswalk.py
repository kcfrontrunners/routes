#!/usr/bin/env python3
"""
Scrapes the KC Frontrunners & Walkers fundraising total from the
AIDS Walk Kansas City team list and writes data/aidswalk.json.

Run manually or via GitHub Actions (.github/workflows/update-aidswalk.yml).
"""
import json
import re
import sys
from datetime import date

import requests

URL = "https://www.aidswalkkansascity.org/Static/Team-List"
TEAM = "Kansas City Frontrunners"
DONATE_URL = "https://www.aidswalkkansascity.org/Donate/Index/2107845"
OUT_PATH = "data/aidswalk.json"


def main():
    print(f"Fetching {URL} …")
    resp = requests.get(URL, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    html = resp.text

    idx = html.find(TEAM)
    if idx == -1:
        print(f"ERROR: Team '{TEAM}' not found on page.", file=sys.stderr)
        sys.exit(1)

    # Dollar amount appears within a few thousand characters after the team name
    # (member links, table cells, etc. push it further out in raw HTML)
    snippet = html[idx : idx + 3000]
    m = re.search(r"\$([\d,]+(?:\.\d{2})?)", snippet)
    if not m:
        print("ERROR: No dollar amount found near team name.", file=sys.stderr)
        sys.exit(1)

    raised = int(m.group(1).replace(",", "").split(".")[0])

    out = {
        "raised": raised,
        "updated": date.today().isoformat(),
        "donate_url": DONATE_URL,
    }

    with open(OUT_PATH, "w") as f:
        json.dump(out, f)
        f.write("\n")

    print(f"Written {OUT_PATH}: ${raised:,} as of {out['updated']}")


if __name__ == "__main__":
    main()
