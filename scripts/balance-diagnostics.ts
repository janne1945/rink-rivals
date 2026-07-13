import { gameCatalog, starterLineups } from '../src/data/generated/gameCatalog';
import { assertBalanceReport, runBalanceDiagnostics } from './lib/balanceDiagnostics';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

try {
  const iterations = Number(option('--paired-seeds') ?? '2000');
  const seed = option('--seed') ?? 'rink-rivals-balance-v2';
  const json = process.argv.includes('--json');
  const report = runBalanceDiagnostics(gameCatalog, starterLineups, iterations, seed);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Balance simulation: ${report.matches} league matches from ${report.pairedSeeds} paired seeds.`);
    console.log(
      `League win rates — NHL ${(report.winRates.NHL * 100).toFixed(2)}%, PWHL ${(report.winRates.PWHL * 100).toFixed(2)}%, ties ${(report.winRates.tie * 100).toFixed(2)}%; gap ${(report.leagueWinRateGap * 100).toFixed(2)}pp.`,
    );
    console.log(`AI policy: ${report.ai.simulationPolicy.version} (${report.ai.simulationPolicy.fidelity}); ${report.ai.totalMatches} matches.`);
    for (const [mode, tiers] of Object.entries(report.ai.tiers)) {
      console.log(
        `${mode} player wins — Rookie ${(tiers.rookie.winRates.player * 100).toFixed(2)}%, Pro ${(tiers.pro.winRates.player * 100).toFixed(2)}%, Elite ${(tiers.elite.winRates.player * 100).toFixed(2)}%.`,
      );
    }
    console.log(
      `Typical prices — Base ${report.economy.prices.typicalBase}, strong Base ${report.economy.prices.typicalStrongBase}, Event ${report.economy.prices.typicalEvent}, Spotlight ${report.economy.prices.typicalSpotlight} credits.`,
    );
    for (const [difficulty, credits] of Object.entries(report.economy.averageCreditsPerMatch)) {
      console.log(`${difficulty} expected credits/match — ${credits.matchOnly} match-only, ${credits.withRecurringObjectives} with recurring objectives.`);
    }
    const loopChecks = report.economy.loopChecks;
    console.log(
      `Reward-loop audit — ${loopChecks.evidence.replayAttempts} settlement replays produced ${loopChecks.evidence.baseRewardsGrantedForOneReplayedMatch} base and ${loopChecks.evidence.objectiveRewardsGrantedForOneReplayedMatch} objective grants; ${loopChecks.evidence.migrationFilesAnalyzed} migration files checked.`,
    );
  }
  assertBalanceReport(report);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
