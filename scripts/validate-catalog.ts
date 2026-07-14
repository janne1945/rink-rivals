import { catalogMetadata, gameCatalog, starterLineups } from '../src/data/generated/gameCatalog';
import { validateGameCatalog } from './lib/catalogValidation';

try {
  const report = validateGameCatalog(gameCatalog, catalogMetadata, starterLineups);
  console.log(
    `Catalog valid: ${report.teams} teams, ${report.activePlayers} active + ${report.legacyPlayers} retained players, ${report.starterCards} Starter, ${report.baseCards} Base, ${report.eventCards} Event, and ${report.rewardCards} Reward cards.`,
  );
  console.log(
    `Base overall averages — NHL ${report.baseOverallAverage.NHL.toFixed(2)}, PWHL ${report.baseOverallAverage.PWHL.toFixed(2)}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
