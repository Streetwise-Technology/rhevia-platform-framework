"""zones.json.py — Fetch geographic zones and sub-zones as GeoJSON.

Queries geo_info_{org}.geographic_features (NOT the tracks dataset).
Outputs a GeoJSON FeatureCollection.  If the table doesn't exist,
outputs an empty FeatureCollection so the build doesn't fail.

Observable Framework invokes this as:
    python zones.json.py --org_subdomain=pip
"""

import argparse
import json
import os
import re
import sys

from _bq_helpers import get_bq_client

parser = argparse.ArgumentParser()
parser.add_argument("--org_subdomain", required=True)
args = parser.parse_args()

org = args.org_subdomain
if not re.match(r"^[a-z][a-z0-9_-]{0,62}$", org):
    print(f"Error: invalid org_subdomain '{org}'", file=sys.stderr)
    sys.exit(1)

print(f"Loading zones for {org}", file=sys.stderr)

EMPTY_FC = {"type": "FeatureCollection", "features": []}

try:
    client = get_bq_client()
    project = os.environ.get("BQ_PROJECT_ID", "studious-linker-467410-e9")
    dataset = f"geo_info_{org}"
    table_fqn = f"`{project}.{dataset}.geographic_features`"

    query = f"""
    SELECT
        feature_id,
        feature_name,
        feature_type,
        ST_ASGEOJSON(geometry) AS geometry_json,
        TO_JSON_STRING(metadata) AS metadata_json
    FROM {table_fqn}
    ORDER BY feature_id
    """

    rows = list(client.query(query).result())

    features = []
    for row in rows:
        geom = json.loads(row.geometry_json) if row.geometry_json else None
        if geom is None:
            continue
        metadata = json.loads(row.metadata_json) if row.metadata_json else {}
        features.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "feature_id": row.feature_id,
                    "feature_name": row.feature_name,
                    "feature_type": row.feature_type,
                    "metadata": metadata,
                },
            }
        )

    fc = {"type": "FeatureCollection", "features": features}
    print(f"Loaded {len(features)} zone features", file=sys.stderr)
    print(json.dumps(fc))

except Exception as e:
    error_str = str(e)
    if "404" in error_str or "Not found" in error_str:
        print(
            f"No zones table found for {org}, returning empty FeatureCollection",
            file=sys.stderr,
        )
        print(json.dumps(EMPTY_FC))
    else:
        print(f"Error loading zones for {org}: {e}", file=sys.stderr)
        sys.exit(1)
