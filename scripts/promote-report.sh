#!/usr/bin/env bash
set -euo pipefail

# Load .env if present (CI injects env vars directly)
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

# promote-report.sh — Build a report and upload to GCS as an immutable snapshot.
#
# Usage:
#   ./scripts/promote-report.sh <ORG_SUBDOMAIN> <PERIOD_START> <PERIOD_END> [--pdf] [--full-dist]
#
# Examples:
#   ./scripts/promote-report.sh pip "2026-01-19T00:00:00Z" "2026-01-20T00:00:00Z"
#   ./scripts/promote-report.sh pip "2026-01-19T00:00:00Z" "2026-01-20T00:00:00Z" --pdf
#   ./scripts/promote-report.sh pip "2026-01-19T00:00:00Z" "2026-01-20T00:00:00Z" --full-dist

GCS_BUCKET="gs://rhevia-data-reports"

# --- Parse arguments --------------------------------------------------------

GENERATE_PDF=false
UPLOAD_FULL_DIST=false

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <ORG_SUBDOMAIN> <PERIOD_START> <PERIOD_END> [--pdf] [--full-dist]" >&2
  exit 1
fi

ORG_SUBDOMAIN="$1"
PERIOD_START="$2"
PERIOD_END="$3"
shift 3

for arg in "$@"; do
  case "$arg" in
    --pdf) GENERATE_PDF=true ;;
    --full-dist) UPLOAD_FULL_DIST=true ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

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

# --- Bundle standalone HTML --------------------------------------------------

echo "Bundling standalone HTML..."
MAPBOX_TOKEN="${MAPBOX_TOKEN}" node scripts/bundle-single-html.js \
  --input-dir "dist/${ORG_SUBDOMAIN}" \
  --output "dist/report-standalone.html"

# --- Upload to GCS ----------------------------------------------------------

echo "Uploading to ${DEST}/..."
gsutil cp dist/report-standalone.html "${DEST}/report-standalone.html"

# --- Optional full dist upload ----------------------------------------------

if [[ "$UPLOAD_FULL_DIST" == "true" ]]; then
  echo "Uploading full dist/ to ${DEST}/dist/..."
  gsutil -m rsync -r "dist/" "${DEST}/dist/"
fi

# --- Optional PDF generation ------------------------------------------------

if [[ "$GENERATE_PDF" == "true" ]]; then
  echo "Generating PDF..."
  npx playwright install chromium
  node scripts/generate-pdf.js --org "${ORG_SUBDOMAIN}"
  gsutil cp "dist/${ORG_SUBDOMAIN}/report.pdf" "${DEST}/report.pdf"
fi

echo ""
echo "Done → ${DEST}/"
