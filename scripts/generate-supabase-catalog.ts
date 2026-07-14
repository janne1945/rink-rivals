import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { catalogMetadata, gameCatalog, starterSquads } from '../src/data/generated/gameCatalog';
import { AI_OPPONENTS } from '../src/domain/battle/opponents';
import { EVENT_CALENDAR } from '../src/domain/shop/eventCalendar';

const TEAM_START = '-- BEGIN GENERATED TEAM IDENTITIES';
const TEAM_END = '-- END GENERATED TEAM IDENTITIES';
const PLAYER_START = '-- BEGIN GENERATED PLAYER IDENTITIES';
const PLAYER_END = '-- END GENERATED PLAYER IDENTITIES';
const EVENT_START = '-- BEGIN GENERATED EVENT DEFINITIONS';
const EVENT_END = '-- END GENERATED EVENT DEFINITIONS';
const OPPONENT_START = '-- BEGIN GENERATED AI OPPONENTS';
const OPPONENT_END = '-- END GENERATED AI OPPONENTS';
const CATALOG_START = '-- BEGIN GENERATED CARD CATALOG';
const CATALOG_END = '-- END GENERATED CARD CATALOG';
const STARTER_START = '-- BEGIN GENERATED STARTER SQUADS';
const STARTER_END = '-- END GENERATED STARTER SQUADS';
const CARD_ASSETS_START = '-- BEGIN GENERATED CARD ASSET REFERENCES';
const CARD_ASSETS_END = '-- END GENERATED CARD ASSET REFERENCES';
const LINEUP_SLOTS = ['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const;
const FOUNDATION_SIGNATURE_ASSET_REFERENCES = new Map<string, string>([
  [
    'nhl-cale-makar-signature-series',
    'assets/Event Cards/Signature Series/NHL/Cale-Makar-Signature-Series.png',
  ],
  [
    'nhl-connor-mcdavid-signature-series',
    'assets/Event Cards/Signature Series/NHL/Connor-McDavid-Signature-Series.png',
  ],
  [
    'nhl-david-pastrnak-signature-series',
    'assets/Event Cards/Signature Series/NHL/David-Pastrnak-Signature-Series.png',
  ],
]);
const eventOfferCounts = new Set(EVENT_CALENDAR.map((event) => event.rotation.offerCount));
if (eventOfferCounts.size !== 1) {
  throw new Error('All launch events must share one server offer-count contract.');
}
const EVENT_OFFER_COUNT = [...eventOfferCounts][0];
const eventRecurrenceWeeks = new Set(EVENT_CALENDAR.map((event) => event.rotation.recurrenceWeeks));
if (eventRecurrenceWeeks.size !== 1) {
  throw new Error('All launch events must share one server recurrence contract.');
}
const EVENT_RECURRENCE_WEEKS = [...eventRecurrenceWeeks][0];

type ConflictClause = {
  columns: readonly string[];
  updateColumns: readonly string[];
};

function jsonRecordsetSql(
  table: string,
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
  recordTypes: readonly string[],
  delimiter: string,
  conflict: ConflictClause,
): string {
  const payload = JSON.stringify(rows);
  if (payload.includes(`$${delimiter}$`)) {
    throw new Error(`Generated ${table} payload contains its SQL dollar-quote delimiter.`);
  }
  return [
    `insert into public.${table} (${columns.join(', ')})`,
    `select ${columns.map((column) => `seeded.${column}`).join(', ')}`,
    `from jsonb_to_recordset($${delimiter}$${payload}$${delimiter}$::jsonb) as seeded(`,
    `  ${recordTypes.join(',\n  ')}`,
    ')',
    `on conflict (${conflict.columns.join(', ')}) do update set`,
    `  ${conflict.updateColumns.map((column) => `${column} = excluded.${column}`).join(',\n  ')};`,
  ].join('\n');
}

function renderTeams(): string {
  const rows = [...gameCatalog.teams]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((team) => ({
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      league: team.league,
      active: team.active,
      visual_metadata: team.visualMetadata,
      source_metadata: team.sourceMetadata,
    }));
  return jsonRecordsetSql(
    'teams',
    ['id', 'name', 'abbreviation', 'league', 'active', 'visual_metadata', 'source_metadata'],
    rows,
    [
      'id text', 'name text', 'abbreviation text', 'league text', 'active boolean',
      'visual_metadata jsonb', 'source_metadata jsonb',
    ],
    'team_identities',
    {
      columns: ['id'],
      updateColumns: ['name', 'abbreviation', 'league', 'active', 'visual_metadata', 'source_metadata'],
    },
  );
}

function renderPlayers(): string {
  const rows = [...gameCatalog.players]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((player) => ({
      id: player.id,
      name: player.name,
      league: player.league,
      current_team_id: player.currentTeamId,
      nationality: player.nationality,
      role: player.role,
      primary_position: player.primaryPosition,
      secondary_positions: player.eligiblePositions.filter(
        (position) => position !== player.primaryPosition,
      ),
      handedness: player.handedness,
      archetype: player.archetype,
      active: player.active,
      image_reference: player.imageReference ?? null,
      source_metadata: player.sourceMetadata,
    }));
  return jsonRecordsetSql(
    'players',
    [
      'id', 'name', 'league', 'current_team_id', 'nationality', 'role',
      'primary_position', 'secondary_positions', 'handedness', 'archetype',
      'active', 'image_reference', 'source_metadata',
    ],
    rows,
    [
      'id text', 'name text', 'league text', 'current_team_id text', 'nationality text',
      'role text', 'primary_position text', 'secondary_positions text[]', 'handedness text',
      'archetype text', 'active boolean', 'image_reference text', 'source_metadata jsonb',
    ],
    'player_identities',
    {
      columns: ['id'],
      updateColumns: [
        'name', 'league', 'current_team_id', 'nationality', 'role', 'primary_position',
        'secondary_positions', 'handedness', 'archetype', 'active', 'image_reference',
        'source_metadata',
      ],
    },
  );
}

function renderEventDefinitions(): string {
  const rows = EVENT_CALENDAR.map((event, rotationOrder) => ({
    id: event.id,
    name: event.name,
    description: event.description,
    rotation_order: rotationOrder,
    visual_metadata: { ...event.visual, gameplay: event.gameplay },
  }));
  return jsonRecordsetSql(
    'event_definitions',
    ['id', 'name', 'description', 'rotation_order', 'visual_metadata'],
    rows,
    ['id text', 'name text', 'description text', 'rotation_order integer', 'visual_metadata jsonb'],
    'event_definitions',
    {
      columns: ['id'],
      updateColumns: ['name', 'description', 'rotation_order', 'visual_metadata'],
    },
  );
}

function renderAiOpponents(): string {
  const rows = AI_OPPONENTS.map((opponent) => ({
    id: opponent.id,
    name: opponent.name,
    mode: opponent.mode,
    difficulty: opponent.difficulty,
    lineup_slots: opponent.lineup.slots,
  }));
  return jsonRecordsetSql(
    'ai_opponents',
    ['id', 'name', 'mode', 'difficulty', 'lineup_slots'],
    rows,
    ['id text', 'name text', 'mode text', 'difficulty text', 'lineup_slots jsonb'],
    'ai_opponents',
    {
      columns: ['id'],
      updateColumns: ['name', 'mode', 'difficulty', 'lineup_slots'],
    },
  );
}

function renderCardCatalog(): string {
  const players = new Map(gameCatalog.players.map((player) => [player.id, player]));
  const rows = [...gameCatalog.cards]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((card) => {
      const player = players.get(card.playerId);
      if (!player) throw new Error(`Card ${card.id} references unknown player ${card.playerId}.`);
      const legacyRetained = player.sourceMetadata.sourceRosterStatus === 'legacy-retained';
      const foundationSignatureReference = FOUNDATION_SIGNATURE_ASSET_REFERENCES.get(card.id);
      return {
        card_id: card.id,
        player_id: card.playerId,
        team_id: card.teamId,
        league: player.league,
        eligible_positions: player.eligiblePositions,
        role: card.role,
        overall: card.overall,
        attributes: card.attributes,
        abilities: card.abilities,
        price: card.price,
        set_id: card.setId,
        card_type: card.cardType,
        card_tier: card.cardTier,
        market_availability: card.marketAvailability,
        is_permanent: card.isPermanent,
        is_reward_only: card.cardType === 'reward',
        is_active: true,
        available_from: card.availableFrom ?? null,
        available_to: card.availableTo ?? null,
        // This section belongs to an already-applied migration. Keep its original
        // asset projection frozen; current asset references are emitted separately.
        image_reference: foundationSignatureReference ?? `placeholder:card/${card.id}`,
        visual_metadata: {
          ...card.visualMetadata,
          treatment: foundationSignatureReference ? 'approved-local-asset' : 'neutral-placeholder',
        },
        source_metadata: {
          status: legacyRetained ? 'legacy-retained' : 'generated',
          catalogId: catalogMetadata.catalogId,
          snapshotDate: catalogMetadata.snapshotDate,
          ...(legacyRetained ? {
            sourceRosterStatus: 'legacy-retained',
            requiresManualReview: true,
          } : {}),
        },
        legacy_retained: legacyRetained,
      };
    });
  return jsonRecordsetSql(
    'card_catalog',
    [
      'card_id', 'player_id', 'team_id', 'league', 'eligible_positions', 'role', 'overall',
      'attributes', 'abilities', 'price', 'set_id', 'card_type', 'card_tier',
      'market_availability', 'is_permanent', 'is_reward_only', 'is_active',
      'available_from', 'available_to', 'image_reference', 'visual_metadata',
      'source_metadata', 'legacy_retained',
    ],
    rows,
    [
      'card_id text', 'player_id text', 'team_id text', 'league text',
      'eligible_positions text[]', 'role text', 'overall integer', 'attributes jsonb',
      'abilities text[]', 'price integer', 'set_id text', 'card_type text',
      'card_tier text', 'market_availability text', 'is_permanent boolean',
      'is_reward_only boolean', 'is_active boolean', 'available_from timestamptz',
      'available_to timestamptz', 'image_reference text', 'visual_metadata jsonb',
      'source_metadata jsonb', 'legacy_retained boolean',
    ],
    'card_catalog',
    {
      columns: ['card_id'],
      updateColumns: [
        'player_id', 'team_id', 'league', 'eligible_positions', 'role', 'overall',
        'attributes', 'abilities', 'price', 'set_id', 'card_type', 'card_tier',
        'market_availability', 'is_permanent', 'is_reward_only', 'is_active',
        'available_from', 'available_to', 'image_reference', 'visual_metadata',
        'source_metadata', 'legacy_retained',
      ],
    },
  );
}

function renderCardAssetReferences(): string {
  const rows = [...gameCatalog.cards]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((card) => ({
      card_id: card.id,
      image_reference: card.imageReference,
      visual_metadata: card.visualMetadata,
    }));
  const payload = JSON.stringify(rows);
  if (payload.includes('$card_asset_catalog$')) {
    throw new Error('Generated card asset payload contains its SQL dollar-quote delimiter.');
  }
  return [
    'do $card_asset_projection$',
    'declare',
    `  asset_rows jsonb := $card_asset_catalog$${payload}$card_asset_catalog$::jsonb;`,
    '  expected_count bigint;',
    '  distinct_count bigint;',
    '  catalog_count bigint;',
    '  matched_count bigint;',
    '  updated_count bigint;',
    'begin',
    '  expected_count := jsonb_array_length(asset_rows);',
    '',
    '  select count(distinct seeded.card_id)',
    '  into distinct_count',
    '  from jsonb_to_recordset(asset_rows) as seeded(',
    '    card_id text,',
    '    image_reference text,',
    '    visual_metadata jsonb',
    '  );',
    '',
    '  if distinct_count <> expected_count then',
    "    raise exception 'Card asset projection contains duplicate card IDs (% distinct / % rows).', distinct_count, expected_count;",
    '  end if;',
    '',
    '  if exists (',
    '    select 1',
    '    from jsonb_to_recordset(asset_rows) as seeded(',
    '      card_id text,',
    '      image_reference text,',
    '      visual_metadata jsonb',
    '    )',
    "    where seeded.image_reference is null or seeded.image_reference = ''",
    "      or jsonb_typeof(seeded.visual_metadata) <> 'object'",
    '  ) then',
    "    raise exception 'Card asset projection contains an empty reference or invalid visual metadata.';",
    '  end if;',
    '',
    '  select count(*)',
    '  into catalog_count',
    '  from public.card_catalog;',
    '',
    '  if catalog_count <> expected_count then',
    "    raise exception 'Card asset projection expects % cards, but public.card_catalog contains %.', expected_count, catalog_count;",
    '  end if;',
    '',
    '  select count(*)',
    '  into matched_count',
    '  from public.card_catalog as catalog',
    '  inner join jsonb_to_recordset(asset_rows) as seeded(',
    '    card_id text,',
    '    image_reference text,',
    '    visual_metadata jsonb',
    '  ) on seeded.card_id = catalog.card_id;',
    '',
    '  if matched_count <> expected_count then',
    "    raise exception 'Card asset projection matched % of % cards.', matched_count, expected_count;",
    '  end if;',
    '',
    '  update public.card_catalog as catalog',
    '  set',
    '    image_reference = seeded.image_reference,',
    '    visual_metadata = seeded.visual_metadata',
    '  from jsonb_to_recordset(asset_rows) as seeded(',
    '    card_id text,',
    '    image_reference text,',
    '    visual_metadata jsonb',
    '  )',
    '  where catalog.card_id = seeded.card_id;',
    '',
    '  get diagnostics updated_count = row_count;',
    '  if updated_count <> expected_count then',
    "    raise exception 'Card asset projection updated % of % cards.', updated_count, expected_count;",
    '  end if;',
    'end',
    '$card_asset_projection$;',
  ].join('\n');
}

function renderStarterSquads(): string {
  const rows = [...starterSquads]
    .sort((left, right) => left.teamId.localeCompare(right.teamId))
    .flatMap((squad) => LINEUP_SLOTS.map((slot) => ({
      team_id: squad.teamId,
      slot,
      card_id: squad.lineup[slot],
    })));
  return jsonRecordsetSql(
    'starter_team_cards',
    ['team_id', 'slot', 'card_id'],
    rows,
    ['team_id text', 'slot text', 'card_id text'],
    'starter_squads',
    {
      columns: ['team_id', 'slot'],
      updateColumns: ['card_id'],
    },
  );
}

const foundationSections = [
  { start: TEAM_START, end: TEAM_END, body: renderTeams() },
  { start: PLAYER_START, end: PLAYER_END, body: renderPlayers() },
  { start: EVENT_START, end: EVENT_END, body: renderEventDefinitions() },
  { start: OPPONENT_START, end: OPPONENT_END, body: renderAiOpponents() },
  { start: CATALOG_START, end: CATALOG_END, body: renderCardCatalog() },
  { start: STARTER_START, end: STARTER_END, body: renderStarterSquads() },
] as const;

const cardAssetSection = {
  start: CARD_ASSETS_START,
  end: CARD_ASSETS_END,
  body: renderCardAssetReferences(),
} as const;

function replaceSection(source: string, start: string, end: string, body: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error(`Missing or invalid generated section ${start} ... ${end}.`);
  }
  if (
    source.indexOf(start, startIndex + start.length) >= 0
    || source.indexOf(end, endIndex + end.length) >= 0
  ) {
    throw new Error(`Generated section markers must be unique: ${start} ... ${end}.`);
  }
  const bodyStart = startIndex + start.length;
  return `${source.slice(0, bodyStart)}\n${body}\n${source.slice(endIndex)}`;
}

function updateGeneratedSections(source: string): string {
  return foundationSections.reduce(
    (updated, section) => replaceSection(updated, section.start, section.end, section.body),
    source,
  );
}

function updateCardAssetSection(source: string): string {
  return replaceSection(source, cardAssetSection.start, cardAssetSection.end, cardAssetSection.body);
}

function assertManualMarketContract(source: string): void {
  const requiredFragments = [
    'eligible_event_pool as (',
    'ranked_event_pool as (',
    `floor(market_clock.week_index::numeric / ${EVENT_RECURRENCE_WEEKS})::bigint as occurrence_index`,
    `(ranked_event_pool.occurrence_index * ${EVENT_OFFER_COUNT}) % ranked_event_pool.pool_count`,
    `least(${EVENT_OFFER_COUNT}::bigint, ranked_event_pool.pool_count)`,
    `where rotated.selection_index < least(${EVENT_OFFER_COUNT}::bigint, ranked_event_pool.pool_count)`,
  ];
  const missing = requiredFragments.filter((fragment) => !source.includes(fragment));
  if (missing.length > 0) {
    throw new Error(
      `The manual server market resolver no longer enforces the six-offer rotation: ${missing.join(', ')}`,
    );
  }
}

function findMigrationWithSections(
  sections: readonly { start: string; end: string }[],
  label: string,
): string {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const migrationDirectory = join(repositoryRoot, 'supabase', 'migrations');
  const candidates = readdirSync(migrationDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .reverse();
  const name = candidates.find((candidate) => {
    const source = readFileSync(join(migrationDirectory, candidate), 'utf8');
    return sections.every(({ start, end }) => source.includes(start) && source.includes(end));
  });
  if (!name) throw new Error(`No Supabase migration contains all ${label} markers.`);
  return join(migrationDirectory, name);
}

function findFoundationMigration(): string {
  return findMigrationWithSections(foundationSections, 'generated seed');
}

function findCardAssetMigration(): string {
  return findMigrationWithSections([cardAssetSection], 'generated card asset');
}

const mode = process.argv[2];
if (mode === '--write' || mode === '--check') {
  const foundationMigration = findFoundationMigration();
  const foundationCurrent = readFileSync(foundationMigration, 'utf8');
  const foundationGenerated = updateGeneratedSections(foundationCurrent);
  assertManualMarketContract(foundationGenerated);
  if (foundationCurrent !== foundationGenerated) {
    throw new Error(
      `Immutable Supabase foundation projection is stale in ${foundationMigration}. `
      + 'Restore the applied migration; publish changes through a new additive migration.',
    );
  }

  const assetMigration = findCardAssetMigration();
  const assetCurrent = readFileSync(assetMigration, 'utf8');
  const assetGenerated = updateCardAssetSection(assetCurrent);
  if (mode === '--write') {
    writeFileSync(assetMigration, assetGenerated);
    console.log(`Verified immutable Supabase foundation projection in ${foundationMigration}.`);
    console.log(`Updated generated card asset projection in ${assetMigration}.`);
  } else if (assetCurrent !== assetGenerated) {
    console.error(
      `Generated card asset projection is stale in ${assetMigration}. Run pnpm catalog:sql:write.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`Immutable Supabase foundation projection is current in ${foundationMigration}.`);
    console.log(`Generated card asset projection is current in ${assetMigration}.`);
  }
} else if (mode === undefined) {
  console.log(
    [...foundationSections, cardAssetSection]
      .map(({ start, end, body }) => `${start}\n${body}\n${end}`)
      .join('\n\n'),
  );
} else {
  throw new Error(`Unknown argument ${mode}. Use --write, --check, or no argument.`);
}
