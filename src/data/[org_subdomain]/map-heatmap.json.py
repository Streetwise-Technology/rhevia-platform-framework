# map-heatmap.json.py — Fetch aggregated grid cells for Deck.GL HexagonLayer
#
# This is the MAP version — lower precision, aggregated for Deck.GL performance.
# Used exclusively by the HexagonLayer/ScatterplotLayer in deck-map.ts.
# For full statistics data, see heatmap.json.py instead.
#
# Observable Framework invokes this as:
#   python map-heatmap.json.py --org_subdomain=pip

import argparse
import json
import os
import sys

from _bq_helpers import get_bq_client, get_table_fqn, map_object_type, run_query

# ── Configurable defaults ─────────────────────────────────────────
PRECISION = 5  # Decimal places for coordinate rounding (≈1m grid cells)
MIN_POINTS = 1  # Minimum distinct tracks per cell to include
# ──────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument("--org_subdomain", required=True)
args = parser.parse_args()

PERIOD_START = os.environ.get("PERIOD_START", "2026-01-19T00:00:00")
PERIOD_END = os.environ.get("PERIOD_END", "2026-01-19T23:59:59")

print(f"Loading map heatmap for {args.org_subdomain}", file=sys.stderr)

try:
    client = get_bq_client()
    table = get_table_fqn(args.org_subdomain)

    query = f"""
    SELECT
      ROUND(SAFE_CAST(longitude AS FLOAT64), {PRECISION}) AS lon,
      ROUND(SAFE_CAST(latitude AS FLOAT64), {PRECISION}) AS lat,
      object_type AS raw_type,
      device_identifier AS device_id,
      COUNT(DISTINCT track_identifier) AS point_count,
      ROUND(AVG(SAFE_CAST(speed AS FLOAT64)) * 2.23694, 1) AS avg_speed,
      ROUND(MAX(SAFE_CAST(speed AS FLOAT64)) * 2.23694, 1) AS max_speed,
      MIN(timestamp) AS first_seen,
      MAX(timestamp) AS last_seen
    FROM {table}
    WHERE timestamp BETWEEN @period_start AND @period_end
    GROUP BY lon, lat, raw_type, device_id
    HAVING COUNT(DISTINCT track_identifier) >= {MIN_POINTS}
    ORDER BY point_count DESC
    """

    rows = run_query(client, query, PERIOD_START, PERIOD_END)

    data = []
    for row in rows:
        data.append(
            {
                "lon": float(row.lon),
                "lat": float(row.lat),
                "object_type": map_object_type(row.raw_type),
                "device_id": row.device_id,
                "point_count": row.point_count,
                "avg_speed": float(row.avg_speed or 0),
                "max_speed": float(row.max_speed or 0),
                "first_seen": row.first_seen.isoformat() if row.first_seen else None,
                "last_seen": row.last_seen.isoformat() if row.last_seen else None,
            }
        )

    print(f"Loaded {len(data)} map heatmap cells", file=sys.stderr)
    print(json.dumps(data))

except Exception as e:
    print(f"Error loading map heatmap for {args.org_subdomain}: {e}", file=sys.stderr)
    sys.exit(1)
