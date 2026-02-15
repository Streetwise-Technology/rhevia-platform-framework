# direction-rose.json.py — 8-way direction bins with per-type track counts and speed
#
# Track-level aggregation for the Direction Rose visualization.
# Each track is assigned its dominant compass direction (most-frequent heading).
# count = distinct tracks; speed_sum = sum of per-track average speeds.
#
# Observable Framework invokes this as:
#   python direction-rose.json.py --org_subdomain=pip

import argparse
import json
import os
import sys

from _bq_helpers import (
    COMPASS_CASE,
    OBJECT_TYPE_CASE,
    get_bq_client,
    get_table_fqn,
    run_query,
)

parser = argparse.ArgumentParser()
parser.add_argument("--org_subdomain", required=True)
args = parser.parse_args()

PERIOD_START = os.environ.get("PERIOD_START", "2026-01-19T00:00:00")
PERIOD_END = os.environ.get("PERIOD_END", "2026-01-19T23:59:59")

print(f"Loading direction rose for {args.org_subdomain}", file=sys.stderr)

try:
    client = get_bq_client()
    table = get_table_fqn(args.org_subdomain)

    query = f"""
    WITH track_points AS (
      SELECT
        track_identifier,
        {OBJECT_TYPE_CASE} AS object_type,
        {COMPASS_CASE} AS compass,
        SAFE_CAST(speed AS FLOAT64) * 2.23694 AS speed_mph
      FROM {table}
      WHERE timestamp BETWEEN @period_start AND @period_end
        AND heading_degrees IS NOT NULL
    ),
    track_avg_speed AS (
      SELECT track_identifier, object_type, AVG(speed_mph) AS avg_speed
      FROM track_points
      GROUP BY track_identifier, object_type
    ),
    track_direction_counts AS (
      SELECT track_identifier, object_type, compass, COUNT(*) AS direction_count
      FROM track_points
      GROUP BY track_identifier, object_type, compass
    ),
    track_dominant AS (
      SELECT track_identifier, object_type,
        ARRAY_AGG(compass ORDER BY direction_count DESC LIMIT 1)[OFFSET(0)] AS direction
      FROM track_direction_counts
      GROUP BY track_identifier, object_type
    ),
    track_summary AS (
      SELECT td.track_identifier, td.object_type, td.direction, tas.avg_speed
      FROM track_dominant td
      JOIN track_avg_speed tas
        ON td.track_identifier = tas.track_identifier AND td.object_type = tas.object_type
    )
    SELECT direction, object_type,
      COUNT(*) AS count,
      ROUND(SUM(avg_speed), 1) AS speed_sum,
      ROUND(AVG(avg_speed), 1) AS avg_speed
    FROM track_summary
    GROUP BY direction, object_type
    """

    rows = run_query(client, query, PERIOD_START, PERIOD_END)

    data = []
    for row in rows:
        data.append({
            "direction": row.direction,
            "object_type": row.object_type,
            "count": row.count,
            "speed_sum": float(row.speed_sum or 0),
            "avg_speed": float(row.avg_speed or 0),
        })

    print(f"Loaded {len(data)} direction rose bins", file=sys.stderr)
    print(json.dumps(data))

except Exception as e:
    print(f"Error loading direction rose for {args.org_subdomain}: {e}", file=sys.stderr)
    sys.exit(1)
