# speed-profile.json.py — Per-track average speed by object type
#
# Used by the Speed Profile chart (dot strip + box plot) and the
# Raw Data "Speed Profile" tab.
#
# Observable Framework invokes this as:
#   python speed-profile.json.py --org_subdomain=pip

import argparse
import json
import os
import sys

from _bq_helpers import OBJECT_TYPE_CASE, get_bq_client, get_table_fqn, run_query

parser = argparse.ArgumentParser()
parser.add_argument("--org_subdomain", required=True)
args = parser.parse_args()

PERIOD_START = os.environ.get("PERIOD_START", "2026-01-19T00:00:00")
PERIOD_END = os.environ.get("PERIOD_END", "2026-01-19T23:59:59")

print(f"Loading speed profile for {args.org_subdomain}", file=sys.stderr)

try:
    client = get_bq_client()
    table = get_table_fqn(args.org_subdomain)

    query = f"""
    SELECT
      track_identifier AS track_id,
      {OBJECT_TYPE_CASE} AS object_type,
      ROUND(AVG(SAFE_CAST(speed AS FLOAT64)) * 2.23694, 1) AS avg_speed
    FROM {table}
    WHERE timestamp BETWEEN @period_start AND @period_end
    GROUP BY track_identifier, object_type
    ORDER BY avg_speed DESC
    """

    rows = run_query(client, query, PERIOD_START, PERIOD_END)

    data = []
    for row in rows:
        data.append({
            "track_id": row.track_id,
            "object_type": row.object_type,
            "avg_speed": float(row.avg_speed or 0),
        })

    print(f"Loaded {len(data)} track speed profiles", file=sys.stderr)
    print(json.dumps(data))

except Exception as e:
    print(f"Error loading speed profile for {args.org_subdomain}: {e}", file=sys.stderr)
    sys.exit(1)
