# summary.json.py — Fetch summary KPIs for the given org from BigQuery
#
# Observable Framework invokes this as:
#   python summary.json.py --org_subdomain=pip

import argparse
import json
import os
import sys

from _bq_helpers import (
    CARDINAL_CASE,
    COMPASS_CASE,
    OBJECT_TYPE_CASE,
    get_bq_client,
    get_table_fqn,
    parse_zones,
    period_hours,
    run_query,
)

parser = argparse.ArgumentParser()
parser.add_argument("--org_subdomain", required=True)
args = parser.parse_args()

PERIOD_START = os.environ.get("PERIOD_START", "2026-01-19T00:00:00")
PERIOD_END = os.environ.get("PERIOD_END", "2026-01-19T23:59:59")

print(f"Loading summary for {args.org_subdomain}", file=sys.stderr)

try:
    client = get_bq_client()
    table = get_table_fqn(args.org_subdomain)

    # ── Query 1: Core counts & speed (matches API get_totals) ────
    q1 = f"""
    SELECT
      COUNT(DISTINCT track_identifier) AS total_detections,
      COUNT(DISTINCT CASE WHEN object_type = 'small' THEN track_identifier END) AS pedestrian_count,
      COUNT(DISTINCT CASE WHEN object_type = 'large' THEN track_identifier END) AS vehicle_count,
      ROUND(AVG(SAFE_CAST(speed AS FLOAT64)) * 2.23694, 1) AS avg_speed_mph,
      ROUND(MAX(SAFE_CAST(speed AS FLOAT64)) * 2.23694, 1) AS top_speed_mph,
      ROUND(AVG(CASE WHEN object_type = 'small' THEN SAFE_CAST(speed AS FLOAT64) END) * 2.23694, 1) AS ped_avg_speed,
      ROUND(MAX(CASE WHEN object_type = 'small' THEN SAFE_CAST(speed AS FLOAT64) END) * 2.23694, 1) AS ped_top_speed,
      ROUND(AVG(CASE WHEN object_type = 'large' THEN SAFE_CAST(speed AS FLOAT64) END) * 2.23694, 1) AS veh_avg_speed,
      ROUND(MAX(CASE WHEN object_type = 'large' THEN SAFE_CAST(speed AS FLOAT64) END) * 2.23694, 1) AS veh_top_speed
    FROM {table}
    WHERE timestamp BETWEEN @period_start AND @period_end
    """
    row1 = next(iter(run_query(client, q1, PERIOD_START, PERIOD_END)))
    total = row1.total_detections or 0
    ped = row1.pedestrian_count or 0
    veh = row1.vehicle_count or 0

    # ── Query 2: Peak hour (matches API get_hourly pattern) ──────
    q2 = f"""
    SELECT
      EXTRACT(HOUR FROM timestamp) AS hour,
      COUNT(DISTINCT track_identifier) AS cnt
    FROM {table}
    WHERE timestamp BETWEEN @period_start AND @period_end
    GROUP BY hour
    ORDER BY cnt DESC
    LIMIT 1
    """
    peak_row = next(iter(run_query(client, q2, PERIOD_START, PERIOD_END)), None)
    peak_hour = f"{peak_row.hour:02d}:00" if peak_row else "00:00"

    # ── Query 3: Direction counts (dominant direction CTE from API get_by_direction) ──
    q3 = f"""
    WITH track_directions AS (
      SELECT
        track_identifier,
        {COMPASS_CASE} AS compass,
        COUNT(*) AS direction_count
      FROM {table}
      WHERE timestamp BETWEEN @period_start AND @period_end
        AND heading_degrees IS NOT NULL
      GROUP BY track_identifier, compass
    ),
    track_dominant AS (
      SELECT
        track_identifier,
        ARRAY_AGG(compass ORDER BY direction_count DESC LIMIT 1)[OFFSET(0)] AS compass
      FROM track_directions
      GROUP BY track_identifier
    )
    SELECT compass, COUNT(*) AS cnt
    FROM track_dominant
    GROUP BY compass
    """
    directions = {d: 0 for d in ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]}
    for row in run_query(client, q3, PERIOD_START, PERIOD_END):
        if row.compass in directions:
            directions[row.compass] = row.cnt

    # ── Query 4: Zone stats (Python-side parse) ──────────────────
    q4 = f"""
    SELECT track_identifier, zones_hit
    FROM {table}
    WHERE timestamp BETWEEN @period_start AND @period_end
      AND zones_hit IS NOT NULL AND TRIM(zones_hit) != ''
    """
    all_zones = set()
    freight_tracks = set()
    track_zones_seen = {}  # deduplicate zones per track

    for row in run_query(client, q4, PERIOD_START, PERIOD_END):
        tid = row.track_identifier
        zones = parse_zones(row.zones_hit)
        if tid not in track_zones_seen:
            track_zones_seen[tid] = set()
        track_zones_seen[tid].update(zones)

    for tid, zones in track_zones_seen.items():
        all_zones.update(zones)
        if "freight_yard" in zones:
            freight_tracks.add(tid)

    # ── Query 5: 4-way cardinal direction counts per type ────────
    q5 = f"""
    WITH track_directions AS (
      SELECT track_identifier, object_type,
        {CARDINAL_CASE} AS cardinal,
        COUNT(*) AS direction_count
      FROM {table}
      WHERE timestamp BETWEEN @period_start AND @period_end
        AND heading_degrees IS NOT NULL
      GROUP BY track_identifier, object_type, cardinal
    ),
    track_dominant AS (
      SELECT track_identifier,
        {OBJECT_TYPE_CASE} AS object_type,
        ARRAY_AGG(cardinal ORDER BY direction_count DESC LIMIT 1)[OFFSET(0)] AS cardinal
      FROM track_directions
      GROUP BY track_identifier, object_type
    )
    SELECT object_type, cardinal, COUNT(*) AS cnt
    FROM track_dominant
    GROUP BY object_type, cardinal
    """
    dirs_4way = {
        "all": {"North": 0, "South": 0, "East": 0, "West": 0},
        "pedestrian": {"North": 0, "South": 0, "East": 0, "West": 0},
        "vehicle": {"North": 0, "South": 0, "East": 0, "West": 0},
    }
    for row in run_query(client, q5, PERIOD_START, PERIOD_END):
        ot = row.object_type
        card = row.cardinal
        if ot in dirs_4way and card in dirs_4way[ot]:
            dirs_4way[ot][card] = row.cnt
            dirs_4way["all"][card] += row.cnt

    # ── Assemble output ──────────────────────────────────────────
    hours = period_hours(PERIOD_START, PERIOD_END)

    data = {
        "total_detections": total,
        "pedestrian_count": ped,
        "vehicle_count": veh,
        "composition": {
            "pedestrian_pct": round(ped / total * 100) if total else 0,
            "vehicle_pct": round(veh / total * 100) if total else 0,
        },
        "avg_speed": float(row1.avg_speed_mph or 0),
        "top_speed": float(row1.top_speed_mph or 0),
        "ped_avg_speed": float(row1.ped_avg_speed or 0),
        "ped_top_speed": float(row1.ped_top_speed or 0),
        "veh_avg_speed": float(row1.veh_avg_speed or 0),
        "veh_top_speed": float(row1.veh_top_speed or 0),
        "flow_rate_per_hour": round(total / hours),
        "freight_entries": len(freight_tracks),
        "peak_hour": peak_hour,
        "zones_active": len(all_zones),
        "directions": directions,
        "directions_4way": dirs_4way,
        "period": {"start": PERIOD_START, "end": PERIOD_END},
        "org_subdomain": args.org_subdomain,
    }

    print(f"Summary: {total} detections ({ped} ped, {veh} veh)", file=sys.stderr)
    print(json.dumps(data))

except Exception as e:
    print(f"Error loading summary for {args.org_subdomain}: {e}", file=sys.stderr)
    sys.exit(1)
