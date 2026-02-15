# timeline.json.py — Pre-binned 5-minute activity counts by object type
#
# Used by the Activity Timeline (bar chart) and Activity Area chart.
# Each row represents one 5-minute bin for one object type.
#
# Observable Framework invokes this as:
#   python timeline.json.py --org_subdomain=pip

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

print(f"Loading timeline for {args.org_subdomain}", file=sys.stderr)

try:
    client = get_bq_client()
    table = get_table_fqn(args.org_subdomain)

    query = f"""
    SELECT
      TIMESTAMP_ADD(
        TIMESTAMP_TRUNC(timestamp, HOUR),
        INTERVAL CAST(FLOOR(EXTRACT(MINUTE FROM timestamp) / 5) * 5 AS INT64) MINUTE
      ) AS bin_start,
      {OBJECT_TYPE_CASE} AS object_type,
      COUNT(*) AS count
    FROM {table}
    WHERE timestamp BETWEEN @period_start AND @period_end
    GROUP BY bin_start, object_type
    ORDER BY bin_start, object_type
    """

    rows = run_query(client, query, PERIOD_START, PERIOD_END)

    data = []
    for row in rows:
        data.append({
            "bin_start": row.bin_start.isoformat() if row.bin_start else None,
            "object_type": row.object_type,
            "count": row.count,
        })

    print(f"Loaded {len(data)} timeline bins", file=sys.stderr)
    print(json.dumps(data))

except Exception as e:
    print(f"Error loading timeline for {args.org_subdomain}: {e}", file=sys.stderr)
    sys.exit(1)
