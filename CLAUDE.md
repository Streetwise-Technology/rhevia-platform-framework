# Rhevia Platform Framework

Observable Framework app that generates multi-tenant movement intelligence reports. Reports are built as static HTML, promoted to GCS as immutable snapshots, and served via Cloud CDN.

## Architecture

- **Parameterised routes**: `src/[org_subdomain]/` for pages, `src/data/[org_subdomain]/` for data loaders
- **Config**: `observablehq.config.js` reads `ORG_SUBDOMAIN` from `process.env` at build time to generate `pages` and `dynamicPaths`
- **Org display names**: `src/utils/org-meta.ts` maps slug to name; config has an inline duplicate map for build-time use (config is `.js`, can't import `.ts`)
- **Data loaders**: Python scripts invoked by Framework at build time. Receive org via `--org_subdomain` CLI arg, read `PERIOD_START`/`PERIOD_END` from env. Output JSON to stdout
- **Components**: TypeScript (`.ts`, `.tsx`) in `src/components/`. Import in pages using `.js` extension (Observable Framework convention)

## Key constraints

- `FileAttachment()` paths are **statically analysed at build time**. You must inline `observable.params.*` directly in the path — intermediate variables break the build
- `dynamicPaths` in config must list every parameterised route explicitly — they are not auto-discovered
- `.env` variables are available to data loaders (`process.env` / `os.environ`), **not** to client-side pages. Use a data loader as a bridge (see `src/data/mapbox-token.json.js`)
- The `dashboard` theme hides the sidebar. Override with `sidebar: true` in config

## Commands

```bash
npm run dev                          # Local preview server
npm run build                        # Build static site → dist/
npm run clean                        # Clear Observable cache
npm run promote -- <org> <start> <end> [--pdf]  # Build + upload to GCS
node scripts/generate-pdf.js --org <slug>        # Generate PDF from existing dist/
```

## Environment variables

- `MAPBOX_TOKEN` (required) — MapBox access token
- `PERIOD_START`, `PERIOD_END` (required for build) — ISO 8601 timestamps
- `ORG_SUBDOMAIN` (optional, defaults to `pip`) — determines which org to build

## Adding a new org

1. Add slug + display name to `ORG_NAMES` in `observablehq.config.js`
2. Add slug + display name to `orgs` in `src/utils/org-meta.ts`
3. Ensure BigQuery data exists for the org (or add mock data to loaders)

## Promotion pipeline

Local promotion requires the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud auth login` to authenticate, which provides `gsutil`).

Reports are promoted via `scripts/promote-report.sh` (locally or via GitHub Actions `promote-report.yml` workflow_dispatch). Each promoted report is a self-contained snapshot uploaded to `gs://rhevia-data-reports/{org}/{period}/`. GCS is the source of truth — no Firestore.
