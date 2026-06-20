#!/usr/bin/env python3
"""
purge_routes.py

Removes routes marked Keep=No (with no run history) from the canonical route
data files.  Routes marked Keep=No that DO have run history are retained so
historical data is preserved.

Usage:
    python3 tools/purge_routes.py \\
        --csv "data/Routes_for_Randy Revised - 2/routes_to_keep_or_purge.csv"

    # Preview without writing:
    python3 tools/purge_routes.py \\
        --csv "data/Routes_for_Randy Revised - 2/routes_to_keep_or_purge.csv" \\
        --dry-run
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = Path(__file__).parent.parent
DEFAULT_ROUTES = _REPO_ROOT / "data" / "routes.json"
DEFAULT_CURATION = _REPO_ROOT / "data" / "route-curation.csv"
DEFAULT_META = _REPO_ROOT / "data" / "routes-meta.json"
DEFAULT_HISTORY = _REPO_ROOT / "data" / "route-history.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--csv", required=True, type=Path,
        help="Path to routes_to_keep_or_purge.csv (relative to repo root or absolute)",
    )
    parser.add_argument("--routes",   type=Path, default=DEFAULT_ROUTES)
    parser.add_argument("--curation", type=Path, default=DEFAULT_CURATION)
    parser.add_argument("--meta",     type=Path, default=DEFAULT_META)
    parser.add_argument("--history",  type=Path, default=DEFAULT_HISTORY)
    parser.add_argument("--dry-run",  action="store_true",
                        help="Print changes without writing files")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    csv_path = args.csv if args.csv.is_absolute() else _REPO_ROOT / args.csv

    # --- Load curation CSV ---
    no_ids: set[str] = set()
    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("Keep?", "").strip() == "No":
                rid = str(row.get("Route ID", "")).strip()
                if rid:
                    no_ids.add(rid)

    print(f"Routes marked Keep=No in CSV: {len(no_ids)}")

    # --- Load history ---
    has_history: set[str] = set()
    history_dates: dict[str, list[str]] = {}
    with args.history.open(encoding="utf-8") as f:
        history_data = json.load(f).get("history", {})
    for rid, entry in history_data.items():
        dates = entry.get("last_run_dates", [])
        if dates:
            has_history.add(rid)
            history_dates[rid] = dates

    # --- Compute sets ---
    purge_ids = no_ids - has_history
    preserve_due_to_history = no_ids & has_history

    print(f"Keep=No WITH run history (retained): {len(preserve_due_to_history)}")
    print(f"Keep=No WITHOUT run history (to purge): {len(purge_ids)}")
    print()

    # --- Report: retained despite Keep=No ---
    print("=== Retained (Keep=No but has run history) ===")
    for rid in sorted(preserve_due_to_history):
        dates = history_dates.get(rid, [])
        date_preview = ", ".join(dates[:3]) + ("…" if len(dates) > 3 else "")
        print(f"  {rid:>12}  [{date_preview}]")
    print()

    # --- Load routes.json ---
    with args.routes.open(encoding="utf-8") as f:
        routes: list[dict] = json.load(f)

    kept_routes = [r for r in routes if str(r.get("route_id", "")) not in purge_ids]
    purged_routes = [r for r in routes if str(r.get("route_id", "")) in purge_ids]

    print(f"routes.json before: {len(routes)}")
    print(f"routes.json after:  {len(kept_routes)}")
    print(f"Removed:            {len(purged_routes)}")
    print()

    # --- Load route-curation.csv ---
    with args.curation.open(newline="", encoding="utf-8") as f:
        curation_reader = csv.DictReader(f)
        curation_fieldnames = curation_reader.fieldnames or []
        curation_rows = list(curation_reader)

    kept_curation = [r for r in curation_rows if str(r.get("route_id", "")) not in purge_ids]
    print(f"route-curation.csv before: {len(curation_rows)} rows")
    print(f"route-curation.csv after:  {len(kept_curation)} rows")
    print()

    # --- Report: orphaned GPX files ---
    print("=== Orphaned GPX files (purged routes — keep for now) ===")
    for r in sorted(purged_routes, key=lambda x: x.get("display_name", "")):
        gpx = r.get("gpx_url", "") or r.get("gpx_file_name", "")
        print(f"  {r.get('route_id', ''):>12}  {r.get('display_name', ''):40s}  {gpx}")
    print()

    if args.dry_run:
        print("Dry run — no files written.")
        return 0

    # --- Write routes.json ---
    with args.routes.open("w", encoding="utf-8") as f:
        json.dump(kept_routes, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"Written: {args.routes}")

    # --- Write route-curation.csv ---
    with args.curation.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=curation_fieldnames)
        writer.writeheader()
        writer.writerows(kept_curation)
    print(f"Written: {args.curation}")

    # --- Write routes-meta.json ---
    meta = {
        "version": datetime.now(tz=timezone.utc).strftime("%Y-%m-%d.1"),
        "updated_at": datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "route_count": len(kept_routes),
    }
    with args.meta.open("w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")
    print(f"Written: {args.meta}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
