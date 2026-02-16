# Rhevia: Movement Intelligence Reports

Multi-tenant movement intelligence reporting platform built on [Observable Framework](https://observablehq.com/framework/). This repo generates dynamic reports that are promoted to Google Cloud Storage as immutable snapshots.

## Quick start

```bash
cp .env.example .env              # then fill in required values
npm install
pip install -r requirements.txt   # Python data loaders (BigQuery)
npm run dev                       # http://localhost:3000
```

> GCP authentication is only needed for promoting reports — see [Promoting reports](#promoting-reports).

## Project structure

```plaintext
.
├── src/
│   ├── [org_subdomain]/            # Parameterised route pages
│   │   ├── index.md                #   Executive Summary
│   │   ├── movement-report.md      #   Movement Report
│   │   └── closing-remarks.md      #   Closing Remarks
│   ├── components/
│   │   ├── charts.ts               # Activity timeline, speed profile, area chart
│   │   ├── deck-map.ts             # deck.gl + MapBox GL interactive map
│   │   ├── metric-cards.tsx         # KPI cards (donut, stats, direction)
│   │   └── direction-rose.tsx       # D3 polar compass rose
│   ├── data/
│   │   ├── mapbox-token.json.js    # Bridges MAPBOX_TOKEN env var to client
│   │   └── [org_subdomain]/
│   │       ├── summary.json.py     # KPI aggregates
│   │       ├── tracks.json.py      # Track/trajectory data
│   │       └── heatmap.json.py     # Spatial density grid
│   └── utils/
│       ├── org-meta.ts             # Org slug → display name mapping
│       └── format.ts               # Period formatting utilities
├── scripts/
│   ├── promote-report.sh           # Build + upload to GCS
│   ├── bundle-single-html.js       # Merge pages into standalone HTML
│   └── generate-pdf.js             # Playwright PDF renderer
├── .keys/                             # GCP service account key (gitignored)
│   └── sa-key.json
├── .github/workflows/
│   └── promote-report.yml          # CI promotion via workflow_dispatch
├── observablehq.config.js          # Framework config (env-driven routing)
├── package.json
├── requirements.txt                # Python deps (BigQuery, GCS, pandas)
└── .env.example                    # Environment variable template
```

## Report pages

Each report has three pages rendered from the `src/[org_subdomain]/` templates:

1. **Executive Summary** — Hero section with period label and KPI cards (total detections, zones active, peak hour, composition split).
2. **Movement Report** — Interactive dashboard with type filter pills, deck.gl/MapBox spatial map (hexagon density, track playback, detection scatter), activity timeline, speed profile, directional rose chart, zone statistics, and searchable raw data tables.
3. **Closing Remarks** — Summary of findings, methodology, data protection disclaimer, and contact information.

## Data loaders

Observable Framework invokes Python data loaders at build time. Each loader receives the org slug via `--org_subdomain` CLI arg and reads `PERIOD_START` / `PERIOD_END` from environment variables. Loaders output JSON to stdout.

| Loader | Output |
| --- | --- |
| `summary.json.py` | KPI aggregates: total detections, composition, avg/top speed, peak hour, zones, directional counts |
| `tracks.json.py` | Array of detection points grouped by track ID with coordinates, speed, heading, zone hits |
| `heatmap.json.py` | Spatial density grid cells with point counts, speed stats, first/last seen timestamps |

Currently using mock data for development. Production loaders query BigQuery (commented code in each file).

## Components

| Component | Description |
| --- | --- |
| `deck-map.ts` | deck.gl + MapBox GL map with HexagonLayer, TripsLayer, ScatterplotLayer. Includes layer toggle pills, hex sliders, time scrubber with speed multipliers (1x/10x/30x/60x), and map style selection |
| `charts.ts` | Observable Plot charts — activity timeline (bar/area toggle), speed profile (box plot + dot strip) |
| `metric-cards.tsx` | React KPI cards — donut chart, stat cards, directional breakdown grid |
| `direction-rose.tsx` | D3 polar rose chart with speed-gradient shading, hover tooltips, responsive to type filter |

## Promoting reports

The primary workflow is **develop, preview, promote**. Reports are developed locally with `npm run dev`, reviewed by the team, and when approved, promoted to GCS as immutable snapshots.

### Local promotion

GCP authentication is required for BigQuery (data loaders) and GCS (upload). Two options:

#### Option A — Service account key (recommended for automation)

1. Download a service account key JSON from the [GCP console](https://console.cloud.google.com/iam-admin/serviceaccounts) (Keys tab → Add Key → JSON)
2. Save it to `.keys/sa-key.json` (this directory is gitignored)
3. Set the path in `.env`:

```bash
GOOGLE_APPLICATION_CREDENTIALS=.keys/sa-key.json
```

This authenticates both `gsutil` and BigQuery in a single step. The promote script sources `.env` automatically.

#### Option B — Interactive CLI login

Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`brew install google-cloud-sdk`), then run **both** commands:

```bash
gcloud auth login                          # authenticates gsutil
gcloud auth application-default login      # authenticates BigQuery Python client (ADC)
```

Then promote:

```bash
# Build and upload standalone HTML
npm run promote -- pip "2026-01-19T00:00:00Z" "2026-01-20T00:00:00Z"

# With PDF generation
npm run promote -- pip "2026-01-19T00:00:00Z" "2026-01-20T00:00:00Z" --pdf

# Also upload full dist/ directory
npm run promote -- pip "2026-01-19T00:00:00Z" "2026-01-20T00:00:00Z" --full-dist

# All options
npm run promote -- pip "2026-01-19T00:00:00Z" "2026-01-20T00:00:00Z" --pdf --full-dist
```

### What the promote script does

1. Validates `MAPBOX_TOKEN` is set
2. Derives period slug from timestamps (e.g. `2026-01-19_to_2026-01-20`)
3. Clears Observable cache (`npm run clean`)
4. Builds the static site (`npm run build`)
5. Bundles all three pages into a single standalone HTML via `bundle-single-html.js`
6. Uploads `report-standalone.html` to GCS
7. (Optional `--full-dist`) Uploads full `dist/` directory to GCS
8. (Optional `--pdf`) Generates PDF with Playwright and uploads alongside HTML

### GCS path structure

```plaintext
gs://rhevia-data-reports/
└── {org_subdomain}/
    └── {start_date}_to_{end_date}/
        ├── report-standalone.html   # Always present — single self-contained file
        ├── report.pdf               # If --pdf
        └── dist/                    # If --full-dist
            ├── {org_subdomain}/
            │   ├── index.html
            │   ├── movement-report.html
            │   └── closing-remarks.html
            ├── _observablehq/
            ├── _npm/
            └── _file/data/
```

The standalone HTML bundles all three report pages, CSS, JS modules, and JSON data into a single file (~6 MB). Internet is needed only for Mapbox tile requests. Published reports are immutable — changing the template does not change already-promoted reports.

### GitHub Pages (preview)

The `deploy-pages.yml` workflow auto-deploys to GitHub Pages on every push to `main` (or via manual trigger). It builds with `BASE_PATH=/rhevia-platform-framework/` so asset paths resolve correctly on the project site.

Live preview: `https://streetwise-technology.github.io/rhevia-platform-framework/pip/`

> **Note:** GitHub Pages requires the Pages source to be set to **GitHub Actions** in repo settings (Settings → Pages → Source → GitHub Actions).

### CI promotion (GitHub Actions)

The `promote-report.yml` workflow is triggered manually from the Actions tab with inputs:

- `org_subdomain` — e.g. `pip`
- `period_start` — ISO 8601 timestamp
- `period_end` — ISO 8601 timestamp
- `generate_pdf` — boolean (default false)
- `upload_full_dist` — boolean (default false)

Required repository secrets: `GCP_SA_KEY` (raw JSON content of a GCP service account key), `MAPBOX_TOKEN`.

> In CI, `google-github-actions/auth@v2` takes the `GCP_SA_KEY` JSON content, writes it to a temp file, and sets `GOOGLE_APPLICATION_CREDENTIALS` to that path — so the promote script works identically in both environments.

## Environment variables

| Variable | Required | Where used | Description |
| --- | --- | --- | --- |
| `MAPBOX_TOKEN` | Yes | Data loader (`mapbox-token.json.js`) | MapBox access token for map visualisations |
| `PERIOD_START` | Yes (for build) | Python data loaders | ISO 8601 period start timestamp |
| `PERIOD_END` | Yes (for build) | Python data loaders | ISO 8601 period end timestamp |
| `ORG_SUBDOMAIN` | No (defaults to `pip`) | `observablehq.config.js` | Organisation slug for routing |
| `GOOGLE_APPLICATION_CREDENTIALS` | No (for promotion) | `gsutil`, BigQuery Python client | Path to GCP service account key JSON. Alternative to `gcloud auth login` |
| `BASE_PATH` | No | `observablehq.config.js` | URL base path for GitHub Pages (e.g. `/rhevia-platform-framework/`). Leave unset for local dev and GCS |

For local development, copy `.env.example` to `.env` and fill in values. In CI, secrets are configured in GitHub repo settings — `GCP_SA_KEY` (service account key JSON) and `MAPBOX_TOKEN`.

Note: `.env` variables are available to data loaders via `process.env` (Node.js) and `os.environ` (Python), but **not** to client-side pages. Use a data loader as a bridge (see `mapbox-token.json.js`).

## Adding a new organisation

1. Add the slug and display name to `ORG_NAMES` in `observablehq.config.js`
2. Add the slug and display name to `orgs` in `src/utils/org-meta.ts`
3. Ensure detection data exists in BigQuery for the org (or add mock data to loaders)
4. Build with `ORG_SUBDOMAIN=<slug> npm run build`

No changes to page templates or components are needed — the `[org_subdomain]` parameterised route handles all orgs.

## Command reference

| Command | Description |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Start local preview server |
| `npm run build` | Build static site to `./dist` |
| `npm run clean` | Clear the Observable data loader cache |
| `npm run promote -- <org> <start> <end> [--pdf] [--full-dist]` | Build, bundle standalone HTML, upload to GCS |
| `MAPBOX_TOKEN=pk.xxx node scripts/bundle-single-html.js --input-dir dist/<org> --output dist/report-standalone.html` | Merge pages into standalone HTML |
| `node scripts/generate-pdf.js --org <slug>` | Generate PDF from an existing `dist/` build |
| `npm run deploy` | Deploy to Observable cloud |
| `npm run observable` | Run Observable CLI commands |
