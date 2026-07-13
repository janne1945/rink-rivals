# Catalog development tools

These tools are development-only. The app never downloads NHL or PWHL statistics at runtime, and the import command deliberately cannot replace the approved TypeScript catalog.

## Official source workflow

1. Manually export or transcribe completed-season tables from [NHL Stats](https://www.nhl.com/stats/skaters), [NHL goalie stats](https://www.nhl.com/stats/goalies), and [PWHL Stats](https://www.thepwhl.com/en/stats/player-stats/all-teams/1?sort=points).
2. Keep a local copy of the original exports for audit purposes. Do not commit licensed images, logos, or scraped page content.
3. Normalize the selected columns into one UTF-8 CSV using `templates/stats-template.csv`. Each player has one row per season. Goalies use `position=G`; irrelevant skater or goalie metrics remain `0`.
4. Run the importer with the three seasons ordered from oldest to newest:

   ```sh
   pnpm catalog:import -- \
     --input ./local-imports/stats.csv \
     --seasons 2023-24,2024-25,2025-26 \
     --overrides ./local-imports/overrides.json \
     --output ./local-imports/catalog-candidate.json
   ```

5. Review every warning, proxy result, override, player identity, position, league distribution, and asset reference. The candidate remains `REQUIRES_MANUAL_REVIEW`; it must not be released or copied into `gameCatalog.ts` without human approval.
6. After an approved catalog edit, run `pnpm catalog:validate`, `pnpm balance`, and the full test suite.

The PWHL has fewer completed seasons than the NHL. The configured three-season window must reflect seasons that have actually finished at review time. Players with fewer available seasons are allowed, but their 60/30/10 weights are renormalized and the report flags the reduced sample.

## Required CSV columns

| Column | Notes |
| --- | --- |
| `player_id` | Stable kebab-case ID; never derive it from a current team |
| `name`, `league`, `season`, `role`, `position` | `league`: `NHL`/`PWHL`; `role`: `skater`/`goalie`; six compact lineup positions |
| `team`, `nationality`, `handedness` | Generic team text; ISO-3 nationality; `left`/`right` |
| `games_played`, `minutes_played` | Minutes are mandatory for goalies |
| `goals`, `assists`, `points`, `shots` | Skater inputs |
| `blocks`, `hits`, `plus_minus`, `game_winning_goals` | Skater defensive, physical, and clutch proxies |
| `save_pct`, `goals_against_average`, `shutouts`, `wins` | Goalie inputs |

The pipeline weights newest/middle/oldest seasons at 60/30/10. It then converts transparent box-score proxies to 70–99 fantasy ratings using peer percentiles within league, role, and compact position. NHL and PWHL are normalized independently; there is no blanket league penalty. Speed and goalie puck handling are explicitly marked as proxies because the public box-score columns do not measure them directly.

## Overrides

Overrides are an optional JSON array. Every entry records the exact generated source value, replacement, and a meaningful reason. A stale `sourceValue`, unknown player, or role-incompatible attribute fails the entire import before output is written.

```json
[
  {
    "playerId": "pwhl-example-player",
    "attribute": "clutch",
    "sourceValue": 85,
    "replacementValue": 88,
    "reason": "Verified source correction: the export omitted two game-winning goals."
  }
]
```

Output is written to a temporary file and renamed only after CSV, identity, override, and full catalog validation succeed. Existing output is preserved unless `--force` is explicit. Even with `--force`, only a JSON review candidate can be written; the manually approved TypeScript catalog remains untouched.

## Validation and balance

`pnpm catalog:validate` checks duplicate IDs, player references, role/schema separation, permanent base inventory, 18/18 league parity, three players per lineup position per league, five event cards per league, starter lineups, neutral placeholder references, and base-rating parity.

`pnpm balance -- --paired-seeds 2000 --seed rink-rivals-balance-v1` builds deterministic lineups across the complete Base pool and runs paired, side-swapped Open Ice matches through the real battle engine. It reports league win rates, ties, round and situation wins, rating ranges, and the league win-rate gap. Paired seeds reduce home-side and command-order bias; a gap above five percentage points is flagged for manual review.

The checked-in preview catalog uses real player names with generic team text, neutral asset references, and plausible stats-driven fantasy values. It is an unofficial prototype dataset, not a claim of scientific cross-league equivalence, and still requires product, data, and rights review before any public release.
