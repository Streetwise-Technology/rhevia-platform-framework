# summary.json.py — Fetch summary KPIs for the given org
#
# Observable Framework invokes this as:
#   python summary.json.py --org_subdomain=pip

import argparse
import json
import os
import sys

# --- PRODUCTION -----------------------------------------------------------
# from google.cloud import bigquery
#
# client = bigquery.Client()
# query = """
#     SELECT
#         COUNT(*)                                          AS total_detections,
#         COUNTIF(object_type = 'pedestrian')               AS pedestrian_count,
#         COUNTIF(object_type = 'vehicle')                  AS vehicle_count,
#         ROUND(AVG(speed), 1)                              AS avg_speed,
#         ROUND(MAX(speed), 1)                              AS top_speed,
#         COUNT(*) / TIMESTAMP_DIFF(@period_end, @period_start, HOUR) AS flow_rate_per_hour,
#         COUNTIF(zone = 'freight_yard')                    AS freight_entries,
#         FORMAT_TIMESTAMP('%H:%M',
#           TIMESTAMP_TRUNC(
#             APPROX_TOP_COUNT(timestamp, 1)[OFFSET(0)].value,
#             HOUR))                                        AS peak_hour,
#         COUNT(DISTINCT zone)                              AS zones_active
#     FROM `project.dataset.detections`
#     WHERE org = @org
#       AND timestamp BETWEEN @period_start AND @period_end
# """
# --------------------------------------------------------------------------

parser = argparse.ArgumentParser()
parser.add_argument("--org_subdomain", required=True)
args = parser.parse_args()

PERIOD_START = os.environ.get("PERIOD_START", "2026-01-19T00:00:00")
PERIOD_END = os.environ.get("PERIOD_END", "2026-01-19T23:59:59")

print(f"Loading summary for {args.org_subdomain}", file=sys.stderr)

data = {
    "total_detections": 770,
    "pedestrian_count": 647,
    "vehicle_count": 123,
    "composition": {"pedestrian_pct": 84, "vehicle_pct": 16},
    "avg_speed": 3.0,
    "top_speed": 25.0,
    "flow_rate_per_hour": 770,
    "freight_entries": 663,
    "peak_hour": "06:30",
    "zones_active": 6,
    "directions": {
        "N": 84,
        "NE": 206,
        "E": 150,
        "SE": 50,
        "S": 314,
        "SW": 80,
        "W": 60,
        "NW": 26,
    },
    "period": {"start": PERIOD_START, "end": PERIOD_END},
    "org_subdomain": args.org_subdomain,
}

print(json.dumps(data))
