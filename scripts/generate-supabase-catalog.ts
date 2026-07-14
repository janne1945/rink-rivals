import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { catalogMetadata, gameCatalog } from '../src/data/generated/gameCatalog';
import { AI_OPPONENTS } from '../src/domain/battle/opponents';
import { EVENT_CALENDAR } from '../src/domain/shop/eventCalendar';

const SIGNATURE_ID_START = '-- BEGIN GENERATED SIGNATURE CARD ID MIGRATIONS';
const SIGNATURE_ID_END = '-- END GENERATED SIGNATURE CARD ID MIGRATIONS';
const SIGNATURE_CATALOG_START = '-- BEGIN GENERATED SIGNATURE SERIES CATALOG';
const SIGNATURE_CATALOG_END = '-- END GENERATED SIGNATURE SERIES CATALOG';
const SIGNATURE_AI_START = '-- BEGIN GENERATED SIGNATURE AI LINEUPS';
const SIGNATURE_AI_END = '-- END GENERATED SIGNATURE AI LINEUPS';
const SIGNATURE_PROJECTION_MIGRATION = '20260714073953_align_signature_series_artwork.sql';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = join(repositoryRoot, 'supabase', 'migrations');

/**
 * These migrations are already part of the hosted history. The current catalog
 * must never be projected back into them; all later changes belong in a new
 * additive migration.
 */
const immutableProjectionMigrations = [
  {
    fileName: '20260713223330_content_foundation.sql',
    sha256: '0628bf7b4bb9348db8601ffa25a611403ef7eeee96d951f39ebc4abe99dc7763',
  },
  {
    fileName: '20260714024442_card_asset_references.sql',
    sha256: 'b25c892990b10e67e4417a6456b91cf95f68bd32c13a43c1a3d6c7a0fc9dd4ac',
  },
  {
    fileName: SIGNATURE_PROJECTION_MIGRATION,
    sha256: 'e3cb4498e53a9f5d67a6ae9c0526d75f837ed9e7711c57a0e4c76be1eab12bd5',
  },
] as const;

const signatureCardIdMigrations = [
  {
    oldCardId: 'nhl-drake-batherson-signature-series',
    newCardId: 'nhl-jeremy-swayman-signature-series',
  },
  {
    oldCardId: 'nhl-dylan-larkin-signature-series',
    newCardId: 'nhl-rasmus-dahlin-signature-series',
  },
  {
    oldCardId: 'nhl-evgeni-malkin-signature-series',
    newCardId: 'pwhl-megan-keller-signature-series',
  },
  {
    oldCardId: 'nhl-mark-stone-signature-series',
    newCardId: 'pwhl-raygan-kirk-signature-series',
  },
  {
    oldCardId: 'pwhl-erin-ambrose-signature-series',
    newCardId: 'pwhl-sophie-jaques-signature-series',
  },
] as const;

const signatureAiOpponentIds = [
  'nhl-elite-summit-club',
  'open-elite-northern-alliance',
] as const;

const eventOfferCounts = new Set(EVENT_CALENDAR.map((event) => event.rotation.offerCount));
if (eventOfferCounts.size !== 1) {
  throw new Error('All launch events must share one server offer-count contract.');
}
const EVENT_OFFER_COUNT = [...eventOfferCounts][0];

const eventRecurrenceWeeks = new Set(
  EVENT_CALENDAR.map((event) => event.rotation.recurrenceWeeks),
);
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

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function renderSignatureIdMigrations(): string {
  const values = signatureCardIdMigrations.map(({ oldCardId, newCardId }, index) => {
    const terminator = index === signatureCardIdMigrations.length - 1 ? ';' : ',';
    return `  (${sqlText(oldCardId)}, ${sqlText(newCardId)})${terminator}`;
  });
  return [
    'insert into signature_card_id_migrations (old_card_id, new_card_id) values',
    ...values,
  ].join('\n');
}

function renderSignatureCatalog(): string {
  const players = new Map(gameCatalog.players.map((player) => [player.id, player]));
  const rows = [...gameCatalog.cards]
    .filter((card) => card.setId === 'signature-series')
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((card) => {
      const player = players.get(card.playerId);
      if (!player) throw new Error(`Card ${card.id} references unknown player ${card.playerId}.`);

      const approvedArtwork = card.visualMetadata.treatment === 'approved-local-asset';
      const artworkPosition = card.visualMetadata.artworkPosition;
      if (approvedArtwork && artworkPosition === undefined) {
        throw new Error(`Approved Signature card ${card.id} is missing artworkPosition.`);
      }

      const legacyRetained = player.sourceMetadata.sourceRosterStatus === 'legacy-retained';
      return {
        card_id: card.id,
        player_id: card.playerId,
        team_id: card.teamId,
        league: player.league,
        eligible_positions: artworkPosition === undefined
          ? player.eligiblePositions
          : [artworkPosition],
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
        image_reference: card.imageReference,
        visual_metadata: card.visualMetadata,
        source_metadata: {
          status: approvedArtwork
            ? 'signature-artwork-corrected'
            : 'signature-history-retained',
          catalogId: catalogMetadata.catalogId,
          snapshotDate: catalogMetadata.snapshotDate,
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
    'signature_catalog',
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

function renderSignatureAiLineups(): string {
  const expectedIds = new Set<string>(signatureAiOpponentIds);
  const rows = AI_OPPONENTS
    .filter((opponent) => expectedIds.has(opponent.id))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((opponent) => ({
      id: opponent.id,
      name: opponent.name,
      mode: opponent.mode,
      difficulty: opponent.difficulty,
      lineup_slots: opponent.lineup.slots,
    }));
  if (rows.length !== signatureAiOpponentIds.length) {
    throw new Error('The generated Signature AI correction is missing an expected opponent.');
  }

  return jsonRecordsetSql(
    'ai_opponents',
    ['id', 'name', 'mode', 'difficulty', 'lineup_slots'],
    rows,
    ['id text', 'name text', 'mode text', 'difficulty text', 'lineup_slots jsonb'],
    'signature_ai_lineups',
    {
      columns: ['id'],
      updateColumns: ['name', 'mode', 'difficulty', 'lineup_slots'],
    },
  );
}

const additiveSections = [
  { start: SIGNATURE_ID_START, end: SIGNATURE_ID_END, body: renderSignatureIdMigrations() },
  {
    start: SIGNATURE_CATALOG_START,
    end: SIGNATURE_CATALOG_END,
    body: renderSignatureCatalog(),
  },
  { start: SIGNATURE_AI_START, end: SIGNATURE_AI_END, body: renderSignatureAiLineups() },
] as const;

function assertSourceProjectionContract(): void {
  const cardsById = new Map(gameCatalog.cards.map((card) => [card.id, card]));
  const signatureCards = gameCatalog.cards.filter((card) => card.setId === 'signature-series');
  const approvedSignatureCards = signatureCards.filter(
    (card) => card.visualMetadata.treatment === 'approved-local-asset',
  );

  if (signatureCards.length !== 10 || approvedSignatureCards.length !== 9) {
    throw new Error(
      `Signature projection expects 10 historical rows and 9 approved artworks; got ${signatureCards.length} and ${approvedSignatureCards.length}.`,
    );
  }

  for (const { oldCardId, newCardId } of signatureCardIdMigrations) {
    if (cardsById.has(oldCardId)) {
      throw new Error(`Retired Signature CardVersion remains in the source catalog: ${oldCardId}.`);
    }
    const replacement = cardsById.get(newCardId);
    if (replacement?.setId !== 'signature-series') {
      throw new Error(`Signature replacement is missing from the source catalog: ${newCardId}.`);
    }
  }

  const retiredIds = new Set<string>(
    signatureCardIdMigrations.map(({ oldCardId }) => oldCardId),
  );
  for (const opponent of AI_OPPONENTS) {
    for (const cardId of Object.values(opponent.lineup.slots)) {
      if (retiredIds.has(cardId)) {
        throw new Error(`AI opponent ${opponent.id} still uses retired CardVersion ${cardId}.`);
      }
    }
  }
}

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

function updateAdditiveSections(source: string): string {
  return additiveSections.reduce(
    (updated, section) => replaceSection(updated, section.start, section.end, section.body),
    source,
  );
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
      `The immutable server market resolver no longer enforces the six-offer rotation: ${missing.join(', ')}`,
    );
  }
}

function assertManualSignatureContract(source: string): void {
  const requiredFragments = [
    'create temporary table signature_card_id_migrations',
    'drop constraint card_catalog_content_contract_check',
    'delete from public.card_catalog cards',
    'add constraint card_catalog_content_contract_check',
    'add constraint card_catalog_signature_artwork_contract_check',
    'do $signature_postconditions$',
  ];
  const missing = requiredFragments.filter((fragment) => !source.includes(fragment));
  if (missing.length > 0) {
    throw new Error(
      `The manual Signature correction contract is incomplete: ${missing.join(', ')}`,
    );
  }
}

function readImmutableMigration(fileName: string, expectedHash: string): string {
  const path = join(migrationDirectory, fileName);
  const source = readFileSync(path, 'utf8');
  const actualHash = createHash('sha256').update(source).digest('hex');
  if (actualHash !== expectedHash) {
    throw new Error(
      `Immutable Supabase projection drift in ${path}: expected ${expectedHash}, got ${actualHash}. `
      + 'Restore the applied migration and publish changes through a new additive migration.',
    );
  }
  return source;
}

assertSourceProjectionContract();

const mode = process.argv[2];
if (mode === '--write' || mode === '--check') {
  const immutableSources = immutableProjectionMigrations.map(({ fileName, sha256 }) => ({
    fileName,
    source: readImmutableMigration(fileName, sha256),
  }));
  assertManualMarketContract(
    immutableSources.find(({ fileName }) => fileName.includes('content_foundation'))?.source ?? '',
  );

  const signatureMigration = join(migrationDirectory, SIGNATURE_PROJECTION_MIGRATION);
  const signatureCurrent = immutableSources.find(
    ({ fileName }) => fileName === SIGNATURE_PROJECTION_MIGRATION,
  )?.source;
  if (signatureCurrent === undefined) {
    throw new Error(`Missing immutable Signature projection ${signatureMigration}.`);
  }
  assertManualSignatureContract(signatureCurrent);
  const signatureGenerated = updateAdditiveSections(signatureCurrent);
  assertManualSignatureContract(signatureGenerated);

  if (signatureCurrent !== signatureGenerated) {
    console.error(
      `Current catalog source has drifted from the applied Signature projection in ${signatureMigration}. `
      + 'Do not edit the applied migration; create a new additive migration for this projection.',
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Verified ${immutableProjectionMigrations.length} immutable Supabase projection migrations.`,
    );
    console.log(
      mode === '--write'
        ? `Applied Signature projection matches current source in ${signatureMigration}; --write is a no-op.`
        : `Applied Signature projection matches current source in ${signatureMigration}.`,
    );
  }
} else if (mode === undefined) {
  console.log(
    additiveSections
      .map(({ start, end, body }) => `${start}\n${body}\n${end}`)
      .join('\n\n'),
  );
} else {
  throw new Error(`Unknown argument ${mode}. Use --write, --check, or no argument.`);
}
