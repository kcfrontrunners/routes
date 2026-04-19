#!/usr/bin/env python3
"""
Scrapes the KC Frontrunners & Walkers fundraising total from their
AIDS Walk Kansas City team page and writes data/aidswalk.json.

Run manually or via GitHub Actions (.github/workflows/update-aidswalk.yml).
"""
import json
import re
import sys
from datetime import date

import requests

# Team's own page — has a dedicated <span class="was-raised"> element
URL = "https://www.aidswalkkansascity.org/kcfrontrunners"
DONATE_URL = "https://www.aidswalkkansascity.org/Donate/Index/2107845"
OUT_PATH = "data/aidswalk.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    )
}


def main():
    print(f"Fetching {URL} …")
    resp = requests.get(URL, timeout=20, headers=HEADERS)
    resp.raise_for_status()
    html = resp.text

    # Primary: <span class="was-raised">$5,200</span>
    m = re.search(r'class="was-raised">\s*\$([\d,]+)', html)

    # Fallback: tableColRaised cell on team list page (older layout)
    if not m:
        m = re.search(r'tableColRaised">\s*\$([\d,]+)', html)

    if not m:
        # Dump a diagnostic snippet so we can debug in Actions logs
        print("ERROR: Could not find raised amount. First 2000 chars of response:", file=sys.stderr)
        print(html[:2000], file=sys.stderr)
        sys.exit(1)

    raised = int(m.group(1).replace(",", ""))

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
