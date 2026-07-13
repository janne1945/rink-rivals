import { describe, expect, it } from 'vitest';

import { createTestCatalog, createTestLineup } from '../../battle/__tests__/fixtures';
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
