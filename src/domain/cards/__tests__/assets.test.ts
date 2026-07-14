import { describe, expect, it } from 'vitest';

import playerAssetAuditManifestJson from '../../../assets/generated/playerAssetManifest.json' with { type: 'json' };
import { gameCatalog } from '../../../data/generated/gameCatalog';
import {
  createPlayerAssetRuntimeManifest,
  expectedCardImageReference,
  playerAssetManifest,
  resolveCardImage,
  validateCardAssets,
  validatePlayerAssetManifest,
  type PlayerAssetManifest,
} from '../assets';

const auditManifest = playerAssetAuditManifestJson as PlayerAssetManifest;
const playersById = new Map(gameCatalog.players.map((player) => [player.id, player]));

function cardById(cardId: string) {
  const card = gameCatalog.cards.find(({ id }) => id === cardId);
  if (!card) throw new Error(`Missing test card ${cardId}.`);
  return card;
}

function resolved(cardId: string) {
  const card = cardById(cardId);
  const player = playersById.get(card.playerId);
  if (!player) throw new Error(`Missing test player ${card.playerId}.`);
  return resolveCardImage(card, player);
}

describe('card asset resolver', () => {
  it('keeps every CardVersion reference semantic and unique', () => {
    const references = gameCatalog.cards.map((card) => card.imageReference);
    expect(new Set(references)).toHaveProperty('size', gameCatalog.cards.length);
    for (const card of gameCatalog.cards) {
      expect(card.imageReference).toBe(expectedCardImageReference(card));
      expect(card.imageReference).not.toMatch(/\.(?:avif|jpe?g|png|svg|webp)$/i);
    }
  });

  it('uses direct Base and matching Signature assets', () => {
    expect(resolved('nhl-connor-mcdavid-base')).toMatchObject({
      resolution: 'direct',
      resolvedVariant: 'base',
      presentation: 'headshot',
    });
    expect(resolved('nhl-connor-mcdavid-signature-series')).toMatchObject({
      resolution: 'direct',
      resolvedVariant: 'signature',
      presentation: 'full-card',
    });
    expect(resolved('pwhl-marie-philip-poulin-signature-series')).toMatchObject({
      resolution: 'direct',
      resolvedVariant: 'signature',
      presentation: 'full-card',
    });
  });

  it('aliases Starter, Reward, and non-Signature Events to one Base headshot', () => {
    const starter = gameCatalog.cards.find((card) => card.cardType === 'starter'
      && resolved(card.id).resolution === 'base-fallback');
    const event = gameCatalog.cards.find((card) => card.cardType === 'event'
      && card.setId !== 'signature-series' && resolved(card.id).resolution === 'base-fallback');
    expect(starter).toBeDefined();
    expect(event).toBeDefined();
    if (!starter || !event) return;

    const starterBase = gameCatalog.cards.find((card) =>
      card.cardType === 'base' && card.playerId === starter.playerId);
    const eventBase = gameCatalog.cards.find((card) =>
      card.cardType === 'base' && card.playerId === event.playerId);
    expect(starterBase).toBeDefined();
    expect(eventBase).toBeDefined();
    expect(resolved(starter.id).src).toBe(resolved(starterBase?.id ?? '').src);
    expect(resolved(event.id).src).toBe(resolved(eventBase?.id ?? '').src);
    expect(resolved('nhl-connor-mcdavid-rivalry-2026').src)
      .toBe(resolved('nhl-connor-mcdavid-base').src);
  });

  it('falls back safely when a direct Signature or Base headshot is unavailable', () => {
    expect(resolved('nhl-drake-batherson-signature-series')).toMatchObject({
      resolution: 'base-fallback',
      resolvedVariant: 'base',
    });
    const missingBase = resolved('pwhl-caroline-harvey-base');
    expect(missingBase).toMatchObject({
      resolution: 'placeholder',
      resolvedVariant: 'placeholder',
      presentation: 'placeholder',
    });
    expect(missingBase.src).toBe(playerAssetManifest().fallback.path);
  });

  it('rejects invalid references without throwing or requesting their path', () => {
    const card = cardById('nhl-connor-mcdavid-base');
    const player = playersById.get(card.playerId);
    if (!player) throw new Error('Missing Connor McDavid fixture.');
    const result = resolveCardImage({ ...card, imageReference: '../../secret.png' }, player);
    expect(result).toMatchObject({ resolution: 'placeholder', src: playerAssetManifest().fallback.path });
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'invalid-reference',
      severity: 'error',
    }));
  });

  it('reports duplicate payloads and unsafe paths in a mutated manifest', () => {
    const source = auditManifest;
    const first = source.assets[0];
    const second = source.assets[1];
    const invalid = {
      ...source,
      assets: [
        first,
        { ...second, path: '../outside.webp', sha256: first.sha256 },
      ],
    } as PlayerAssetManifest;
    const issues = validatePlayerAssetManifest(invalid);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate-asset' }),
      expect.objectContaining({ code: 'invalid-path' }),
    ]));
  });

  it('rejects a valid file payload assigned to the wrong player identity', () => {
    const source = auditManifest;
    const first = source.assets.find((asset) => asset.variant === 'base');
    const second = source.assets.find((asset) =>
      asset.variant === 'base' && asset.playerId !== first?.playerId);
    if (!first || !second) throw new Error('Manifest needs two Base assets for this test.');
    const invalid = {
      ...source,
      assets: source.assets.map((asset) => asset === first ? {
        ...asset,
        path: second.path,
        sha256: second.sha256,
        width: second.width,
        height: second.height,
        sourceReference: second.sourceReference,
      } : asset),
    } as PlayerAssetManifest;

    expect(validatePlayerAssetManifest(invalid)).toContainEqual(expect.objectContaining({
      code: 'invalid-path',
      path: expect.stringMatching(/\.path$/),
      message: expect.stringContaining(first.playerId),
    }));
  });

  it('keeps provenance and payload hashes out of the browser runtime projection', () => {
    const runtimeManifest = playerAssetManifest();
    expect(runtimeManifest).toEqual(createPlayerAssetRuntimeManifest(auditManifest));
    expect(JSON.stringify(runtimeManifest)).not.toMatch(/sha256|sourceReference|sourceSha256|https?:\/\//i);
    expect(runtimeManifest.assets[0]).not.toHaveProperty('sha256');
    expect(runtimeManifest.assets[0]).not.toHaveProperty('sourceReference');
  });

  it('validates every canonical asset association without errors', () => {
    const result = validateCardAssets(gameCatalog);
    expect(result.valid).toBe(true);
    expect(result.directCards + result.baseFallbackCards + result.placeholderCards)
      .toBe(gameCatalog.cards.length);
    expect(result.issues.filter(({ severity }) => severity === 'error')).toEqual([]);
    expect(result.issues.some(({ code }) => code === 'orphan-asset')).toBe(false);
  });
});
