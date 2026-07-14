import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import signatureSourcesJson from '../../data/content/signature-asset-sources.json';
import type { PlayerAssetManifest } from '../../src/domain/cards/assets';
import type { CardCatalog } from '../../src/domain/cards/types';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SIGNATURE_SOURCE_ROOT_PATH = 'assets/Event Cards/Signature Series';

export interface SignatureSourceEntry {
  readonly playerId: string;
  readonly sourcePath: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly sourceSha256: string;
  readonly sourceRetention: 'retained-original' | 'canonical-derivative-only';
  readonly status: 'integrated' | 'unmatched-card-version';
  readonly cardVersionId: string | null;
  readonly canonicalPath: string | null;
}

export interface SignatureSourceValidationOptions {
  readonly repositoryRoot?: string;
  readonly sources?: readonly SignatureSourceEntry[];
}

export interface SignatureSourceIssue {
  readonly severity: 'error' | 'warning';
  readonly code:
    | 'invalid-signature-source'
    | 'missing-signature-source-original'
    | 'unmatched-signature-source'
    | 'uninventoried-signature-source';
  readonly path: string;
  readonly message: string;
}

function sha256(input: Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

function toPortablePath(path: string): string {
  return path.split(sep).join('/');
}

function isContained(root: string, candidate: string): boolean {
  const nestedPath = relative(root, candidate);
  return nestedPath !== '' && !isAbsolute(nestedPath)
    && nestedPath !== '..' && !nestedPath.startsWith(`..${sep}`);
}

function sourceFilePath(
  sourcePath: string,
  repositoryRoot: string,
  sourceRoot: string,
): string | undefined {
  if (isAbsolute(sourcePath) || sourcePath.includes('\\') || !sourcePath.endsWith('.png')) {
    return undefined;
  }
  const file = resolve(repositoryRoot, sourcePath);
  const normalized = toPortablePath(relative(repositoryRoot, file));
  return normalized === sourcePath && isContained(sourceRoot, file) ? file : undefined;
}

function expectedCanonicalPath(playerId: string): string | undefined {
  const match = /^(nhl|pwhl)-([a-z0-9-]+)$/.exec(playerId);
  return match ? `/assets/players/${match[1]}/${match[2]}/signature.webp` : undefined;
}

function expectedLeagueDirectory(playerId: string): string | undefined {
  if (playerId.startsWith('nhl-')) return 'NHL';
  if (playerId.startsWith('pwhl-')) return 'PWHL';
  return undefined;
}

async function listRawPngFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listRawPngFiles(path));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
      files.push(path);
    }
  }
  return files;
}

function duplicateIssue(
  path: string,
  field: 'playerId' | 'sourcePath' | 'sourceSha256',
  value: string,
): SignatureSourceIssue {
  return {
    severity: 'error',
    code: 'invalid-signature-source',
    path,
    message: `Signature source ${field} ${value} is duplicated.`,
  };
}

async function auditRetainedOriginal(
  source: SignatureSourceEntry,
  sourceFile: string,
  sourceRoot: string,
): Promise<SignatureSourceIssue | undefined> {
  try {
    const [payload, metadata, canonicalRoot, canonicalFile] = await Promise.all([
      readFile(sourceFile),
      sharp(sourceFile).metadata(),
      realpath(sourceRoot),
      realpath(sourceFile),
    ]);
    if (!isContained(canonicalRoot, canonicalFile)) {
      return {
        severity: 'error',
        code: 'invalid-signature-source',
        path: source.sourcePath,
        message: `Retained Signature source ${source.playerId} resolves outside the approved source directory.`,
      };
    }
    if (sha256(payload) !== source.sourceSha256
      || metadata.width !== source.sourceWidth
      || metadata.height !== source.sourceHeight) {
      return {
        severity: 'error',
        code: 'invalid-signature-source',
        path: source.sourcePath,
        message: `Retained Signature source ${source.playerId} no longer matches its audited payload.`,
      };
    }
  } catch (error) {
    return {
      severity: 'error',
      code: 'invalid-signature-source',
      path: source.sourcePath,
      message: `Retained Signature source ${source.playerId} is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return undefined;
}

export async function validateSignatureSources(
  catalog: CardCatalog,
  manifest: PlayerAssetManifest,
  options: SignatureSourceValidationOptions = {},
): Promise<readonly SignatureSourceIssue[]> {
  const repositoryRoot = resolve(options.repositoryRoot ?? REPOSITORY_ROOT);
  const sourceRoot = resolve(repositoryRoot, SIGNATURE_SOURCE_ROOT_PATH);
  const sources = options.sources
    ?? signatureSourcesJson.sources as readonly SignatureSourceEntry[];
  const issues: SignatureSourceIssue[] = [];
  const playerIds = new Set<string>();
  const sourcePaths = new Set<string>();
  const sourceHashes = new Set<string>();
  const integratedPlayerIds = new Set<string>();

  for (const source of sources) {
    if (playerIds.has(source.playerId)) {
      issues.push(duplicateIssue(source.sourcePath, 'playerId', source.playerId));
    }
    if (sourcePaths.has(source.sourcePath)) {
      issues.push(duplicateIssue(source.sourcePath, 'sourcePath', source.sourcePath));
    }
    if (sourceHashes.has(source.sourceSha256)) {
      issues.push(duplicateIssue(source.sourcePath, 'sourceSha256', source.sourceSha256));
    }
    playerIds.add(source.playerId);
    sourcePaths.add(source.sourcePath);
    sourceHashes.add(source.sourceSha256);

    const sourceFile = sourceFilePath(source.sourcePath, repositoryRoot, sourceRoot);
    const expectedLeague = expectedLeagueDirectory(source.playerId);
    const expectedSourcePrefix = expectedLeague
      ? `${SIGNATURE_SOURCE_ROOT_PATH}/${expectedLeague}/`
      : undefined;
    if (sourceFile === undefined || expectedSourcePrefix === undefined
      || !source.sourcePath.startsWith(expectedSourcePrefix)) {
      issues.push({
        severity: 'error',
        code: 'invalid-signature-source',
        path: source.sourcePath,
        message: `Signature source ${source.playerId} must be a contained PNG in its approved NHL or PWHL source directory.`,
      });
      continue;
    }
    if (!Number.isInteger(source.sourceWidth) || source.sourceWidth <= 0
      || !Number.isInteger(source.sourceHeight) || source.sourceHeight <= 0
      || !/^[a-f0-9]{64}$/.test(source.sourceSha256)) {
      issues.push({
        severity: 'error',
        code: 'invalid-signature-source',
        path: source.sourcePath,
        message: `Signature source ${source.playerId} has invalid audited dimensions or payload hash.`,
      });
    }

    if (source.sourceRetention === 'retained-original') {
      const auditIssue = await auditRetainedOriginal(source, sourceFile, sourceRoot);
      if (auditIssue) issues.push(auditIssue);
    } else if (source.sourceRetention === 'canonical-derivative-only') {
      if (source.status !== 'integrated' || source.canonicalPath === null) {
        issues.push({
          severity: 'error',
          code: 'invalid-signature-source',
          path: source.sourcePath,
          message: `Signature source ${source.playerId} cannot be canonical-derivative-only without an integrated canonical asset.`,
        });
      }
      try {
        await stat(sourceFile);
        issues.push({
          severity: 'error',
          code: 'invalid-signature-source',
          path: source.sourcePath,
          message: `Signature source ${source.playerId} is present but incorrectly marked canonical-derivative-only.`,
        });
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        if (code !== 'ENOENT') {
          issues.push({
            severity: 'error',
            code: 'invalid-signature-source',
            path: source.sourcePath,
            message: `Signature source ${source.playerId} could not be audited: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      issues.push({
        severity: 'warning',
        code: 'missing-signature-source-original',
        path: source.sourcePath,
        message: `${source.playerId} retains its audited canonical derivative, but the raw Signature PNG must be re-supplied to restore the original source archive.`,
      });
    } else {
      issues.push({
        severity: 'error',
        code: 'invalid-signature-source',
        path: source.sourcePath,
        message: `Signature source ${source.playerId} has an invalid source-retention state.`,
      });
    }

    const playerExists = catalog.players.some((player) => player.id === source.playerId);
    if (!playerExists) {
      issues.push({
        severity: 'error',
        code: 'invalid-signature-source',
        path: source.sourcePath,
        message: `Signature source ${source.playerId} does not belong to a catalog player.`,
      });
    }

    const matchingCard = catalog.cards.find((card) =>
      card.id === source.cardVersionId
      && card.playerId === source.playerId
      && card.cardType === 'event'
      && card.setId === 'signature-series');
    const signatureAsset = manifest.assets.find((entry) =>
      entry.playerId === source.playerId && entry.variant === 'signature');
    if (source.status === 'integrated') {
      integratedPlayerIds.add(source.playerId);
      const expectedPath = expectedCanonicalPath(source.playerId);
      const expectedSourceReference = `provided-signature-artwork:${basename(source.sourcePath)}`;
      if (!matchingCard || !signatureAsset
        || source.canonicalPath !== expectedPath
        || signatureAsset.path !== source.canonicalPath
        || signatureAsset.sourceReference !== expectedSourceReference
        || signatureAsset.sourceSha256 !== source.sourceSha256) {
        issues.push({
          severity: 'error',
          code: 'invalid-signature-source',
          path: source.sourcePath,
          message: `Integrated Signature source ${source.playerId} does not match its CardVersion, identity, and canonical manifest entry.`,
        });
      }
      continue;
    }

    if (source.status !== 'unmatched-card-version'
      || source.cardVersionId !== null || source.canonicalPath !== null
      || signatureAsset !== undefined) {
      issues.push({
        severity: 'error',
        code: 'invalid-signature-source',
        path: source.sourcePath,
        message: `Unmatched Signature source ${source.playerId} has invalid CardVersion or canonical-asset metadata.`,
      });
    }
    if (catalog.cards.some((card) => card.playerId === source.playerId
      && card.cardType === 'event' && card.setId === 'signature-series')) {
      issues.push({
        severity: 'error',
        code: 'invalid-signature-source',
        path: source.sourcePath,
        message: `${source.playerId} now has a Signature CardVersion but its audited source is not integrated.`,
      });
    } else {
      issues.push({
        severity: 'warning',
        code: 'unmatched-signature-source',
        path: source.sourcePath,
        message: `${source.playerId} has provided Signature source art but no frozen Signature CardVersion.`,
      });
    }
  }

  for (const asset of manifest.assets.filter(({ variant }) => variant === 'signature')) {
    if (!integratedPlayerIds.has(asset.playerId)) {
      issues.push({
        severity: 'error',
        code: 'invalid-signature-source',
        path: asset.path,
        message: `Canonical Signature asset ${asset.playerId} has no integrated source-inventory entry.`,
      });
    }
  }

  try {
    const inventoriedFiles = new Set(sources
      .filter(({ sourceRetention }) => sourceRetention === 'retained-original')
      .map(({ sourcePath }) => sourcePath));
    for (const file of await listRawPngFiles(sourceRoot)) {
      const sourcePath = toPortablePath(relative(repositoryRoot, file));
      if (!inventoriedFiles.has(sourcePath)) {
        issues.push({
          severity: 'error',
          code: 'uninventoried-signature-source',
          path: sourcePath,
          message: `Raw Signature PNG ${sourcePath} is not registered as a retained original.`,
        });
      }
    }
  } catch (error) {
    issues.push({
      severity: 'error',
      code: 'invalid-signature-source',
      path: SIGNATURE_SOURCE_ROOT_PATH,
      message: `Signature source inventory directory is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return issues;
}
