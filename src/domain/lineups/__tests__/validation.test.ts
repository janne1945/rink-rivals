import { describe, expect, it } from 'vitest';

import { createTestCatalog, createTestLineup } from '../../battle/__tests__/fixtures';
import { cardEligiblePositions } from '../../cards/catalog';
import { resolveLineup, validateLineup } from '../validation';

describe('lineup validation', () => {
  it('accepts NHL, PWHL, and mixed Open Ice lineups', () => {
    const catalog = createTestCatalog();
    const openIce = createTestLineup('nhl-alpha', 'open-ice');
    const mixedOpenIce = {
      ...openIce,
      slots: {
        ...openIce.slots,
        C: 'pwhl-alpha-c-card',
        RD: 'pwhl-alpha-rd-card',
        G: 'pwhl-alpha-g-card',
      },
    };

    expect(validateLineup(createTestLineup('nhl-alpha', 'nhl-circuit'), catalog).valid).toBe(
      true,
    );
    expect(
      validateLineup(createTestLineup('pwhl-alpha', 'pwhl-circuit'), catalog).valid,
    ).toBe(true);
    expect(validateLineup(mixedOpenIce, catalog).valid).toBe(true);
  });

  it('rejects PWHL cards in NHL Circuit and NHL cards in PWHL Circuit', () => {
    const catalog = createTestCatalog();
    const pwhlInNhl = {
      ...createTestLineup('pwhl-alpha', 'pwhl-circuit'),
      mode: 'nhl-circuit' as const,
    };
    const nhlInPwhl = {
      ...createTestLineup('nhl-alpha', 'nhl-circuit'),
      mode: 'pwhl-circuit' as const,
    };

    expect(validateLineup(pwhlInNhl, catalog).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'wrong-league' })]),
    );
    expect(validateLineup(nhlInPwhl, catalog).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'wrong-league' })]),
    );
  });

  it('rejects invalid positions and goalie/skater slot swaps', () => {
    const catalog = createTestCatalog();
    const lineup = createTestLineup('nhl-alpha', 'nhl-circuit');
    const invalid = {
      ...lineup,
      slots: {
        ...lineup.slots,
        LW: lineup.slots.G,
        G: lineup.slots.LW,
      },
    };
    const result = validateLineup(invalid, catalog);

    expect(result.valid).toBe(false);
    expect(result.issues.filter(({ code }) => code === 'invalid-position')).toHaveLength(2);
  });

  it('uses an approved Signature artwork position for that CardVersion only', () => {
    const catalog = createTestCatalog();
    const cards = catalog.cards.map((card) => {
      if (card.id === 'nhl-alpha-lw-card') {
        return {
          ...card,
          setId: 'signature-series',
          visualMetadata: {
            ...card.visualMetadata,
            treatment: 'approved-local-asset' as const,
            artworkPosition: 'C' as const,
          },
        };
      }
      if (card.id === 'nhl-alpha-c-card') {
        return {
          ...card,
          setId: 'signature-series',
          visualMetadata: {
            ...card.visualMetadata,
            treatment: 'approved-local-asset' as const,
            artworkPosition: 'LW' as const,
          },
        };
      }
      return card;
    });
    const lineup = createTestLineup('nhl-alpha', 'nhl-circuit');
    const swapped = {
      ...lineup,
      slots: { ...lineup.slots, LW: lineup.slots.C, C: lineup.slots.LW },
    };

    expect(validateLineup(swapped, { ...catalog, cards }).valid).toBe(true);
    expect(validateLineup(lineup, { ...catalog, cards }).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid-position', slot: 'LW' })]),
    );
  });

  it('does not widen an artwork position to the PlayerIdentity position set', () => {
    const catalog = createTestCatalog();
    const sourcePlayer = catalog.players.find(({ id }) => id === 'nhl-alpha-c-player');
    if (!sourcePlayer || sourcePlayer.role !== 'skater') {
      throw new Error('Expected the fixture center to be a skater.');
    }
    const player = {
      ...sourcePlayer,
      eligiblePositions: ['C', 'RW'] as const,
    };
    const card = {
      ...catalog.cards.find(({ id }) => id === 'nhl-alpha-c-card')!,
      setId: 'signature-series',
      visualMetadata: {
        treatment: 'approved-local-asset' as const,
        accent: '#d4af37',
        frame: 'signature' as const,
        artworkPosition: 'C' as const,
      },
    };

    expect(cardEligiblePositions(card, player)).toEqual(['C']);
  });

  it('rejects duplicate card assignments and unknown card IDs', () => {
    const catalog = createTestCatalog();
    const lineup = createTestLineup('nhl-alpha', 'nhl-circuit');
    const duplicate = {
      ...lineup,
      slots: { ...lineup.slots, C: lineup.slots.LW },
    };
    const unknown = {
      ...lineup,
      slots: { ...lineup.slots, C: 'missing-card' },
    };

    expect(validateLineup(duplicate, catalog).issues).toContainEqual(
      expect.objectContaining({ code: 'duplicate-card', slot: 'C' }),
    );
    expect(validateLineup(unknown, catalog).issues).toContainEqual(
      expect.objectContaining({ code: 'unknown-card', slot: 'C' }),
    );
  });

  it('resolves a valid lineup and throws for an invalid one', () => {
    const catalog = createTestCatalog();
    const lineup = createTestLineup('nhl-alpha', 'nhl-circuit');

    expect(resolveLineup(lineup, catalog).cards).toHaveLength(6);
    expect(() =>
      resolveLineup({ ...lineup, slots: { ...lineup.slots, G: lineup.slots.C } }, catalog),
    ).toThrow(/cannot fill more than one|not eligible/);
  });
});
