# Catalog development tools

All content tools are development-only. The app never downloads NHL or PWHL data at runtime. The canonical workflow and source caveats live in:

- [`docs/content-pipeline.md`](../docs/content-pipeline.md)
- [`docs/content-data-sources.md`](../docs/content-data-sources.md)
- [`docs/card-rating-system.md`](../docs/card-rating-system.md)
- [`docs/economy-balance.md`](../docs/economy-balance.md)

## Canonical generated-content workflow

```sh
# Manual network step; review the resulting snapshot before approval.
pnpm content:snapshot

# Deterministic local generation and validation.
pnpm catalog:generate
pnpm catalog:generate:check
pnpm catalog:validate

# Explicit network import for player artwork, then deterministic local QA.
pnpm assets:sync
pnpm assets:validate

# Project the same validated catalog into the additive Supabase migration.
pnpm catalog:sql:write
pnpm catalog:sql:check

# Full local quality loop.
pnpm qa:core
```

`import-official-content.ts` discovers the public HockeyTech feed configuration from the official PWHL Stats page. Any feed key is transient request configuration and must never be written to the snapshot, generated catalog, SQL, logs, fixtures, or docs. The importer is fail-closed and replaces its output atomically only after every official-source check succeeds.

`generate-content-catalog.ts` reads only the approved snapshot, stable-ID registry, audited rating overrides, and reviewed `data/content/position-evidence.json`. Secondary-position evidence must use an official HTTPS source, be reviewed on or after the snapshot, and be consumed by the launch selection; stale or unused evidence aborts generation. The generator writes `src/data/generated/gameCatalog.json`; the small TypeScript wrapper validates that JSON and exposes the application contract. Do not hand-edit the generated JSON or recreate a giant hand-maintained TypeScript array.

`sync-player-assets.ts` is the separate, manually triggered image import. It
writes optimized files under `public/assets/players` and replaces, via temporary
files, the full audit record `src/assets/generated/playerAssetManifest.json`
plus the browser-safe projection
`src/assets/generated/playerAssetRuntimeManifest.json`.
Validation requires both manifests to describe exactly the same runtime mapping;
only the audit record contains hashes and source provenance. The importer never
changes player IDs, CardVersions, ratings, prices, or progression. See
[`docs/asset-pipeline.md`](../docs/asset-pipeline.md) for the fallback contract
and audited Signature source mismatches.

## Legacy CSV review-candidate tool

`pnpm catalog:import` remains available for offline experiments with manually exported completed-season CSV data. It never updates the canonical snapshot or generated catalog. Its output is always `REQUIRES_MANUAL_REVIEW`.

```sh
pnpm catalog:import -- \
  --input ./local-imports/stats.csv \
  --seasons 2023-24,2024-25,2025-26 \
  --overrides ./local-imports/overrides.json \
  --output ./local-imports/catalog-candidate.json
```

Required columns are `player_id`, `name`, `league`, `season`, `role`, `position`, `team`, `nationality`, `handedness`, sample-size fields, skater box-score fields, and goalie box-score fields. Overrides must record the exact source value, replacement value, and a meaningful reason; stale values abort the whole candidate.

Never copy an offline candidate directly into production content. Reconcile it with official sources, the stable identity contract, roster status, rating bands, Starter rules, Event tradeoffs, and the database migration first.
