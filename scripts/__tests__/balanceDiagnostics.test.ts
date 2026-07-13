import { describe, expect, it } from 'vitest';

import { gameCatalog, starterLineups } from '../../src/data/generated/gameCatalog';
import { assertBalanceReport, runBalanceDiagnostics } from '../lib/balanceDiagnostics';
import { analyzeRewardLoops, readRewardAuthoritySql } from '../lib/rewardLoopDiagnostics';

describe('balance diagnostics', () => {
  it('is reproducible for the same seed and reports both leagues', () => {
    const first = runBalanceDiagnostics(gameCatalog, starterLineups, 20, 'repeatable');
    const second = runBalanceDiagnostics(gameCatalog, starterLineups, 20, 'repeatable');

    expect(second).toEqual(first);
    expect(first.matches).toBe(40);
    expect(first.wins.NHL + first.wins.PWHL + first.wins.tie).toBe(first.matches);
    expect(first.averageBaseOverall.NHL).toBeGreaterThan(0);
    expect(first.averageBaseOverall.PWHL).toBeGreaterThan(0);
    expect(Object.keys(first.situationResults)).toContain('goalie-showdown');
    expect(first.ai.simulationPolicy.version).toBe('server-authority-v1');
    expect(first.ai.simulationPolicy.situationIds).toEqual([
      'transition-rush', 'cycle-pressure', 'blue-line-command', 'late-game-shift', 'crease-under-fire',
    ]);
    expect(first.economy.prices.typicalEvent).toBeGreaterThan(first.economy.prices.typicalBase);
  });

  it('passes a mass simulation with ordered AI tiers and plausible economy loops', () => {
    const report = runBalanceDiagnostics(gameCatalog, starterLineups, 1_000, 'calibration');

    expect(() => assertBalanceReport(report)).not.toThrow();
    expect(report.leagueWinRateGap).toBeLessThanOrEqual(0.05);
    expect(Object.values(report.ai.monotonicByMode).every(Boolean)).toBe(true);
    expect(report.ai.totalMatches).toBe(9_000);
    expect(report.economy.loopChecks.rewardOrderValid).toBe(true);
    expect(report.economy.loopChecks.pricesExceedSingleMatchRewards).toBe(true);
    expect(report.economy.loopChecks.objectivesArePeriodBounded).toBe(true);
    expect(report.economy.loopChecks.positiveLossRewardsRequireAuthoritativeMatches).toBe(true);
    expect(report.economy.loopChecks.settlementReplayRewardStable).toBe(true);
    expect(report.economy.loopChecks.openTicketCannotBeRerolled).toBe(true);
    expect(report.economy.loopChecks.rivalryRewardsAreFinite).toBe(true);
    expect(report.economy.loopChecks.utcPeriodCutoverUsesPostLockTime).toBe(true);
    expect(report.economy.loopChecks.repeatableUnboundedObjectiveRewardFound).toBe(false);
    expect(report.economy.loopChecks.evidence).toMatchObject({
      replayAttempts: 1_000,
      baseRewardsGrantedForOneReplayedMatch: 1,
      objectiveRewardsGrantedForOneReplayedMatch: 3,
      objectiveDefinitions: 4,
      rivalrySteps: 3,
    });
    expect(report.issues).toEqual([]);
  });

  it('fails closed when the server-authority reward contracts are absent', () => {
    const analysis = analyzeRewardLoops('');

    expect(analysis.objectivesArePeriodBounded).toBe(false);
    expect(analysis.positiveLossRewardsRequireAuthoritativeMatches).toBe(false);
    expect(analysis.settlementReplayRewardStable).toBe(false);
    expect(analysis.openTicketCannotBeRerolled).toBe(false);
    expect(analysis.rivalryRewardsAreFinite).toBe(false);
    expect(analysis.utcPeriodCutoverUsesPostLockTime).toBe(false);
    expect(analysis.repeatableUnboundedObjectiveRewardFound).toBe(true);
    expect(analysis.evidence.baseRewardsGrantedForOneReplayedMatch).toBe(1_000);
  });

  it('detects the former open-ticket abandonment reroll path', () => {
    const { sql } = readRewardAuthoritySql();
    const rerollingSql = sql.replace(
      'if existing_ticket.id is not null then',
      "if existing_ticket.id is not null then\n    update public.match_tickets set status = 'abandoned' where id = existing_ticket.id;",
    );
    expect(rerollingSql).not.toBe(sql);

    const analysis = analyzeRewardLoops(rerollingSql);
    expect(analysis.openTicketCannotBeRerolled).toBe(false);
    expect(analysis.positiveLossRewardsRequireAuthoritativeMatches).toBe(false);
    expect(analysis.repeatableUnboundedObjectiveRewardFound).toBe(true);
  });

  it('turns diagnostic issues into a nonzero CLI-compatible failure', () => {
    const report = runBalanceDiagnostics(gameCatalog, starterLineups, 20, 'failure-contract');
    expect(() => assertBalanceReport({ ...report, issues: ['implausible ordering'] }))
      .toThrow('implausible ordering');
  });
});
