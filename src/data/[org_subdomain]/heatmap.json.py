# heatmap.json.py — Fetch heatmap grid cells for the given org
#
# Observable Framework invokes this as:
#   python heatmap.json.py --org_subdomain=pip

import argparse
import json
import math
import os
import random
import sys
from datetime import datetime, timedelta

# --- PRODUCTION -----------------------------------------------------------
# from google.cloud import bigquery
#
# client = bigquery.Client()
# query = """
#     SELECT
#         ROUND(longitude, 4)  AS lon,
#         ROUND(latitude, 4)   AS lat,
#         object_type,
#         device_id,
#         COUNT(*)             AS point_count,
#         ROUND(AVG(speed), 1) AS avg_speed,
#         ROUND(MAX(speed), 1) AS max_speed,
#         MIN(timestamp)       AS first_seen,
#         MAX(timestamp)       AS last_seen
#     FROM `project.dataset.detections`
#     WHERE org = @org
#       AND timestamp BETWEEN @period_start AND @period_end
#     GROUP BY lon, lat, object_type, device_id
# """
# --------------------------------------------------------------------------

parser = argparse.ArgumentParser()
parser.add_argument("--org_subdomain", required=True)
args = parser.parse_args()

PERIOD_START = os.environ.get("PERIOD_START", "2026-01-19T00:00:00")
PERIOD_END = os.environ.get("PERIOD_END", "2026-01-19T23:59:59")

print(f"Loading heatmap for {args.org_subdomain}", file=sys.stderr)

random.seed(42)

# Portsmouth International Port
CENTER_LAT = 50.8030
CENTER_LON = -1.0930
SPREAD_LAT = 0.003
SPREAD_LON = 0.005
NUM_CELLS = 150

# Parse date from env for timestamps
base_date = datetime.fromisoformat(PERIOD_START).replace(hour=6, minute=0, second=0)

data = []
for i in range(NUM_CELLS):
    # Gaussian clustering toward center
    lat = random.gauss(CENTER_LAT, SPREAD_LAT / 2)
    lon = random.gauss(CENTER_LON, SPREAD_LON / 2)

    # Clamp to bounding box
    lat = max(CENTER_LAT - SPREAD_LAT, min(CENTER_LAT + SPREAD_LAT, lat))
    lon = max(CENTER_LON - SPREAD_LON, min(CENTER_LON + SPREAD_LON, lon))

    # Distance from center (0..1) for weighting point_count
    dist = math.sqrt(
        ((lat - CENTER_LAT) / SPREAD_LAT) ** 2
        + ((lon - CENTER_LON) / SPREAD_LON) ** 2
    )
    weight = max(0.05, 1.0 - dist)

    is_pedestrian = random.random() < 0.80
    object_type = "pedestrian" if is_pedestrian else "vehicle"

    point_count = max(1, int(80 * weight * random.uniform(0.3, 1.0)))

    if is_pedestrian:
        avg_speed = round(random.uniform(1.0, 5.0), 1)
    else:
        avg_speed = round(random.uniform(10.0, 30.0), 1)
    max_speed = round(avg_speed + random.uniform(0.5, 5.0), 1)

    first_seen = base_date + timedelta(minutes=random.uniform(0, 50))
    last_seen = first_seen + timedelta(minutes=random.uniform(1, 10))

    data.append(
        {
            "lon": round(lon, 5),
            "lat": round(lat, 5),
            "object_type": object_type,
            "device_id": f"dev-{i:04d}",
            "point_count": point_count,
            "avg_speed": avg_speed,
            "max_speed": max_speed,
            "first_seen": first_seen.isoformat(),
            "last_seen": last_seen.isoformat(),
        }
    )

print(f"Generated {len(data)} heatmap cells", file=sys.stderr)
print(json.dumps(data))
