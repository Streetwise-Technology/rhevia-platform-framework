"""Shared BigQuery helpers for Rhevia data loaders.

Centralises connection, query execution, type mapping, zone parsing,
and SQL fragments used across all data loaders.
"""

import json
import os
import re
import sys
from datetime import datetime

from google.cloud import bigquery

# ── Constants ─────────────────────────────────────────────────────

# BigQuery dataset — hardcoded so devs can see/change it easily.
# The table name is the org_subdomain (e.g. "pip", "tfl").
BQ_DATASET = "object_tracks_test"

MS_TO_MPH = 2.23694

# 4-way cardinal direction CASE expression (90° bins).
# Returns one of: North, East, South, West.
CARDINAL_CASE = """
CASE
  WHEN SAFE_CAST(heading_degrees AS FLOAT64) >= 315
    OR SAFE_CAST(heading_degrees AS FLOAT64) < 45  THEN 'North'
  WHEN SAFE_CAST(heading_degrees AS FLOAT64) >= 45
   AND SAFE_CAST(heading_degrees AS FLOAT64) < 135 THEN 'East'
  WHEN SAFE_CAST(heading_degrees AS FLOAT64) >= 135
   AND SAFE_CAST(heading_degrees AS FLOAT64) < 225 THEN 'South'
  ELSE 'West'
END
""".strip()

# SQL CASE to map BQ object_type to display type inline in queries.
OBJECT_TYPE_CASE = """
CASE WHEN object_type = 'small' THEN 'pedestrian' ELSE 'vehicle' END
""".strip()

OBJECT_TYPE_MAP = {"small": "pedestrian", "large": "vehicle"}

# 8-way compass CASE expression for heading_degrees (45° bins).
# Returns one of: N, NE, E, SE, S, SW, W, NW.
COMPASS_CASE = """
CASE
  WHEN SAFE_CAST(heading_degrees AS FLOAT64) >= 337.5
    OR SAFE_CAST(heading_degrees AS FLOAT64) < 22.5  THEN 'N'
  WHEN SAFE_CAST(heading_degrees AS FLOAT64) >= 22.5
   AND SAFE_CAST(heading_degrees AS FLOAT64) < 67.5  THEN 'NE'
  WHEN SAFE_CAST(heading_degrees AS FLOAT64) >= 67.5
   AND SAFE_CAST(heading_degrees AS FLOAT64) < 112.5 THEN 'E'
  WHEN SAFE_CAST(heading_degrees AS FLOAT64) >= 112.5
   AND SAFE_CAST(heading_degrees AS FLOAT64) < 157.5 THEN 'SE'
  WHEN SAFE_CAST(heading_degrees AS FLOAT64) >= 157.5
   AND SAFE_CAST(heading_degrees AS FLOAT64) < 202.5 THEN 'S'
  WHEN SAFE_CAST(heading_degrees AS FLOAT64) >= 202.5
   AND SAFE_CAST(heading_degrees AS FLOAT64) < 247.5 THEN 'SW'
  WHEN SAFE_CAST(heading_degrees AS FLOAT64) >= 247.5
   AND SAFE_CAST(heading_degrees AS FLOAT64) < 292.5 THEN 'W'
  WHEN SAFE_CAST(heading_degrees AS FLOAT64) >= 292.5
   AND SAFE_CAST(heading_degrees AS FLOAT64) < 337.5 THEN 'NW'
END
""".strip()


# ── Functions ─────────────────────────────────────────────────────


def get_bq_client():
    """Return an authenticated BigQuery client using Application Default Credentials."""
    project = os.environ.get("BQ_PROJECT_ID", "studious-linker-467410-e9")
    return bigquery.Client(project=project)


def get_table_fqn(org):
    """Validate *org* and return a backtick-quoted fully-qualified table name."""
    if not re.match(r"^[a-z][a-z0-9_-]{0,62}$", org):
        print(f"Error: invalid org_subdomain '{org}'", file=sys.stderr)
        sys.exit(1)
    project = os.environ.get("BQ_PROJECT_ID", "studious-linker-467410-e9")
    return f"`{project}.{BQ_DATASET}.{org}`"


def run_query(client, sql, period_start, period_end, extra_params=None):
    """Execute *sql* with period parameters and return the query result iterator.

    Parameters
    ----------
    extra_params : list[bigquery.ScalarQueryParameter] | None
        Additional query parameters (e.g. thinning thresholds).
    """
    params = [
        bigquery.ScalarQueryParameter("period_start", "TIMESTAMP", period_start),
        bigquery.ScalarQueryParameter("period_end", "TIMESTAMP", period_end),
    ]
    if extra_params:
        params.extend(extra_params)

    job_config = bigquery.QueryJobConfig(query_parameters=params)
    return client.query(sql, job_config=job_config).result()


def map_object_type(raw):
    """Map BQ object_type ('small'/'large') to display type ('pedestrian'/'vehicle')."""
    return OBJECT_TYPE_MAP.get(raw, raw)


def parse_zones(raw):
    """Parse the zones_hit column — handles JSON array strings and bare strings."""
    if raw is None:
        return []
    raw = str(raw).strip()
    if raw.startswith("["):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return [raw]
    return [raw] if raw else []


def period_hours(period_start, period_end):
    """Calculate the number of hours between two ISO-8601 timestamp strings."""
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S"):
        try:
            s = datetime.strptime(period_start, fmt)
            e = datetime.strptime(period_end, fmt)
            return max((e - s).total_seconds() / 3600, 1)
        except ValueError:
            continue
    return 24  # fallback
