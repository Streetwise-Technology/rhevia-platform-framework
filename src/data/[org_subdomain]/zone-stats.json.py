# zone-stats.json.py — Per-zone, per-type detection counts and speed aggregates
#
# zones_hit is a JSON string column (array or bare string).
# Uses JSON_VALUE_ARRAY + UNNEST for server-side expansion.
#
# Observable Framework invokes this as:
#   python zone-stats.json.py --org_subdomain=pip

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

print(f"Loading zone stats for {args.org_subdomain}", file=sys.stderr)

try:
    client = get_bq_client()
    table = get_table_fqn(args.org_subdomain)

    query = f"""
    WITH zones_expanded AS (
      SELECT
        TRIM(zone) AS zone,
        {OBJECT_TYPE_CASE} AS object_type,
        SAFE_CAST(speed AS FLOAT64) * 2.23694 AS speed_mph
      FROM {table},
        UNNEST(
          CASE WHEN STARTS_WITH(TRIM(zones_hit), '[') THEN JSON_VALUE_ARRAY(zones_hit)
               ELSE [zones_hit]
          END
        ) AS zone
      WHERE timestamp BETWEEN @period_start AND @period_end
        AND zones_hit IS NOT NULL AND TRIM(zones_hit) != ''
    )
    SELECT zone, object_type,
      COUNT(*) AS detections,
      ROUND(AVG(speed_mph), 1) AS avg_speed,
      ROUND(SUM(speed_mph), 1) AS speed_sum
    FROM zones_expanded
    WHERE zone IS NOT NULL AND TRIM(zone) != ''
    GROUP BY zone, object_type
    ORDER BY detections DESC
    """

    rows = run_query(client, query, PERIOD_START, PERIOD_END)

    data = []
    for row in rows:
        data.append({
            "zone": row.zone,
            "object_type": row.object_type,
            "detections": row.detections,
            "avg_speed": float(row.avg_speed or 0),
            "speed_sum": float(row.speed_sum or 0),
        })

    print(f"Loaded {len(data)} zone stat rows", file=sys.stderr)
    print(json.dumps(data))

except Exception as e:
    print(f"Error loading zone stats for {args.org_subdomain}: {e}", file=sys.stderr)
    sys.exit(1)
