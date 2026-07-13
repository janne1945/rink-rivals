import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gameCatalog } from '../src/data/generated/gameCatalog';
import { AI_OPPONENTS } from '../src/domain/battle/opponents';
import { EVENT_CALENDAR } from '../src/domain/shop/eventCalendar';

const EVENT_START = '-- BEGIN GENERATED EVENT DEFINITIONS';
const EVENT_END = '-- END GENERATED EVENT DEFINITIONS';
const OPPONENT_START = '-- BEGIN GENERATED AI OPPONENTS';
const OPPONENT_END = '-- END GENERATED AI OPPONENTS';
const CATALOG_START = '-- BEGIN GENERATED CARD CATALOG';
const CATALOG_END = '-- END GENERATED CARD CATALOG';

function jsonRecordsetSql(
  table: string,
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
  recordTypes: readonly string[],
  delimiter: string,
): string {
  return [
    `insert into public.${table} (${columns.join(', ')})`,
    `select ${columns.map((column) => `seeded.${column}`).join(', ')}`,
    `from jsonb_to_recordset($${delimiter}$${JSON.stringify(rows)}$${delimiter}$::jsonb) as seeded(`,
    `  ${recordTypes.join(',\n  ')}`,
    ');',
  ].join('\n');
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
  );
}

function renderCardCatalog(): string {
  const players = new Map(gameCatalog.players.map((player) => [player.id, player]));
  const rows = gameCatalog.cards.map((card) => {
    const player = players.get(card.playerId);
    if (!player) throw new Error(`Card ${card.id} references unknown player ${card.playerId}.`);
    return {
      card_id: card.id,
      player_id: card.playerId,
      league: player.league,
      eligible_positions: player.eligiblePositions,
      role: card.role,
      overall: card.overall,
      attributes: card.attributes,
      price: card.price,
      set_id: card.setId,
      card_type: card.cardType,
      is_permanent: card.isPermanent,
      is_reward_only: card.setId === 'rivalry-series-2026',
      is_active: true,
      available_from: card.availableFrom ?? null,
      available_to: card.availableTo ?? null,
    };
  });
  return jsonRecordsetSql(
    'card_catalog',
    [
      'card_id', 'player_id', 'league', 'eligible_positions', 'role', 'overall',
      'attributes', 'price', 'set_id', 'card_type', 'is_permanent', 'is_reward_only',
      'is_active', 'available_from', 'available_to',
    ],
    rows,
    [
      'card_id text', 'player_id text', 'league text', 'eligible_positions text[]',
      'role text', 'overall integer', 'attributes jsonb', 'price integer', 'set_id text',
      'card_type text', 'is_permanent boolean', 'is_reward_only boolean', 'is_active boolean',
      'available_from timestamptz', 'available_to timestamptz',
    ],
    'card_catalog',
  );
}

const sections = [
  { start: EVENT_START, end: EVENT_END, body: renderEventDefinitions() },
  { start: OPPONENT_START, end: OPPONENT_END, body: renderAiOpponents() },
  { start: CATALOG_START, end: CATALOG_END, body: renderCardCatalog() },
] as const;

function replaceSection(source: string, start: string, end: string, body: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error(`Missing or invalid generated section ${start} ... ${end}.`);
  }
  const bodyStart = startIndex + start.length;
  return `${source.slice(0, bodyStart)}\n${body}\n${source.slice(endIndex)}`;
}

function updateGeneratedSections(source: string): string {
  return sections.reduce(
    (updated, section) => replaceSection(updated, section.start, section.end, section.body),
    source,
  );
}

function findMigration(): string {
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
  if (!name) throw new Error('No Supabase migration contains all generated seed markers.');
  return join(migrationDirectory, name);
}

const mode = process.argv[2];
if (mode === '--write' || mode === '--check') {
  const migration = findMigration();
  const current = readFileSync(migration, 'utf8');
  const generated = updateGeneratedSections(current);
  if (mode === '--write') {
    writeFileSync(migration, generated);
    console.log(`Updated generated Supabase projections in ${migration}.`);
  } else if (current !== generated) {
    console.error(`Generated Supabase projections are stale in ${migration}. Run pnpm catalog:sql:write.`);
    process.exitCode = 1;
  } else {
    console.log(`Generated Supabase projections are current in ${migration}.`);
  }
} else if (mode === undefined) {
  console.log(sections.map(({ start, end, body }) => `${start}\n${body}\n${end}`).join('\n\n'));
} else {
  throw new Error(`Unknown argument ${mode}. Use --write, --check, or no argument.`);
}
