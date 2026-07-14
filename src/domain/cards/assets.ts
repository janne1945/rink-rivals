import playerAssetRuntimeManifestJson from '../../assets/generated/playerAssetRuntimeManifest.json' with { type: 'json' };

import type { CardCatalog, CardType, CardVersion, Player } from './types';

export const CARD_IMAGE_REFERENCE_PREFIX = 'player-asset:';
export const CARD_IMAGE_REFERENCE_PATTERN = /^player-asset:(nhl|pwhl)-[a-z0-9-]+\/(starter|base|event|reward)\/[a-z0-9-]+$/;

export type PlayerAssetPresentation = 'headshot' | 'full-card' | 'placeholder';
export type PlayerAssetResolution = 'direct' | 'base-fallback' | 'placeholder';
export type PlayerAssetIssueSeverity = 'error' | 'warning';
export type PlayerAssetIssueCode =
  | 'duplicate-asset'
  | 'duplicate-reference'
  | 'invalid-path'
  | 'invalid-reference'
  | 'missing-asset'
  | 'orphan-asset';

export interface PlayerAssetRuntimeManifestEntry {
  readonly playerId: string;
  readonly variant: string;
  readonly path: string;
  readonly mediaType: string;
  readonly presentation: Exclude<PlayerAssetPresentation, 'placeholder'>;
  readonly width: number;
  readonly height: number;
}

export interface PlayerAssetManifestEntry extends PlayerAssetRuntimeManifestEntry {
  readonly sha256: string;
  readonly sourceReference: string;
  readonly sourceSha256?: string;
}

export interface PlayerAssetRuntimeFallback {
  readonly path: string;
  readonly mediaType: 'image/svg+xml';
  readonly presentation: 'placeholder';
  readonly width: number;
  readonly height: number;
}

export interface PlayerAssetFallback extends PlayerAssetRuntimeFallback {
  readonly sha256: string;
}

export interface PlayerAssetRuntimeManifest {
  readonly schemaVersion: 1;
  readonly fallback: PlayerAssetRuntimeFallback;
  readonly assets: readonly PlayerAssetRuntimeManifestEntry[];
}

export interface PlayerAssetManifest extends PlayerAssetRuntimeManifest {
  readonly fallback: PlayerAssetFallback;
  readonly assets: readonly PlayerAssetManifestEntry[];
}

export interface PlayerAssetIssue {
  readonly code: PlayerAssetIssueCode;
  readonly severity: PlayerAssetIssueSeverity;
  readonly path: string;
  readonly message: string;
}

export interface ResolvedCardImage {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly presentation: PlayerAssetPresentation;
  readonly resolution: PlayerAssetResolution;
  readonly requestedVariant: string;
  readonly resolvedVariant: string;
  readonly issues: readonly PlayerAssetIssue[];
}

export interface CardAssetValidationResult {
  readonly valid: boolean;
  readonly issues: readonly PlayerAssetIssue[];
  readonly directCards: number;
  readonly baseFallbackCards: number;
  readonly placeholderCards: number;
}

const manifest = playerAssetRuntimeManifestJson as PlayerAssetRuntimeManifest;
const SAFE_ASSET_PATH = /^\/assets\/(?:players\/(?:nhl|pwhl)\/[a-z0-9-]+\/[a-z0-9-]+\.(?:avif|jpe?g|png|webp)|cards\/[a-z0-9-]+\.svg)$/;
const SAFE_VARIANT = /^[a-z0-9-]+$/;
const SAFE_SOURCE_HOSTS = new Set([
  'assets.leaguestat.com',
  'assets.nhle.com',
  'lscluster.hockeytech.com',
]);

function assetKey(playerId: string, variant: string): string {
  return `${playerId}:${variant}`;
}

function isSafeAssetPath(path: string): boolean {
  return SAFE_ASSET_PATH.test(path) && !path.includes('..') && !path.includes('\\');
}

function expectedPlayerAssetPath(playerId: string, variant: string): string | undefined {
  const match = /^(nhl|pwhl)-([a-z0-9-]+)$/.exec(playerId);
  return match ? `/assets/players/${match[1]}/${match[2]}/${variant}.webp` : undefined;
}

function isSafeSourceReference(reference: string): boolean {
  if (/^provided-signature-artwork:[A-Za-z0-9][A-Za-z0-9._-]*\.png$/.test(reference)) {
    return true;
  }
  try {
    const url = new URL(reference);
    return url.protocol === 'https:' && SAFE_SOURCE_HOSTS.has(url.hostname)
      && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function runtimeManifestDiagnostics(source: PlayerAssetRuntimeManifest): PlayerAssetIssue[] {
  const issues: PlayerAssetIssue[] = [];
  const keys = new Set<string>();
  const paths = new Set<string>();

  if (!isSafeAssetPath(source.fallback.path)) {
    issues.push({
      code: 'invalid-path',
      severity: 'error',
      path: 'fallback.path',
      message: `Neutral fallback path ${source.fallback.path} is not a safe public asset path.`,
    });
  }
  if (source.fallback.mediaType !== 'image/svg+xml'
    || source.fallback.presentation !== 'placeholder'
    || !Number.isInteger(source.fallback.width) || source.fallback.width <= 0
    || !Number.isInteger(source.fallback.height) || source.fallback.height <= 0) {
    issues.push({
      code: 'invalid-reference',
      severity: 'error',
      path: 'fallback',
      message: 'Neutral fallback has invalid media metadata or dimensions.',
    });
  }

  source.assets.forEach((asset, index) => {
    const path = `assets[${index}]`;
    const key = assetKey(asset.playerId, asset.variant);
    const expectedPath = expectedPlayerAssetPath(asset.playerId, asset.variant);
    if (!/^(nhl|pwhl)-[a-z0-9-]+$/.test(asset.playerId) || !SAFE_VARIANT.test(asset.variant)) {
      issues.push({
        code: 'invalid-reference',
        severity: 'error',
        path,
        message: `Asset ${key} has an invalid player or variant reference.`,
      });
    }
    if (!isSafeAssetPath(asset.path)) {
      issues.push({
        code: 'invalid-path',
        severity: 'error',
        path: `${path}.path`,
        message: `Asset ${key} uses unsafe path ${asset.path}.`,
      });
    }
    if (expectedPath !== undefined && asset.path !== expectedPath) {
      issues.push({
        code: 'invalid-path',
        severity: 'error',
        path: `${path}.path`,
        message: `Asset ${key} must use canonical path ${expectedPath}, not ${asset.path}.`,
      });
    }
    if (asset.mediaType !== 'image/webp'
      || !Number.isInteger(asset.width) || asset.width <= 0
      || !Number.isInteger(asset.height) || asset.height <= 0) {
      issues.push({
        code: 'invalid-reference',
        severity: 'error',
        path,
        message: `Asset ${key} has invalid media metadata or dimensions.`,
      });
    }
    if ((asset.variant === 'base' && asset.presentation !== 'headshot')
      || (asset.variant === 'signature' && asset.presentation !== 'full-card')) {
      issues.push({
        code: 'invalid-reference',
        severity: 'error',
        path: `${path}.presentation`,
        message: `Asset ${key} has invalid ${asset.presentation} presentation for its variant.`,
      });
    }
    if (keys.has(key) || paths.has(asset.path)) {
      issues.push({
        code: 'duplicate-asset',
        severity: 'error',
        path,
        message: `Asset ${key} duplicates a manifest key or file path.`,
      });
    }
    keys.add(key);
    paths.add(asset.path);
  });

  return issues;
}

function auditManifestDiagnostics(source: PlayerAssetManifest): PlayerAssetIssue[] {
  const issues = [...runtimeManifestDiagnostics(source)];
  const hashes = new Set<string>();

  if (!/^[a-f0-9]{64}$/.test(source.fallback.sha256)) {
    issues.push({
      code: 'invalid-reference',
      severity: 'error',
      path: 'fallback.sha256',
      message: 'Neutral fallback has an invalid payload hash.',
    });
  }

  source.assets.forEach((asset, index) => {
    const path = `assets[${index}]`;
    const key = assetKey(asset.playerId, asset.variant);
    if (!/^[a-f0-9]{64}$/.test(asset.sha256) || !isSafeSourceReference(asset.sourceReference)) {
      issues.push({
        code: 'invalid-reference',
        severity: 'error',
        path,
        message: `Asset ${key} has an invalid payload hash or provenance.`,
      });
    }
    if (asset.sourceSha256 !== undefined && !/^[a-f0-9]{64}$/.test(asset.sourceSha256)) {
      issues.push({
        code: 'invalid-reference',
        severity: 'error',
        path: `${path}.sourceSha256`,
        message: `Asset ${key} has an invalid source payload hash.`,
      });
    }
    if (hashes.has(asset.sha256)) {
      issues.push({
        code: 'duplicate-asset',
        severity: 'error',
        path,
        message: `Asset ${key} duplicates a file payload.`,
      });
    }
    hashes.add(asset.sha256);
  });

  return issues;
}

const manifestIssues = runtimeManifestDiagnostics(manifest);
const manifestByKey = new Map(
  manifest.assets.map((asset) => [assetKey(asset.playerId, asset.variant), asset] as const),
);

export function createPlayerAssetRuntimeManifest(
  source: PlayerAssetManifest,
): PlayerAssetRuntimeManifest {
  return {
    schemaVersion: source.schemaVersion,
    fallback: {
      path: source.fallback.path,
      mediaType: source.fallback.mediaType,
      presentation: source.fallback.presentation,
      width: source.fallback.width,
      height: source.fallback.height,
    },
    assets: source.assets.map((asset) => ({
      playerId: asset.playerId,
      variant: asset.variant,
      path: asset.path,
      mediaType: asset.mediaType,
      presentation: asset.presentation,
      width: asset.width,
      height: asset.height,
    })),
  };
}

export function playerAssetManifest(): PlayerAssetRuntimeManifest {
  return manifest;
}

export function getPlayerAssetManifestIssues(): readonly PlayerAssetIssue[] {
  return manifestIssues;
}

export function validatePlayerAssetManifest(
  source: PlayerAssetManifest,
): readonly PlayerAssetIssue[] {
  return auditManifestDiagnostics(source);
}

export function createCardImageReference(
  playerId: string,
  cardType: CardType,
  cardId: string,
): string {
  return `${CARD_IMAGE_REFERENCE_PREFIX}${playerId}/${cardType}/${cardId}`;
}

export function expectedCardImageReference(card: CardVersion): string {
  return createCardImageReference(card.playerId, card.cardType, card.id);
}

export function directAssetVariant(card: CardVersion): string {
  if (card.cardType === 'base') return 'base';
  if (card.cardType === 'starter') return 'starter';
  if (card.cardType === 'event' && card.setId === 'signature-series') return 'signature';
  return card.setId;
}

function placeholderImage(
  requestedVariant: string,
  issues: readonly PlayerAssetIssue[],
): ResolvedCardImage {
  return {
    src: manifest.fallback.path,
    width: manifest.fallback.width,
    height: manifest.fallback.height,
    presentation: manifest.fallback.presentation,
    resolution: 'placeholder',
    requestedVariant,
    resolvedVariant: 'placeholder',
    issues,
  };
}

export function resolveCardImage(card: CardVersion, player: Player): ResolvedCardImage {
  const requestedVariant = directAssetVariant(card);
  const issues: PlayerAssetIssue[] = [];
  const expectedReference = expectedCardImageReference(card);
  if (player.id !== card.playerId || !CARD_IMAGE_REFERENCE_PATTERN.test(card.imageReference)
    || card.imageReference !== expectedReference) {
    issues.push({
      code: 'invalid-reference',
      severity: 'error',
      path: `cards.${card.id}.imageReference`,
      message: `Card ${card.id} must reference ${expectedReference} for player ${card.playerId}.`,
    });
    return placeholderImage(requestedVariant, issues);
  }

  const direct = manifestByKey.get(assetKey(card.playerId, requestedVariant));
  if (direct) {
    return {
      src: direct.path,
      width: direct.width,
      height: direct.height,
      presentation: direct.presentation,
      resolution: 'direct',
      requestedVariant,
      resolvedVariant: direct.variant,
      issues,
    };
  }

  issues.push({
    code: 'missing-asset',
    severity: 'warning',
    path: `cards.${card.id}.imageReference`,
    message: `Card ${card.id} has no direct ${requestedVariant} asset.`,
  });
  const base = manifestByKey.get(assetKey(card.playerId, 'base'));
  if (base) {
    return {
      src: base.path,
      width: base.width,
      height: base.height,
      presentation: base.presentation,
      resolution: 'base-fallback',
      requestedVariant,
      resolvedVariant: 'base',
      issues,
    };
  }

  return placeholderImage(requestedVariant, issues);
}

function cardDirectlyOwnsAsset(card: CardVersion, asset: PlayerAssetRuntimeManifestEntry): boolean {
  return card.playerId === asset.playerId && directAssetVariant(card) === asset.variant;
}

export function validateCardAssets(catalog: CardCatalog): CardAssetValidationResult {
  const issues = [...manifestIssues];
  const references = new Set<string>();
  let directCards = 0;
  let baseFallbackCards = 0;
  let placeholderCards = 0;
  const playersById = new Map(catalog.players.map((player) => [player.id, player]));

  for (const card of catalog.cards) {
    if (references.has(card.imageReference)) {
      issues.push({
        code: 'duplicate-reference',
        severity: 'error',
        path: `cards.${card.id}.imageReference`,
        message: `Card image reference ${card.imageReference} is used more than once.`,
      });
    }
    references.add(card.imageReference);
    const player = playersById.get(card.playerId);
    if (!player) continue;
    const resolved = resolveCardImage(card, player);
    issues.push(...resolved.issues);
    if (resolved.resolution === 'direct') directCards += 1;
    else if (resolved.resolution === 'base-fallback') baseFallbackCards += 1;
    else placeholderCards += 1;
  }

  manifest.assets.forEach((asset, index) => {
    const isBaseFallbackSource = asset.variant === 'base'
      && catalog.cards.some((card) => card.playerId === asset.playerId);
    const hasOwner = isBaseFallbackSource
      || catalog.cards.some((card) => cardDirectlyOwnsAsset(card, asset));
    if (!hasOwner) {
      issues.push({
        code: 'orphan-asset',
        severity: 'error',
        path: `assets[${index}]`,
        message: `Asset ${asset.playerId}/${asset.variant} has no associated CardVersion.`,
      });
    }
  });

  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues,
    directCards,
    baseFallbackCards,
    placeholderCards,
  };
}
