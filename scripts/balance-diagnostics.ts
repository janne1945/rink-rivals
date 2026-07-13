import { gameCatalog, starterLineups } from '../src/data/generated/gameCatalog';
import { runBalanceDiagnostics } from './lib/balanceDiagnostics';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

try {
  const iterations = Number(option('--paired-seeds') ?? '2000');
  const seed = option('--seed') ?? 'rink-rivals-balance-v1';
  const report = runBalanceDiagnostics(gameCatalog, starterLineups, iterations, seed);

  console.log(`Balance simulation: ${report.matches} matches from ${report.pairedSeeds} paired seeds.`);
  console.log(
    `Win rates — NHL ${(report.winRates.NHL * 100).toFixed(2)}%, PWHL ${(report.winRates.PWHL * 100).toFixed(2)}%, ties ${(report.winRates.tie * 100).toFixed(2)}%.`,
  );
  console.log(
    `League gap: ${(report.leagueWinRateGap * 100).toFixed(2)} percentage points. Base OVR averages — NHL ${report.averageBaseOverall.NHL.toFixed(2)}, PWHL ${report.averageBaseOverall.PWHL.toFixed(2)}.`,
  );
  if (report.leagueWinRateGap > 0.05) {
    console.warn('Review required: the paired league win-rate gap exceeds 5 percentage points.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
