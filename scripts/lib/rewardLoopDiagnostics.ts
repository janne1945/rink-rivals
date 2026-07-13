import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { getDailyObjectiveDefinitions, WEEKLY_OBJECTIVE } from '../../src/domain/progression/objectives';
import { RIVALRY_ROAD_STEPS } from '../../src/domain/progression/rivalryRoad';

const REPLAY_ATTEMPTS = 1_000;
const REFERENCE_DATE = new Date('2026-07-13T12:00:00.000Z');

export interface RewardLoopAnalysis {
  readonly objectivesArePeriodBounded: boolean;
  readonly positiveLossRewardsRequireAuthoritativeMatches: boolean;
  readonly settlementReplayRewardStable: boolean;
  readonly openTicketCannotBeRerolled: boolean;
  readonly rivalryRewardsAreFinite: boolean;
  readonly utcPeriodCutoverUsesPostLockTime: boolean;
  readonly repeatableUnboundedObjectiveRewardFound: boolean;
  readonly evidence: Readonly<{
    migrationFilesAnalyzed: number;
    replayAttempts: number;
    baseRewardsGrantedForOneReplayedMatch: number;
    objectiveRewardsGrantedForOneReplayedMatch: number;
    objectiveDefinitions: number;
    rivalrySteps: number;
  }>;
}

interface SqlRewardGuards {
  readonly settlementReceiptUnique: boolean;
  readonly objectiveReceiptUnique: boolean;
  readonly rivalryProgressFinite: boolean;
  readonly authoritativeRoundsRequired: boolean;
  readonly oneOpenTicketPerUser: boolean;
  readonly openTicketCannotBeRerolled: boolean;
  readonly browserCannotWriteRewards: boolean;
  readonly utcPeriodCutoverUsesPostLockTime: boolean;
}

function normalizedSql(sql: string): string {
  return sql.toLowerCase().replace(/\s+/g, ' ');
}

function containsEvery(sql: string, fragments: readonly string[]): boolean {
  return fragments.every((fragment) => sql.includes(fragment));
}

function functionBody(sql: string, functionName: string): string {
  // Later additive migrations intentionally replace earlier RPC definitions.
  const start = sql.lastIndexOf(`create or replace function public.${functionName}(`);
  if (start < 0) return '';
  const bodyStart = sql.indexOf('as $$', start);
  if (bodyStart < 0) return '';
  const bodyEnd = sql.indexOf('$$;', bodyStart + 5);
  return bodyEnd < 0 ? '' : sql.slice(bodyStart, bodyEnd);
}

function analyzeSqlRewardGuards(rawSql: string): SqlRewardGuards {
  const sql = normalizedSql(rawSql);
  const settlement = functionBody(sql, 'settle_match');
  const startMatch = functionBody(sql, 'start_match');
  const profileLock = settlement.indexOf('from public.profiles profiles where profiles.id = requesting_user_id for update;');
  const settlementClock = settlement.indexOf('settlement_time := clock_timestamp()');
  const resumeReturn = startMatch.indexOf("'client_match_id', existing_ticket.client_match_id");
  const ticketInsert = startMatch.indexOf('insert into public.match_tickets');

  return {
    settlementReceiptUnique: containsEvery(sql, [
      'create table public.matches',
      'unique (user_id, client_match_id)',
      'create table public.match_rewards',
      'match_id uuid primary key',
      "'status', 'already-settled'",
    ]),
    objectiveReceiptUnique: containsEvery(sql, [
      'primary key (user_id, objective_id, period_key)',
      'on conflict (user_id, objective_id, period_key) do update',
      'if newly_completed then objective_credits := objective_credits +',
    ]),
    rivalryProgressFinite: containsEvery(sql, [
      'current_step_index integer not null default 0 check (current_step_index between 0 and 3)',
      "status in ('in-progress', 'choice-pending', 'complete')",
      'current_step_index = road.current_step_index + 1',
      "when road.current_step_index = 2 then 'choice-pending'",
      'unique (user_id, source_id)',
    ]),
    authoritativeRoundsRequired: containsEvery(sql, [
      'primary key (ticket_id, round_index)',
      'unique (user_id, client_request_id)',
      'if played_round_count <> 5 then',
      'all five server rounds must be played before settlement.',
      'requested_outcome := case when player_round_wins > opponent_round_wins then',
    ]),
    oneOpenTicketPerUser: containsEvery(sql, [
      'create unique index match_tickets_one_open_per_user_idx',
      "on public.match_tickets (user_id) where status = 'open'",
      "where tickets.user_id = requesting_user_id and tickets.status = 'open'",
    ]),
    openTicketCannotBeRerolled: containsEvery(startMatch, [
      "where tickets.user_id = requesting_user_id and tickets.status = 'open' for update;",
      'if existing_ticket.id is not null then',
      'where rounds.ticket_id = existing_ticket.id and rounds.user_id = requesting_user_id',
      "'rounds', played_rounds",
    ])
      && resumeReturn >= 0
      && ticketInsert > resumeReturn
      && !startMatch.includes("status = 'abandoned'")
      && !startMatch.includes("status := 'abandoned'")
      && !startMatch.includes("'abandoned'"),
    browserCannotWriteRewards: containsEvery(sql, [
      'revoke all on table public.matches from public, anon, authenticated',
      'revoke all on table public.match_rewards from public, anon, authenticated',
      'revoke all on table public.objective_progress from public, anon, authenticated',
      'revoke all on table public.match_tickets from public, anon, authenticated',
      'revoke all on table public.match_rounds from public, anon, authenticated',
    ]),
    utcPeriodCutoverUsesPostLockTime:
      profileLock >= 0 && settlementClock > profileLock && containsEvery(settlement, [
        "day_key := to_char(settlement_time at time zone 'utc', 'yyyy-mm-dd')",
        "date_trunc('week', settlement_time at time zone 'utc')",
      ]),
  };
}

export function readRewardAuthoritySql(): { sql: string; fileCount: number } {
  const migrationsPath = join(process.cwd(), 'supabase', 'migrations');
  const migrationFiles = readdirSync(migrationsPath)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  return {
    sql: migrationFiles.map((file) => readFileSync(join(migrationsPath, file), 'utf8')).join('\n'),
    fileCount: migrationFiles.length,
  };
}

function simulateReplayedSettlement(
  guards: SqlRewardGuards,
): { baseRewards: number; objectiveRewards: number } {
  const settledMatches = new Set<string>();
  const objectiveReceipts = new Set<string>();
  let baseRewards = 0;
  let objectiveRewards = 0;

  for (let attempt = 0; attempt < REPLAY_ATTEMPTS; attempt += 1) {
    const matchId = 'replayed-match';
    if (guards.settlementReceiptUnique && settledMatches.has(matchId)) continue;
    settledMatches.add(matchId);
    baseRewards += 1;

    for (const objective of getDailyObjectiveDefinitions(REFERENCE_DATE)) {
      const receiptKey = `${objective.id}:2026-07-13`;
      if (guards.objectiveReceiptUnique && objectiveReceipts.has(receiptKey)) continue;
      objectiveReceipts.add(receiptKey);
      objectiveRewards += 1;
    }
  }

  return { baseRewards, objectiveRewards };
}

export function analyzeRewardLoops(rawSql?: string): RewardLoopAnalysis {
  const migrations = rawSql === undefined ? readRewardAuthoritySql() : { sql: rawSql, fileCount: rawSql.length > 0 ? 1 : 0 };
  const guards = analyzeSqlRewardGuards(migrations.sql);
  const objectives = [...getDailyObjectiveDefinitions(REFERENCE_DATE), WEEKLY_OBJECTIVE];
  const objectiveIds = new Set(objectives.map((objective) => objective.id));
  const definitionsAreFinite = objectives.every((objective) =>
    (objective.cadence === 'daily' || objective.cadence === 'weekly')
      && Number.isSafeInteger(objective.target)
      && objective.target > 0
      && Number.isSafeInteger(objective.reward.credits)
      && objective.reward.credits >= 0,
  );
  const objectivesArePeriodBounded = definitionsAreFinite
    && objectiveIds.size === objectives.length
    && guards.objectiveReceiptUnique
    && guards.utcPeriodCutoverUsesPostLockTime;
  const rivalryIds = new Set(RIVALRY_ROAD_STEPS.map((step) => step.id));
  const rivalryRewardsAreFinite = rivalryIds.size === RIVALRY_ROAD_STEPS.length
    && RIVALRY_ROAD_STEPS.length > 0
    && RIVALRY_ROAD_STEPS.every((step) =>
      step.reward.type !== 'credits'
        || (Number.isSafeInteger(step.reward.credits) && step.reward.credits >= 0),
    )
    && guards.rivalryProgressFinite;
  const replay = simulateReplayedSettlement(guards);
  const settlementReplayRewardStable = replay.baseRewards === 1 && replay.objectiveRewards === 3;
  const positiveLossRewardsRequireAuthoritativeMatches = guards.authoritativeRoundsRequired
    && guards.oneOpenTicketPerUser
    && guards.openTicketCannotBeRerolled
    && guards.browserCannotWriteRewards;
  const repeatableUnboundedObjectiveRewardFound = !objectivesArePeriodBounded
    || !settlementReplayRewardStable
    || !rivalryRewardsAreFinite
    || !positiveLossRewardsRequireAuthoritativeMatches;

  return {
    objectivesArePeriodBounded,
    positiveLossRewardsRequireAuthoritativeMatches,
    settlementReplayRewardStable,
    openTicketCannotBeRerolled: guards.openTicketCannotBeRerolled,
    rivalryRewardsAreFinite,
    utcPeriodCutoverUsesPostLockTime: guards.utcPeriodCutoverUsesPostLockTime,
    repeatableUnboundedObjectiveRewardFound,
    evidence: {
      migrationFilesAnalyzed: migrations.fileCount,
      replayAttempts: REPLAY_ATTEMPTS,
      baseRewardsGrantedForOneReplayedMatch: replay.baseRewards,
      objectiveRewardsGrantedForOneReplayedMatch: replay.objectiveRewards,
      objectiveDefinitions: objectives.length,
      rivalrySteps: RIVALRY_ROAD_STEPS.length,
    },
  };
}
