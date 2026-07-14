# Card asset pipeline

Card artwork is resolved from stable player and CardVersion identity. React
components never contain player filenames or public asset paths.

## Runtime structure

Canonical runtime files live under `public/assets` so Vite copies them into
development and production builds without dynamic imports:

```text
public/assets/
  cards/
    neutral-card.svg
  players/
    nhl/
      connor-mcdavid/
        base.webp
        signature.webp
    pwhl/
      marie-philip-poulin/
        base.webp
        signature.webp
```

The generated manifests have deliberately separate responsibilities:

- `src/assets/generated/playerAssetManifest.json` is the development-only audit
  record. It contains the served payload hash, provenance, and (for provided
  Signature art) the audited source hash.
- `src/assets/generated/playerAssetRuntimeManifest.json` is the exact minimal
  projection imported by the app. It contains only player/variant identity,
  public path, presentation, media type, and intrinsic dimensions; source URLs
  and hashes are never shipped in the browser bundle.

`src/domain/cards/assets.ts` owns the deterministic projection, semantic
CardVersion references, and runtime resolver. Validation fails if the checked-in
runtime projection differs from the full audit manifest.

Resolution order is deterministic:

1. dedicated variant (`base`, optional `starter`, matching `signature`, or a
   future event/reward variant);
2. the same player's Base headshot;
3. `neutral-card.svg`.

Starter cards therefore share the Base URL without duplicating a file. Reward
and non-Signature Event cards do the same until dedicated art is registered.
The `<img>` element has intrinsic dimensions, native lazy loading, asynchronous
decoding, and a one-shot runtime error fallback.

## Development commands

The app performs no runtime image scraping or external player-image requests.
Asset ingestion is a manual development action:

```sh
pnpm assets:sync       # download reviewed sources and rebuild WebP + both manifests
pnpm assets:validate   # audit/runtime parity, hashes, paths, duplicates, orphans, fallbacks
```

`assets:sync` uses the NHL mug URL derived from the approved roster snapshot.
If several current-season URLs return the NHL's shared placeholder payload, it
uses the exact player's official game log to resolve the prior-season team mug
instead of storing the duplicate placeholder.
For PWHL identities it discovers the transient HockeyTech feed key from the
official Stats page, reads the player profile's `profileImage`, and persists
only the public image URL. A feed key is never stored or logged.
Before mutation, sync snapshots the canonical player tree and both manifests;
any failed import restores that snapshot. Existing files without a matching
audited manifest entry are rejected instead of being assigned fresh provenance.

The provided Signature originals are audited in
`data/content/signature-asset-sources.json`. Only an identity-exact source with
an existing `signature-series` CardVersion is imported. Full-card source art is
converted to WebP and its embedded legacy value zones are masked by the shared
card presentation so the generated catalog remains authoritative. Raw PNGs are
source material and remain in `assets/Event Cards/Signature Series`; sync never
uses the canonical WebP as a replacement for an available original. Validation
rejects duplicate player/source registrations, paths outside those NHL/PWHL
source directories, uninventoried PNGs, and canonical Signature assets without
an integrated source-inventory entry.

Each source explicitly records its retention state. `retained-original` means
the raw PNG is present and its hash and dimensions must still match the audit.
`canonical-derivative-only` is a visible warning state for a known missing raw
source; it does not invent or silently reconstruct an original from the WebP.
Marie-Philip Poulin is currently the sole entry in that state: her canonical
Signature WebP and original source hash remain audited, but the original
`MPP-Signature-Series.png` must be re-supplied to restore the raw archive.

## Current source gaps

The frozen catalog and provided source bundle do not align completely:

- 752 of 792 Base CardVersions have a real player headshot. All NHL Base cards
  resolve to an official player image. Forty PWHL identities have no approved
  profile image (38 draft-rights records plus Alice Philbert and Emma
  Nuutinen).
- Four of ten current Signature CardVersions have identity-matching supplied
  artwork: Cale Makar, Connor McDavid, David Pastrnak, and Marie-Philip Poulin.
  The other six use their Base headshot.
- Five supplied Signature sources belong to players without a frozen
  Signature CardVersion: Jeremy Swayman, Rasmus Dahlin, Megan Keller, Raygan
  Kirk, and Sophie Jaques. They remain audited source material and are never
  assigned to another player or Event set.

These cases resolve to Base or neutral artwork without broken URLs. Validation
reports them as source/fallback diagnostics. Closing them requires additional
identity-matching approved sources or a separately authorized catalog change;
neither is performed by this asset-only pipeline.
