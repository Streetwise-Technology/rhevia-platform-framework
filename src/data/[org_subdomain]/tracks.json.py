# tracks.json.py — Fetch track/trajectory data for the given org
#
# Observable Framework invokes this as:
#   python tracks.json.py --org_subdomain=pip

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
#         track_id,
#         object_type,
#         device_id,
#         longitude,
#         latitude,
#         timestamp,
#         speed,
#         heading,
#         zones_hit
#     FROM `project.dataset.tracks`
#     WHERE org = @org
#       AND timestamp BETWEEN @period_start AND @period_end
#     ORDER BY track_id, timestamp
# """
# --------------------------------------------------------------------------

parser = argparse.ArgumentParser()
parser.add_argument("--org_subdomain", required=True)
args = parser.parse_args()

PERIOD_START = os.environ.get("PERIOD_START", "2026-01-19T00:00:00")
PERIOD_END = os.environ.get("PERIOD_END", "2026-01-19T23:59:59")

print(f"Loading tracks for {args.org_subdomain}", file=sys.stderr)

random.seed(42)

# Portsmouth International Port
CENTER_LAT = 50.8030
CENTER_LON = -1.0930
SPREAD_LAT = 0.003
SPREAD_LON = 0.005
NUM_TRACKS = 50

ZONES = [
    "two_road",
    "bay_bottom_entry_exit",
    "main_concourse",
    "parking_east",
    "freight_yard",
    "dock_access",
]

base_date = datetime.fromisoformat(PERIOD_START).replace(hour=6, minute=0, second=0)

data = []
for t in range(NUM_TRACKS):
    num_points = random.randint(5, 15)
    is_pedestrian = random.random() < 0.80
    object_type = "pedestrian" if is_pedestrian else "vehicle"
    track_id = f"trk-{t:04d}"
    device_id = f"dev-{random.randint(0, 199):04d}"

    # Base heading for this track (degrees, 0=N, clockwise)
    base_heading = random.uniform(0, 360)

    # Speed range for the track
    if is_pedestrian:
        base_speed = random.uniform(1.0, 5.0)
    else:
        base_speed = random.uniform(10.0, 30.0)

    # Starting position (Gaussian around center)
    lat = random.gauss(CENTER_LAT, SPREAD_LAT / 2)
    lon = random.gauss(CENTER_LON, SPREAD_LON / 2)

    # Random zones hit for this track (1-3 zones)
    zones_hit = random.sample(ZONES, k=random.randint(1, 3))

    # Starting time offset within the hour
    track_start = base_date + timedelta(minutes=random.uniform(0, 55))

    for p in range(num_points):
        # Heading jitter ±20°
        heading = (base_heading + random.uniform(-20, 20)) % 360
        speed = round(base_speed + random.uniform(-0.5, 0.5), 1)
        speed = max(0.1, speed)

        timestamp = track_start + timedelta(seconds=p * random.uniform(3, 7))

        data.append(
            {
                "track_id": track_id,
                "object_type": object_type,
                "device_id": device_id,
                "longitude": round(lon, 5),
                "latitude": round(lat, 5),
                "timestamp": timestamp.isoformat(),
                "speed": speed,
                "heading": round(heading, 1),
                "zones_hit": zones_hit,
            }
        )

        # Advance position based on heading and speed
        # Rough conversion: 1 degree lat ≈ 111km, 1 degree lon ≈ 70km at this latitude
        step_km = speed * 5 / 3600  # distance in km over ~5 seconds
        heading_rad = math.radians(heading)
        lat += (step_km / 111.0) * math.cos(heading_rad)
        lon += (step_km / 70.0) * math.sin(heading_rad)

print(f"Generated {len(data)} track points across {NUM_TRACKS} tracks", file=sys.stderr)
print(json.dumps(data))
