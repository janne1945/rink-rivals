import { describe, expect, it } from 'vitest';

import { createTestCatalog } from '../../battle/__tests__/fixtures';
import { indexCatalog, resolveCard, validateCatalog } from '../catalog';
import type { CardCatalog } from '../types';

describe('card catalog', () => {
  it('indexes and resolves valid player/card identities', () => {
    const catalog = createTestCatalog();
    const indexed = indexCatalog(catalog);
    const firstCard = catalog.cards[0];
    const resolved = resolveCard(catalog, firstCard.id);

    expect(validateCatalog(catalog)).toEqual({ valid: true, issues: [] });
    expect(indexed.cardsById.get(firstCard.id)).toBe(firstCard);
    expect(resolved?.player.id).toBe(firstCard.playerId);
  });

  it('reports duplicate player IDs and duplicate card IDs', () => {
    const catalog = createTestCatalog();
    const invalid: CardCatalog = {
      players: [...catalog.players, catalog.players[0]],
      cards: [...catalog.cards, catalog.cards[0]],
    };
    const issues = validateCatalog(invalid).issues;

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-player-id' }),
        expect.objectContaining({ code: 'duplicate-card-id' }),
      ]),
    );
  });

  it('reports duplicate and invalid CardVersion image references', () => {
    const catalog = createTestCatalog();
    const first = catalog.cards[0];
    const second = catalog.cards[1];
    const invalid = {
      ...catalog,
      cards: [
        { ...first, imageReference: '../../outside.png' },
        { ...second, imageReference: '../../outside.png' },
        ...catalog.cards.slice(2),
      ],
    } as CardCatalog;
    const issues = validateCatalog(invalid).issues;
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate-card-image-reference' }),
      expect.objectContaining({ code: 'invalid-image-reference' }),
    ]));
  });

  it('reports invalid player references and role mismatches', () => {
    const catalog = createTestCatalog();
    const skater = catalog.cards.find(({ role }) => role === 'skater');
    const goalie = catalog.cards.find(({ role }) => role === 'goalie');
    if (!skater || !goalie) {
      throw new Error('Test catalog requires a skater and goalie.');
    }

    const invalid = {
      ...catalog,
      cards: [
        { ...skater, playerId: 'missing-player' },
        { ...skater, playerId: goalie.playerId },
      ],
    } as unknown as CardCatalog;
    const issues = validateCatalog(invalid).issues;

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-player-reference' }),
        expect.objectContaining({ code: 'role-mismatch' }),
      ]),
    );
  });

  it('keeps goalie and skater attribute schemas distinct', () => {
    const catalog = createTestCatalog();
    const goalie = catalog.cards.find(({ role }) => role === 'goalie');
    if (!goalie || goalie.role !== 'goalie') {
      throw new Error('Test catalog requires a goalie.');
    }

    const invalid = {
      ...catalog,
      cards: [{ ...goalie, attributes: { ...goalie.attributes, reflexes: 140 } }],
    } as CardCatalog;

    expect(validateCatalog(invalid).issues).toContainEqual(
      expect.objectContaining({ code: 'invalid-rating' }),
    );
  });
});
