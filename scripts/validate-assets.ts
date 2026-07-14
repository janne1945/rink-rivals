import { gameCatalog } from '../src/data/generated/gameCatalog';
import {
  createPlayerAssetRuntimeManifest,
  playerAssetManifest,
  resolveCardImage,
  validateCardAssets,
  validatePlayerAssetManifest,
} from '../src/domain/cards/assets';
import { validateAssetFiles } from './lib/assetValidation';
import { loadPlayerAssetManifest } from './lib/loadPlayerAssetManifest';
import { validateSignatureSources } from './lib/signatureSourceValidation';

const auditManifest = await loadPlayerAssetManifest();
const expectedRuntimeManifest = createPlayerAssetRuntimeManifest(auditManifest);
const runtimeManifestMatches = JSON.stringify(playerAssetManifest())
  === JSON.stringify(expectedRuntimeManifest);
const auditManifestErrors = validatePlayerAssetManifest(auditManifest)
  .filter(({ severity }) => severity === 'error');
const catalogResult = validateCardAssets(gameCatalog);
const fileIssues = auditManifestErrors.length === 0
  ? await validateAssetFiles(auditManifest)
  : [];
const signatureSourceIssues = auditManifestErrors.length === 0
  ? await validateSignatureSources(gameCatalog, auditManifest)
  : [];
const signatureSourceErrors = signatureSourceIssues.filter(({ severity }) => severity === 'error');
const signatureSourceWarnings = signatureSourceIssues.filter(({ severity }) => severity === 'warning');
const sourceWarningCounts = Object.entries(signatureSourceWarnings
  .reduce<Record<string, number>>((counts, issue) => ({
    ...counts,
    [issue.code]: (counts[issue.code] ?? 0) + 1,
  }), {}));
const errorIssues = catalogResult.issues.filter(({ severity }) => severity === 'error');
const warningCounts = Object.entries(catalogResult.issues
  .filter(({ severity }) => severity === 'warning')
  .reduce<Record<string, number>>((counts, issue) => ({
    ...counts,
    [issue.code]: (counts[issue.code] ?? 0) + 1,
  }), {}));
const playersById = new Map(gameCatalog.players.map((player) => [player.id, player]));
const baseFallbacks = gameCatalog.cards.filter((card) => {
  if (card.cardType !== 'base') return false;
  const player = playersById.get(card.playerId);
  return player && resolveCardImage(card, player).resolution === 'placeholder';
});
const signatureCards = gameCatalog.cards.filter((card) =>
  card.cardType === 'event' && card.setId === 'signature-series');
const directSignatures = signatureCards.filter((card) => {
  const player = playersById.get(card.playerId);
  return player && resolveCardImage(card, player).resolvedVariant === 'signature';
});

if (!runtimeManifestMatches
  || auditManifestErrors.length > 0
  || errorIssues.length > 0
  || fileIssues.length > 0
  || signatureSourceErrors.length > 0
  || !catalogResult.valid) {
  if (!runtimeManifestMatches) {
    console.error(
      '[stale-runtime-manifest] src/assets/generated/playerAssetRuntimeManifest.json does not match the audit-manifest projection.',
    );
  }
  for (const issue of [
    ...auditManifestErrors,
    ...errorIssues,
    ...fileIssues,
    ...signatureSourceErrors,
  ]) {
    console.error(`[${issue.code}] ${issue.path}: ${issue.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Asset validation passed: ${auditManifest.assets.length} canonical files, ${catalogResult.directCards} direct cards, ${catalogResult.baseFallbackCards} Base aliases, and ${catalogResult.placeholderCards} neutral fallbacks.`,
  );
  console.log(
    `Coverage: ${catalogResult.directCards + catalogResult.baseFallbackCards}/${gameCatalog.cards.length} CardVersions have player artwork; Base headshots ${gameCatalog.cards.filter(({ cardType }) => cardType === 'base').length - baseFallbacks.length}/${gameCatalog.cards.filter(({ cardType }) => cardType === 'base').length}; matching Signature artwork ${directSignatures.length}/${signatureCards.length}.`,
  );
  if (warningCounts.length > 0) {
    console.log(`Resolver diagnostics: ${warningCounts.map(([code, count]) => `${code}=${count}`).join(', ')}.`);
  }
  if (signatureSourceWarnings.length > 0) {
    console.log(
      `Source diagnostics: ${sourceWarningCounts.map(([code, count]) => `${code}=${count}`).join(', ')}.`,
    );
  }
}
