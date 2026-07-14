import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import sharp from 'sharp';

import signatureAssetSources from '../data/content/signature-asset-sources.json';
import {
  createPlayerAssetRuntimeManifest,
  validatePlayerAssetManifest,
  type PlayerAssetFallback,
  type PlayerAssetManifest,
  type PlayerAssetManifestEntry,
} from '../src/domain/cards/assets';

const REPOSITORY_ROOT = resolve('.');
const CATALOG_PATH = resolve('src/data/generated/gameCatalog.json');
const MANIFEST_PATH = resolve('src/assets/generated/playerAssetManifest.json');
const RUNTIME_MANIFEST_PATH = resolve('src/assets/generated/playerAssetRuntimeManifest.json');
const PUBLIC_ROOT = resolve('public');
const PLAYER_ASSET_ROOT = resolve(PUBLIC_ROOT, 'assets/players');
const SIGNATURE_SOURCE_ROOT = resolve('assets/Event Cards/Signature Series');
const ASSET_SYNC_LOCK_PATH = resolve('.asset-sync.lock');
const FALLBACK_PATH = '/assets/cards/neutral-card.svg';
const PWHL_STATS_PAGE_URL = 'https://www.thepwhl.com/en/stats/player-stats/0/8?sort=points';
const APPROVED_IMAGE_HOSTS = new Set([
  'assets.leaguestat.com',
  'assets.nhle.com',
  'lscluster.hockeytech.com',
]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const refresh = process.argv.includes('--refresh');
let pwhlFeedKeyPromise: Promise<string> | undefined;

interface CatalogPlayer {
  readonly id: string;
  readonly name: string;
  readonly league: 'NHL' | 'PWHL';
  readonly currentTeamId: string;
  readonly sourceMetadata: {
    readonly provider: string;
    readonly sourceIds: readonly string[];
    readonly rosterSeason: string;
    readonly statsSeason: string;
  };
}

interface CatalogTeam {
  readonly id: string;
  readonly abbreviation: string;
}

interface GeneratedCatalog {
  readonly players: readonly CatalogPlayer[];
  readonly teams: readonly CatalogTeam[];
}

interface SignatureSource {
  readonly playerId: string;
  readonly path: string;
  readonly sha256: string;
  readonly sourceRetention: 'retained-original' | 'canonical-derivative-only';
}

const SIGNATURE_SOURCES = (signatureAssetSources.sources
  .filter(({ status }) => status === 'integrated')
  .map(({ playerId, sourcePath: path, sourceSha256: sha256, sourceRetention }) => ({
    playerId,
    path,
    sha256,
    sourceRetention,
  }))) as readonly SignatureSource[];

const KNOWN_HEADSHOT_GAPS = new Set([
  'pwhl-alice-philbert',
  'pwhl-emma-nuutinen',
]);

function sha256(input: Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

function resolveWithin(root: string, candidate: string, label: string): string {
  const absolute = resolve(candidate);
  const relativePath = relative(root, absolute);
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${label} escapes its approved root: ${candidate}`);
  }
  return absolute;
}

function publicFile(publicPath: string): string {
  if (!publicPath.startsWith('/assets/')) {
    throw new Error(`Public player asset path is invalid: ${publicPath}`);
  }
  return resolveWithin(PUBLIC_ROOT, resolve(PUBLIC_ROOT, publicPath.slice(1)), 'Public asset path');
}

function isContainedRealPath(root: string, candidate: string): boolean {
  const nestedPath = relative(root, candidate);
  return nestedPath !== '' && nestedPath !== '..' && !nestedPath.startsWith(`..${sep}`)
    && !isAbsolute(nestedPath);
}

async function assertPublicRealPath(file: string, label: string): Promise<void> {
  const [canonicalRoot, canonicalFile] = await Promise.all([
    realpath(PUBLIC_ROOT),
    realpath(file),
  ]);
  if (!isContainedRealPath(canonicalRoot, canonicalFile)) {
    throw new Error(`${label} resolves outside public/: ${file}`);
  }
}

async function assertPublicTargetParent(file: string): Promise<void> {
  const parent = dirname(file);
  let existingAncestor = parent;
  while (!await pathExists(existingAncestor)) {
    const next = dirname(existingAncestor);
    if (next === existingAncestor) {
      throw new Error(`Could not find a safe existing ancestor for canonical asset directory ${parent}.`);
    }
    existingAncestor = next;
  }
  await assertPublicRealPath(existingAncestor, 'Canonical asset directory ancestor');
  await mkdir(parent, { recursive: true });
  const [canonicalRoot, canonicalParent] = await Promise.all([
    realpath(PUBLIC_ROOT),
    realpath(parent),
  ]);
  if (!isContainedRealPath(canonicalRoot, canonicalParent)) {
    throw new Error(`Canonical asset directory resolves outside public/: ${parent}`);
  }
}

function signatureSourceFile(sourcePath: string): string {
  return resolveWithin(
    SIGNATURE_SOURCE_ROOT,
    resolve(REPOSITORY_ROOT, sourcePath),
    'Signature source path',
  );
}

function approvedImageUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !APPROVED_IMAGE_HOSTS.has(url.hostname)
    || url.username !== '' || url.password !== '') {
    throw new Error(`Unapproved image URL: ${value}`);
  }
  return url;
}

function playerFolder(player: CatalogPlayer): string {
  return player.id.replace(/^(?:nhl|pwhl)-/, '');
}

function assetKey(playerId: string, variant: string): string {
  return `${playerId}:${variant}`;
}

function assetPublicPath(player: CatalogPlayer, variant: 'base' | 'signature'): string {
  return `/assets/players/${player.league.toLowerCase()}/${playerFolder(player)}/${variant}.webp`;
}

async function pwhlProfileImage(sourceId: string): Promise<string | undefined> {
  pwhlFeedKeyPromise ??= (async () => {
    const response = await fetch(PWHL_STATS_PAGE_URL, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error(`Could not discover the PWHL feed key (${response.status}).`);
    const html = await response.text();
    const key = html.match(/\bvar\s+appKey\s*=\s*['"]([a-f0-9]{16,64})['"]\s*;/i)?.[1];
    if (!key) throw new Error('The official PWHL Stats page no longer exposes a valid feed key.');
    return key;
  })();
  const pwhlFeedKey = await pwhlFeedKeyPromise;
  for (const seasonId of [10, 9, 8]) {
    const url = new URL('https://lscluster.hockeytech.com/feed/index.php');
    for (const [key, value] of Object.entries({
      feed: 'statviewfeed',
      view: 'player',
      player_id: sourceId,
      season_id: String(seasonId),
      site_id: '0',
      key: pwhlFeedKey,
      client_code: 'pwhl',
      league_id: '1',
      lang: 'en',
      statsType: 'standard',
    })) url.searchParams.set(key, value);
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) continue;
    const source = (await response.text()).trim();
    const json = source.startsWith('(') ? source.slice(1, source.endsWith(');') ? -2 : -1) : source;
    const payload = JSON.parse(json) as { info?: { profileImage?: unknown } };
    const profileImage = payload.info?.profileImage;
    if (typeof profileImage === 'string' && profileImage.length > 0) {
      return approvedImageUrl(profileImage).toString();
    }
  }
  return undefined;
}

async function headshotSource(
  player: CatalogPlayer,
  teamsById: ReadonlyMap<string, CatalogTeam>,
): Promise<string | undefined> {
  const sourceId = player.sourceMetadata.sourceIds[0];
  if (!sourceId) return undefined;
  if (player.league === 'NHL') {
    const team = teamsById.get(player.currentTeamId);
    if (!team || !/^\d{8}$/.test(player.sourceMetadata.rosterSeason) || !/^\d+$/.test(sourceId)) {
      return undefined;
    }
    return `https://assets.nhle.com/mugs/nhl/${player.sourceMetadata.rosterSeason}/${team.abbreviation}/${sourceId}.png`;
  }
  if (!/^\d+$/.test(sourceId)) return undefined;
  return pwhlProfileImage(sourceId);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function restoreFileBackup(
  backupPath: string,
  targetPath: string,
  existed: boolean,
): Promise<void> {
  if (existed) {
    await cp(backupPath, targetPath);
  } else {
    await rm(targetPath, { force: true });
  }
}

async function withAssetRollback<T>(action: () => Promise<T>): Promise<T> {
  const backupRoot = await mkdtemp(join(tmpdir(), 'rink-rivals-assets-'));
  let preserveBackup = false;
  const playerBackup = join(backupRoot, 'players');
  const manifestBackup = join(backupRoot, 'playerAssetManifest.json');
  const runtimeManifestBackup = join(backupRoot, 'playerAssetRuntimeManifest.json');
  const [hadPlayerAssets, hadManifest, hadRuntimeManifest] = await Promise.all([
    pathExists(PLAYER_ASSET_ROOT),
    pathExists(MANIFEST_PATH),
    pathExists(RUNTIME_MANIFEST_PATH),
  ]);

  try {
    await Promise.all([
      hadPlayerAssets ? cp(PLAYER_ASSET_ROOT, playerBackup, { recursive: true }) : Promise.resolve(),
      hadManifest ? cp(MANIFEST_PATH, manifestBackup) : Promise.resolve(),
      hadRuntimeManifest ? cp(RUNTIME_MANIFEST_PATH, runtimeManifestBackup) : Promise.resolve(),
    ]);
  } catch (error) {
    await rm(backupRoot, { recursive: true, force: true });
    throw error;
  }

  try {
    return await action();
  } catch (error) {
    try {
      await rm(PLAYER_ASSET_ROOT, { recursive: true, force: true });
      if (hadPlayerAssets) await cp(playerBackup, PLAYER_ASSET_ROOT, { recursive: true });
      await Promise.all([
        restoreFileBackup(manifestBackup, MANIFEST_PATH, hadManifest),
        restoreFileBackup(runtimeManifestBackup, RUNTIME_MANIFEST_PATH, hadRuntimeManifest),
      ]);
    } catch (rollbackError) {
      preserveBackup = true;
      throw new AggregateError(
        [error, rollbackError],
        `Asset sync failed and its canonical-file rollback was incomplete; recovery files remain at ${backupRoot}.`,
      );
    }
    throw error;
  } finally {
    if (!preserveBackup) await rm(backupRoot, { recursive: true, force: true });
  }
}

async function withAssetSyncLock<T>(action: () => Promise<T>): Promise<T> {
  let lock: Awaited<ReturnType<typeof open>>;
  try {
    lock = await open(ASSET_SYNC_LOCK_PATH, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `Asset sync lock already exists at ${ASSET_SYNC_LOCK_PATH}; another sync may be running. Remove it only after confirming no asset sync process is active.`,
      );
    }
    throw error;
  }

  try {
    await lock.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    return await action();
  } finally {
    try {
      await lock.close();
    } finally {
      await rm(ASSET_SYNC_LOCK_PATH, { force: true });
    }
  }
}

async function fetchImage(url: string, attempt = 1): Promise<Buffer | undefined> {
  approvedImageUrl(url);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'image/avif,image/webp,image/png,image/jpeg' },
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    if (attempt < 3) return fetchImage(url, attempt + 1);
    throw error;
  }
  if (response.status === 404) return undefined;
  if (!response.ok) {
    if (attempt < 3 && response.status >= 500) return fetchImage(url, attempt + 1);
    throw new Error(`Headshot request failed (${response.status}): ${url}`);
  }
  approvedImageUrl(response.url);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Headshot source returned ${contentType || 'no content type'}: ${url}`);
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new Error(`Headshot source exceeds ${MAX_IMAGE_BYTES} bytes: ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Headshot payload exceeds ${MAX_IMAGE_BYTES} bytes: ${url}`);
  }
  await sharp(buffer).metadata();
  return buffer;
}

async function nhlTeamAbbreviationsForSeason(
  sourceId: string,
  season: string,
): Promise<readonly string[]> {
  const url = `https://api-web.nhle.com/v1/player/${sourceId}/game-log/${season}/2`;
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`NHL game-log request failed (${response.status}): ${url}`);
  }
  const payload = await response.json() as { gameLog?: readonly { teamAbbrev?: unknown }[] };
  return [...new Set((payload.gameLog ?? []).flatMap(({ teamAbbrev }) =>
    typeof teamAbbrev === 'string' && /^[A-Z]{2,3}$/.test(teamAbbrev) ? [teamAbbrev] : []))];
}

async function writeWebp(buffer: Uint8Array, target: string, kind: 'headshot' | 'full-card'): Promise<void> {
  await assertPublicTargetParent(target);
  const temporary = `${target}.${process.pid}.tmp`;
  const pipeline = sharp(buffer, { failOn: 'error' });
  if (kind === 'headshot') {
    pipeline.resize({ width: 336, height: 336, fit: 'inside', withoutEnlargement: true });
  } else {
    pipeline.resize({ width: 720, fit: 'inside', withoutEnlargement: true });
  }
  try {
    await pipeline.webp({ quality: kind === 'headshot' ? 82 : 86, alphaQuality: 90, effort: 5 })
      .toFile(temporary);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return result;
}

async function manifestEntry(
  player: CatalogPlayer,
  variant: 'base' | 'signature',
  presentation: 'headshot' | 'full-card',
  sourceReference: string,
  sourceSha256?: string,
): Promise<PlayerAssetManifestEntry> {
  const path = assetPublicPath(player, variant);
  const file = publicFile(path);
  await assertPublicRealPath(file, `Canonical asset ${path}`);
  const [payload, metadata] = await Promise.all([readFile(file), sharp(file).metadata()]);
  if (!metadata.width || !metadata.height || metadata.format !== 'webp') {
    throw new Error(`Generated asset metadata is invalid for ${path}.`);
  }
  return {
    playerId: player.id,
    variant,
    path,
    mediaType: 'image/webp',
    presentation,
    width: metadata.width,
    height: metadata.height,
    sha256: sha256(payload),
    sourceReference,
    ...(sourceSha256 ? { sourceSha256 } : {}),
  };
}

async function assertExistingAssetFile(entry: PlayerAssetManifestEntry): Promise<void> {
  const file = publicFile(entry.path);
  await assertPublicRealPath(file, `Canonical asset ${entry.path}`);
  const [payload, metadata] = await Promise.all([readFile(file), sharp(file).metadata()]);
  if (sha256(payload) !== entry.sha256
    || metadata.format !== 'webp'
    || metadata.width !== entry.width
    || metadata.height !== entry.height) {
    throw new Error(`Canonical asset ${entry.path} no longer matches the audited manifest.`);
  }
}

async function syncHeadshot(
  player: CatalogPlayer,
  teamsById: ReadonlyMap<string, CatalogTeam>,
  existingEntry?: PlayerAssetManifestEntry,
): Promise<{ entry?: PlayerAssetManifestEntry; missing?: string }> {
  const path = assetPublicPath(player, 'base');
  const file = publicFile(path);
  const fileExists = await pathExists(file);
  if (fileExists && existingEntry === undefined) {
    throw new Error(`Unregistered canonical headshot exists at ${path}; remove or audit it before syncing ${player.id}.`);
  }
  if (!refresh && existingEntry?.playerId === player.id && existingEntry.variant === 'base'
    && existingEntry.path === path && fileExists) {
    return { entry: existingEntry };
  }

  const sourceReference = await headshotSource(player, teamsById);
  if (!sourceReference) {
    return { missing: `${player.id}: no approved source URL` };
  }
  if (refresh || !fileExists) {
    const source = await fetchImage(sourceReference);
    if (!source) return { missing: `${player.id}: source returned 404` };
    await writeWebp(source, file, 'headshot');
  }
  return { entry: await manifestEntry(player, 'base', 'headshot', sourceReference) };
}

async function recoverHistoricalNhlHeadshot(
  player: CatalogPlayer,
  rejectedHashes: ReadonlySet<string>,
): Promise<PlayerAssetManifestEntry | undefined> {
  const sourceId = player.sourceMetadata.sourceIds[0];
  const season = player.sourceMetadata.statsSeason;
  if (player.league !== 'NHL' || !/^\d+$/.test(sourceId ?? '') || !/^\d{8}$/.test(season)) {
    return undefined;
  }

  const teamAbbreviations = await nhlTeamAbbreviationsForSeason(sourceId, season);
  for (const teamAbbreviation of teamAbbreviations) {
    const sourceReference = `https://assets.nhle.com/mugs/nhl/${season}/${teamAbbreviation}/${sourceId}.png`;
    const source = await fetchImage(sourceReference);
    if (!source) continue;
    const file = publicFile(assetPublicPath(player, 'base'));
    await writeWebp(source, file, 'headshot');
    const entry = await manifestEntry(player, 'base', 'headshot', sourceReference);
    if (!rejectedHashes.has(entry.sha256)) return entry;
    await rm(file);
  }
  return undefined;
}

async function syncSignature(
  source: SignatureSource,
  playersById: ReadonlyMap<string, CatalogPlayer>,
  existingEntry?: PlayerAssetManifestEntry,
): Promise<PlayerAssetManifestEntry> {
  const player = playersById.get(source.playerId);
  if (!player) throw new Error(`Signature source references unknown player ${source.playerId}.`);
  const sourceFile = signatureSourceFile(source.path);
  const targetPath = assetPublicPath(player, 'signature');
  const targetFile = publicFile(targetPath);
  const reusableEntry = existingEntry?.playerId === player.id
    && existingEntry.variant === 'signature'
    && existingEntry.path === targetPath
    && existingEntry.sourceSha256 === source.sha256
    && await pathExists(targetFile)
    ? existingEntry
    : undefined;
  const hasSource = await pathExists(sourceFile);
  if (hasSource) {
    if (source.sourceRetention !== 'retained-original') {
      throw new Error(`Signature source ${source.path} exists but its inventory is not marked retained-original.`);
    }
    const sourcePayload = await readFile(sourceFile);
    if (sha256(sourcePayload) !== source.sha256) {
      throw new Error(`Signature source payload changed for ${source.playerId}; review the replacement before importing it.`);
    }
    if (!refresh && reusableEntry) return reusableEntry;
    await writeWebp(sourcePayload, targetFile, 'full-card');
  } else {
    if (source.sourceRetention === 'retained-original') {
      throw new Error(`Retained Signature source ${source.path} is missing; canonical derivatives never replace raw originals.`);
    }
    if (reusableEntry) return reusableEntry;
    throw new Error(`Signature source ${source.path} is missing and no audited canonical asset can be reused for ${source.playerId}.`);
  }
  return manifestEntry(
    player,
    'signature',
    'full-card',
    `provided-signature-artwork:${basename(source.path)}`,
    source.sha256,
  );
}

async function fallbackEntry(): Promise<PlayerAssetFallback> {
  const file = publicFile(FALLBACK_PATH);
  await assertPublicRealPath(file, 'Neutral fallback');
  const payload = await readFile(file);
  return {
    path: FALLBACK_PATH,
    mediaType: 'image/svg+xml',
    presentation: 'placeholder',
    width: 512,
    height: 720,
    sha256: sha256(payload),
  };
}

async function existingAssetsByKey(): Promise<ReadonlyMap<string, PlayerAssetManifestEntry>> {
  if (!await pathExists(MANIFEST_PATH)) return new Map();
  const existing = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as PlayerAssetManifest;
  const manifestIssues = validatePlayerAssetManifest(existing)
    .filter(({ severity }) => severity === 'error');
  if (manifestIssues.length > 0) {
    throw new Error(`Existing player asset manifest is invalid:\n${manifestIssues
      .map(({ path, message }) => `${path}: ${message}`).join('\n')}`);
  }
  const fallbackFile = publicFile(existing.fallback.path);
  await assertPublicRealPath(fallbackFile, 'Neutral fallback');
  const fallbackPayload = await readFile(fallbackFile);
  if (sha256(fallbackPayload) !== existing.fallback.sha256) {
    throw new Error('Neutral fallback no longer matches the audited manifest.');
  }
  await mapConcurrent(existing.assets, 16, assertExistingAssetFile);
  const result = new Map<string, PlayerAssetManifestEntry>();
  for (const entry of existing.assets) {
    const key = assetKey(entry.playerId, entry.variant);
    if (result.has(key)) throw new Error(`Existing player asset manifest duplicates ${key}.`);
    result.set(key, entry);
  }
  return result;
}

async function removeDuplicatePayloads(
  entries: readonly PlayerAssetManifestEntry[],
): Promise<{ entries: PlayerAssetManifestEntry[]; removed: PlayerAssetManifestEntry[] }> {
  const byHash = new Map<string, PlayerAssetManifestEntry[]>();
  for (const entry of entries) {
    const group = byHash.get(entry.sha256) ?? [];
    group.push(entry);
    byHash.set(entry.sha256, group);
  }
  const duplicates = [...byHash.values()].filter((group) => group.length > 1);
  const duplicateSignatures = duplicates.flat().filter(({ variant }) => variant === 'signature');
  if (duplicateSignatures.length > 0) {
    throw new Error(`Signature artwork duplicates another canonical payload:\n${duplicateSignatures
      .map(({ playerId, path }) => `${playerId}: ${path}`).join('\n')}`);
  }
  const duplicateKeys = new Set(duplicates.flatMap((group) => group.map((entry) => `${entry.playerId}:${entry.variant}`)));
  return {
    entries: entries.filter((entry) => !duplicateKeys.has(`${entry.playerId}:${entry.variant}`)),
    removed: duplicates.flat(),
  };
}

async function main(): Promise<void> {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8')) as GeneratedCatalog;
  const teamsById = new Map(catalog.teams.map((team) => [team.id, team]));
  const playersById = new Map(catalog.players.map((player) => [player.id, player]));
  const existingAssets = await existingAssetsByKey();
  const headshotResults = await mapConcurrent(catalog.players, 12, (player) =>
    syncHeadshot(player, teamsById, existingAssets.get(assetKey(player.id, 'base'))));
  const headshots = headshotResults.flatMap(({ entry }) => entry ? [entry] : []);
  const missing = headshotResults.flatMap(({ missing: reason }) => reason ? [reason] : []);
  const unexpectedMissing = missing.filter((reason) => {
    const playerId = reason.split(':', 1)[0];
    const player = playersById.get(playerId);
    return player?.sourceMetadata.provider !== 'pwhl-draft' && !KNOWN_HEADSHOT_GAPS.has(playerId);
  });
  if (unexpectedMissing.length > 0) {
    throw new Error(`Unexpected headshot gaps:\n${unexpectedMissing.join('\n')}`);
  }

  const signatureEntries = await mapConcurrent(SIGNATURE_SOURCES, 4, (source) =>
    syncSignature(source, playersById, existingAssets.get(assetKey(source.playerId, 'signature'))));
  const deduplicated = await removeDuplicatePayloads([...headshots, ...signatureEntries]);
  const duplicateHashes = new Set(deduplicated.removed.map(({ sha256: hash }) => hash));
  const recoveredHeadshots = (await mapConcurrent(deduplicated.removed, 3, async (entry) => {
    const player = playersById.get(entry.playerId);
    if (!player || entry.variant !== 'base') return undefined;
    return recoverHistoricalNhlHeadshot(player, duplicateHashes);
  })).flatMap((entry) => entry ? [entry] : []);
  const recoveredKeys = new Set(recoveredHeadshots.map(({ playerId, variant }) => `${playerId}:${variant}`));
  const orphanedDuplicates = deduplicated.removed
    .filter(({ playerId, variant }) => !recoveredKeys.has(`${playerId}:${variant}`));
  const duplicateFallbacks = orphanedDuplicates
    .map(({ playerId }) => `${playerId}: duplicate upstream placeholder payload`);

  const assetEntries = [...deduplicated.entries, ...recoveredHeadshots].sort((left, right) =>
    left.playerId.localeCompare(right.playerId) || left.variant.localeCompare(right.variant));
  const manifest: PlayerAssetManifest = {
    schemaVersion: 1,
    fallback: await fallbackEntry(),
    assets: assetEntries,
  };
  const generatedManifestIssues = validatePlayerAssetManifest(manifest)
    .filter(({ severity }) => severity === 'error');
  if (generatedManifestIssues.length > 0) {
    throw new Error(`Generated player asset manifest is invalid:\n${generatedManifestIssues
      .map(({ path, message }) => `${path}: ${message}`).join('\n')}`);
  }
  const runtimeManifest = createPlayerAssetRuntimeManifest(manifest);
  await mkdir(dirname(MANIFEST_PATH), { recursive: true });
  const temporaryManifest = `${MANIFEST_PATH}.${process.pid}.tmp`;
  const temporaryRuntimeManifest = `${RUNTIME_MANIFEST_PATH}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(temporaryRuntimeManifest, `${JSON.stringify(runtimeManifest, null, 2)}\n`);
    await rename(temporaryManifest, MANIFEST_PATH);
    await rename(temporaryRuntimeManifest, RUNTIME_MANIFEST_PATH);
  } finally {
    await Promise.all([
      rm(temporaryManifest, { force: true }),
      rm(temporaryRuntimeManifest, { force: true }),
    ]);
  }
  await Promise.all(orphanedDuplicates.map((entry) => rm(publicFile(entry.path))));

  console.log(
    `Player assets synced: ${assetEntries.filter(({ variant }) => variant === 'base').length} Base headshots, ${signatureEntries.length} matching Signature artworks, ${missing.length + duplicateFallbacks.length} neutral Base fallbacks.`,
  );
  if (missing.length + duplicateFallbacks.length > 0) {
    console.log(`Expected missing Base sources:\n${[...missing, ...duplicateFallbacks].join('\n')}`);
  }
}

await withAssetSyncLock(() => withAssetRollback(main));
