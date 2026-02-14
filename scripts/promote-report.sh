#!/usr/bin/env bash
set -euo pipefail

# promote-report.sh — Build a report and upload to GCS as an immutable snapshot.
#
# Usage:
#   ./scripts/promote-report.sh <ORG_SUBDOMAIN> <PERIOD_START> <PERIOD_END> [--pdf]
#
# Examples:
#   ./scripts/promote-report.sh pip "2026-01-19T00:00:00Z" "2026-01-20T00:00:00Z"
#   ./scripts/promote-report.sh pip "2026-01-19T00:00:00Z" "2026-01-20T00:00:00Z" --pdf

GCS_BUCKET="gs://rhevia-movement-intelligence-reports"

# --- Parse arguments --------------------------------------------------------

GENERATE_PDF=false

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <ORG_SUBDOMAIN> <PERIOD_START> <PERIOD_END> [--pdf]" >&2
  exit 1
fi

ORG_SUBDOMAIN="$1"
PERIOD_START="$2"
PERIOD_END="$3"

if [[ "${4:-}" == "--pdf" ]]; then
  GENERATE_PDF=true
fi

# --- Validate environment ---------------------------------------------------

if [[ -z "${MAPBOX_TOKEN:-}" ]]; then
  echo "Error: MAPBOX_TOKEN environment variable is not set." >&2
  exit 1
fi

# --- Derive period slug -----------------------------------------------------
# Extract date portion from ISO timestamps using bash parameter expansion.
# This is cross-platform (works on both macOS and Linux).
# "2026-01-19T00:00:00Z" → "2026-01-19"

START_DATE="${PERIOD_START%%T*}"
END_DATE="${PERIOD_END%%T*}"
PERIOD="${START_DATE}_to_${END_DATE}"
DEST="${GCS_BUCKET}/${ORG_SUBDOMAIN}/${PERIOD}"

echo "=== Promote Report ==="
echo "  Org:    ${ORG_SUBDOMAIN}"
echo "  Period: ${PERIOD_START} → ${PERIOD_END}"
echo "  Slug:   ${PERIOD}"
echo "  Dest:   ${DEST}/"
echo ""

# --- Export env vars for data loaders ---------------------------------------

export ORG_SUBDOMAIN PERIOD_START PERIOD_END MAPBOX_TOKEN

# --- Clean cache and build --------------------------------------------------

echo "Cleaning Observable cache..."
npm run clean

echo "Building report..."
npm run build

# --- Upload to GCS ----------------------------------------------------------

echo "Uploading to ${DEST}/..."
gsutil -m rsync -r dist/ "${DEST}/"

# --- Optional PDF generation ------------------------------------------------

if [[ "$GENERATE_PDF" == "true" ]]; then
  echo "Generating PDF..."
  npx playwright install chromium
  node scripts/generate-pdf.js --org "${ORG_SUBDOMAIN}"
  gsutil cp "dist/${ORG_SUBDOMAIN}/report.pdf" "${DEST}/report.pdf"
fi

echo ""
echo "Done → ${DEST}/"
