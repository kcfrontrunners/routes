#!/usr/bin/env python3
"""
patch_route_history.py

Incrementally updates route-history.json by merging route dates found in
recent Google Calendar events.  Unlike a full rebuild, this script looks back
only a short window (default: 7 days) and **merges** new dates into whatever
already exists in route-history.json.

This makes it safe to run after each event (e.g. Wednesday evening, Sunday
morning) without destroying accumulated history.  Existing dates for routes
not seen in the lookback window are preserved untouched.

Usage:
    python3 tools/patch_route_history.py --api-key YOUR_GOOGLE_API_KEY

    # Two-week lookback (useful when a run was missed):
    python3 tools/patch_route_history.py --api-key $KC_GOOGLE_API_KEY --days-back 14

    # Preview without writing:
    python3 tools/patch_route_history.py --api-key $KC_GOOGLE_API_KEY --dry-run

GitHub Actions schedule (this repo):
    - cron: '0 14 * * 3'   # Wednesday 9am CT (UTC-5)
    - cron: '0 16 * * 0'   # Sunday 11am CT (UTC-5)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

KC_TZ = ZoneInfo("America/Chicago")


# ---------------------------------------------------------------------------
# Defaults — relative to this script's location inside the routes repo
# ---------------------------------------------------------------------------

_REPO_ROOT    = Path(__file__).parent.parent
DEFAULT_CALENDAR = "kansascityfrontrunners@gmail.com"
DEFAULT_ROUTES   = _REPO_ROOT / "data" / "routes.json"
DEFAULT_HISTORY  = _REPO_ROOT / "data" / "route-history.json"


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--api-key",   required=True, help="Google Calendar API key")
    parser.add_argument("--calendar",  default=DEFAULT_CALENDAR, help="Calendar ID (default: %(default)s)")
    parser.add_argument("--routes",    type=Path, default=DEFAULT_ROUTES,  help="Path to routes.json")
    parser.add_argument("--history",   type=Path, default=DEFAULT_HISTORY, help="Path to route-history.json")
    parser.add_argument("--days-back", type=int,  default=7,
                        help="How many days back to scan for events (default: 7)")
    parser.add_argument("--dry-run",   action="store_true", help="Print changes without writing files")
    parser.add_argument("--force",     action="store_true",
                        help="Write route-history.json even when no new dates were found")
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Google Calendar fetch
# ---------------------------------------------------------------------------

CALENDAR_BASE = "https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events"


def fetch_events(calendar_id: str, api_key: str, days_back: int) -> list[dict]:
    """Fetch all single events in the past `days_back` days, handling pagination."""
    now = datetime.now(tz=timezone.utc)
    time_min = (now - timedelta(days=days_back)).isoformat()
    time_max = now.isoformat()

    encoded_id = urllib.parse.quote(calendar_id, safe="")
    base_url = CALENDAR_BASE.format(calendar_id=encoded_id)

    params: dict[str, str] = {
        "key": api_key,
        "singleEvents": "true",
        "orderBy": "startTime",
        "timeMin": time_min,
        "timeMax": time_max,
        "maxResults": "2500",
    }

    all_items: list[dict] = []
    page_token: str | None = None

    while True:
        if page_token:
            params["pageToken"] = page_token
        elif "pageToken" in params:
            del params["pageToken"]

        url = base_url + "?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url) as resp:  # noqa: S310
            payload = json.loads(resp.read())

        all_items.extend(payload.get("items", []))
        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    return all_items


def event_date(item: dict) -> date | None:
    """Return the KC-local calendar date of the event.

    Google Calendar may return dateTime in the event's local timezone
    (e.g. -05:00 CDT) or in UTC (with Z suffix).  We always convert to
    America/Chicago so that late-evening events (e.g. a 9 PM CDT Wednesday
    run = 02:00 UTC Thursday) are recorded on the correct KC calendar date,
    not the following UTC day.  The Z-suffix replacement also ensures
    compatibility with Python < 3.11 where fromisoformat rejects 'Z'.
    """
    start = item.get("start", {})
    date_time = start.get("dateTime")
    if date_time:
        try:
            dt = datetime.fromisoformat(date_time.replace("Z", "+00:00"))
            return dt.astimezone(KC_TZ).date()
        except (ValueError, KeyError):
            pass
    date_only = start.get("date")
    if date_only:
        try:
            return date.fromisoformat(date_only)
        except ValueError:
            pass
    return None


# ---------------------------------------------------------------------------
# Route-marker parsing  (mirrors the Swift regex in the iOS app)
# ---------------------------------------------------------------------------

_ROUTE_ID_RE = re.compile(
    r"(?i)\b(?:run|walk)?\s*route\s*:\s*(?:(\d+)|.*?gmap-pedometer\.com/?\?r=(\d+))",
    re.IGNORECASE | re.DOTALL,
)

_GMAP_ID_RE = re.compile(r"gmap-pedometer\.com/?\?r=(\d+)", re.IGNORECASE)

_KCFR_ROUTE_RE = re.compile(r"kcfrontrunners\.org/routes/#route-(\d+)", re.IGNORECASE)

_ROUTE_URL_RE = re.compile(
    r"(?i)\b(?:run|walk)?\s*route\s*:\s*(?:<a[^>]*href=\"((?:https?://|www\.)[^\"]+)\"|((?:https?://|www\.)[^\s<]+))",
    re.IGNORECASE | re.DOTALL,
)


def parse_route_ids(text: str) -> list[int]:
    results: list[int] = []
    for m in _ROUTE_ID_RE.finditer(text):
        for group in m.groups():
            if group:
                try:
                    val = int(group)
                    if val not in results:
                        results.append(val)
                except ValueError:
                    pass
    return results


def parse_route_urls(text: str) -> list[str]:
    results: list[str] = []
    for m in _ROUTE_URL_RE.finditer(text):
        for group in m.groups():
            if group and group not in results:
                results.append(group)
    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    args = parse_args()

    if not args.routes.exists():
        print(f"ERROR: routes.json not found at {args.routes}", file=sys.stderr)
        return 1

    with args.routes.open(encoding="utf-8") as f:
        routes: list[dict] = json.load(f)

    # Build lookup indexes
    by_id: dict[int, str] = {
        int(r["route_id"]): r["route_id"]
        for r in routes if r.get("route_id", "").isdigit()
    }
    display_names: dict[str, str] = {r["route_id"]: r.get("display_name", "") for r in routes}
    by_gpx: dict[str, str] = {}
    by_garmin: dict[str, str] = {}
    for r in routes:
        if gpx := r.get("gpx_url", "").strip().lower():
            by_gpx.setdefault(gpx, r["route_id"])
        if garmin := r.get("garmin_url", "").strip().lower():
            by_garmin.setdefault(garmin, r["route_id"])

    # Load existing history (empty dict if file absent)
    existing_history: dict[str, dict] = {}
    if args.history.exists():
        with args.history.open(encoding="utf-8") as f:
            existing_history = json.load(f).get("history", {})
    else:
        print(f"Note: {args.history} not found — will create fresh.")

    print(f"Fetching calendar events: last {args.days_back} days …")
    try:
        items = fetch_events(args.calendar, args.api_key, args.days_back)
    except Exception as exc:
        print(f"ERROR: Calendar fetch failed: {exc}", file=sys.stderr)
        return 1

    print(f"  {len(items)} event(s) retrieved")

    # Collect (route_id_string, date) pairs from the fetched events
    candidates: list[tuple[str, date]] = []

    for item in items:
        raw = item.get("description") or ""
        ev_date = event_date(item)
        if ev_date is None:
            continue

        resolved: list[str] = []

        for url in parse_route_urls(raw):
            lowered = url.lower()
            if rid := by_gpx.get(lowered):
                if rid not in resolved:
                    resolved.append(rid)
                continue
            if rid := by_garmin.get(lowered):
                if rid not in resolved:
                    resolved.append(rid)
                continue
            if m := _GMAP_ID_RE.search(url):
                route_int_id = int(m.group(1))
                if route_int_id in by_id:
                    rid = by_id[route_int_id]
                    if rid not in resolved:
                        resolved.append(rid)
                continue
            # kcfrontrunners.org: #route-NNNNNN fragment equals numeric route_id
            if m := _KCFR_ROUTE_RE.search(url):
                route_int_id = int(m.group(1))
                if route_int_id in by_id:
                    rid = by_id[route_int_id]
                    if rid not in resolved:
                        resolved.append(rid)

        for route_int_id in parse_route_ids(raw):
            if route_int_id in by_id:
                rid = by_id[route_int_id]
                if rid not in resolved:
                    resolved.append(rid)

        for rid in resolved:
            candidates.append((rid, ev_date))

    # Merge candidates into existing history
    new_count = 0
    skipped_count = 0

    if args.dry_run and candidates:
        print()

    for rid, ev_date in candidates:
        entry = existing_history.setdefault(rid, {
            "display_name": display_names.get(rid, ""),
            "last_run_dates": [],
        })
        if not entry.get("display_name"):
            entry["display_name"] = display_names.get(rid, "")

        date_str = ev_date.isoformat()
        if date_str not in entry["last_run_dates"]:
            if args.dry_run:
                print(f"  {rid:>10}  {display_names.get(rid, ''):30s}  {date_str}  ← new")
            else:
                entry["last_run_dates"].append(date_str)
            new_count += 1
        else:
            if args.dry_run:
                print(f"  {rid:>10}  {display_names.get(rid, ''):30s}  {date_str}  (already present)")
            skipped_count += 1

    # Sort newest-first
    for entry in existing_history.values():
        entry["last_run_dates"].sort(reverse=True)

    print()
    print(f"{new_count} new date(s) to add, {skipped_count} already present.")

    if args.dry_run:
        print("Dry run — no files written.")
        return 0

    if new_count == 0 and not args.force:
        print("Nothing new — route-history.json unchanged.")
        return 0

    output = {
        "updated_at": datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "history": {
            rid: entry
            for rid, entry in sorted(existing_history.items())
        },
    }

    args.history.parent.mkdir(parents=True, exist_ok=True)
    with args.history.open("w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Written: {args.history}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
