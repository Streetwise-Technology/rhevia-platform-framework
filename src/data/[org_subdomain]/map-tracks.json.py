# map-tracks.json.py — Fetch thinned track data for Deck.GL TripsLayer
#
# This is the MAP version — limited tracks, optional thinning for performance.
# Used exclusively by the TripsLayer in deck-map.ts via preprocessTrips().
# For full statistics data, see tracks.json.py instead.
#
# Observable Framework invokes this as:
#   python map-tracks.json.py --org_subdomain=pip

import argparse
import json
import os
import sys

from google.cloud import bigquery

from _bq_helpers import (
    get_bq_client,
    get_table_fqn,
    map_object_type,
    parse_zones,
    run_query,
)

# ── Configurable defaults ─────────────────────────────────────────
MAX_TRACKS = 500  # Maximum number of complete tracks to fetch
THIN_INTERVAL_MS = (
    100  # Time-based thinning (0=disabled, 100/250/500/1000/2000=sample interval ms)
)
MIN_DISTANCE_M = (
    1  # Distance-based jitter filter (0=disabled, 1,2/5/10=min metres between points)
)
# ──────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument("--org_subdomain", required=True)
args = parser.parse_args()

PERIOD_START = os.environ.get("PERIOD_START", "2026-01-19T00:00:00")
PERIOD_END = os.environ.get("PERIOD_END", "2026-01-19T23:59:59")

print(f"Loading map tracks for {args.org_subdomain}", file=sys.stderr)

try:
    client = get_bq_client()
    table = get_table_fqn(args.org_subdomain)

    # Thinning CTEs from API get_grouped_tracks_for_trips(), simplified for static build.
    query = f"""
    WITH
      -- Select tracks to include (capped at MAX_TRACKS)
      selected_tracks AS (
        SELECT track_identifier
        FROM {table}
        WHERE timestamp BETWEEN @period_start AND @period_end
        GROUP BY track_identifier
        ORDER BY MIN(timestamp)
        LIMIT {MAX_TRACKS}
      ),
      -- Get all points with track boundaries and previous point info
      raw_points AS (
        SELECT
          t.track_identifier,
          t.object_type,
          t.device_identifier,
          t.timestamp,
          SAFE_CAST(t.longitude AS FLOAT64) AS longitude,
          SAFE_CAST(t.latitude AS FLOAT64) AS latitude,
          SAFE_CAST(t.speed AS FLOAT64) AS speed,
          SAFE_CAST(t.heading_degrees AS FLOAT64) AS heading_degrees,
          t.zones_hit,
          FIRST_VALUE(t.timestamp) OVER (
            PARTITION BY t.track_identifier ORDER BY t.timestamp ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ) AS first_ts,
          LAST_VALUE(t.timestamp) OVER (
            PARTITION BY t.track_identifier ORDER BY t.timestamp ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ) AS last_ts,
          LAG(SAFE_CAST(t.longitude AS FLOAT64)) OVER (
            PARTITION BY t.track_identifier ORDER BY t.timestamp ASC
          ) AS prev_lon,
          LAG(SAFE_CAST(t.latitude AS FLOAT64)) OVER (
            PARTITION BY t.track_identifier ORDER BY t.timestamp ASC
          ) AS prev_lat
        FROM {table} t
        JOIN selected_tracks st ON t.track_identifier = st.track_identifier
        WHERE t.timestamp BETWEEN @period_start AND @period_end
      ),
      -- Enrich with distance from previous point and time-bucket rank
      points_enriched AS (
        SELECT
          *,
          IF(prev_lon IS NULL, 0,
            ST_DISTANCE(
              ST_GEOGPOINT(longitude, latitude),
              ST_GEOGPOINT(prev_lon, prev_lat)
            )
          ) AS distance_m,
          ROW_NUMBER() OVER (
            PARTITION BY track_identifier,
              CASE WHEN @thin_interval_ms = 0 THEN UNIX_MILLIS(timestamp)
                   ELSE CAST(FLOOR(TIMESTAMP_DIFF(timestamp, first_ts, MILLISECOND)
                        / @thin_interval_ms) AS INT64)
              END
            ORDER BY timestamp ASC
          ) AS bucket_rank
        FROM raw_points
      ),
      -- Apply thinning: keep first point per time bucket + distance filter + always keep last point
      thinned_points AS (
        SELECT *
        FROM points_enriched
        WHERE
          (bucket_rank = 1 AND (
            @min_distance_m = 0
            OR distance_m >= @min_distance_m
            OR prev_lon IS NULL
          ))
          OR timestamp = last_ts
      )
    SELECT
      track_identifier AS track_id,
      object_type AS raw_type,
      device_identifier AS device_id,
      longitude,
      latitude,
      timestamp,
      ROUND(speed * 2.23694, 1) AS speed_mph,
      heading_degrees AS heading,
      zones_hit AS raw_zones
    FROM thinned_points
    ORDER BY track_identifier, timestamp
    """

    extra_params = [
        bigquery.ScalarQueryParameter("thin_interval_ms", "INT64", THIN_INTERVAL_MS),
        bigquery.ScalarQueryParameter("min_distance_m", "INT64", MIN_DISTANCE_M),
    ]

    rows = run_query(client, query, PERIOD_START, PERIOD_END, extra_params=extra_params)

    data = []
    for row in rows:
        data.append(
            {
                "track_id": row.track_id,
                "object_type": map_object_type(row.raw_type),
                "device_id": row.device_id,
                "longitude": round(row.longitude, 5) if row.longitude else 0,
                "latitude": round(row.latitude, 5) if row.latitude else 0,
                "timestamp": row.timestamp.isoformat() if row.timestamp else None,
                "speed": float(row.speed_mph) if row.speed_mph else 0,
                "heading": round(row.heading, 1) if row.heading else 0,
                "zones_hit": parse_zones(row.raw_zones),
            }
        )

    print(
        f"Loaded {len(data)} map track points (max {MAX_TRACKS} tracks)",
        file=sys.stderr,
    )
    print(json.dumps(data))

except Exception as e:
    print(f"Error loading map tracks for {args.org_subdomain}: {e}", file=sys.stderr)
    sys.exit(1)
