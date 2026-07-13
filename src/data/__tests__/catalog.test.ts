import { describe, expect, it } from 'vitest';

import { catalogSchema } from '../catalogSchema';
import { catalogMetadata, gameCatalog, starterLineups } from '../generated/gameCatalog';
import { validateGameCatalog } from '../../../scripts/lib/catalogValidation';

describe('generated game catalog', () => {
  it('contains a balanced, playable 36-card base catalog and ten event cards', () => {
    const report = validateGameCatalog(gameCatalog, catalogMetadata, starterLineups);

    expect(report.players).toBe(36);
    expect(report.baseCards).toBe(36);
    expect(report.eventCards).toBe(10);
    expect(report.slotCounts.NHL).toEqual({ LW: 3, C: 3, RW: 3, LD: 3, RD: 3, G: 3 });
    expect(report.slotCounts.PWHL).toEqual({ LW: 3, C: 3, RW: 3, LD: 3, RD: 3, G: 3 });
    expect(Math.abs(report.baseOverallAverage.NHL - report.baseOverallAverage.PWHL)).toBeLessThanOrEqual(1);
  });

  it('rejects duplicate IDs and invalid player references', () => {
    const duplicate = {
      metadata: catalogMetadata,
      players: [...gameCatalog.players, gameCatalog.players[0]],
      cards: gameCatalog.cards,
    };
    expect(catalogSchema.safeParse(duplicate).success).toBe(false);

    const invalidReference = {
      metadata: catalogMetadata,
      players: gameCatalog.players,
      cards: [
        ...gameCatalog.cards.slice(0, -1),
        { ...gameCatalog.cards.at(-1), playerId: 'missing-player' },
      ],
    };
    expect(catalogSchema.safeParse(invalidReference).success).toBe(false);
  });

  it('keeps goalie and skater schemas separate and every asset replaceable', () => {
    expect(gameCatalog.players.every(({ imageReference }) => imageReference?.startsWith('placeholder:'))).toBe(true);

    const goalie = gameCatalog.cards.find((card) => card.role === 'goalie');
    expect(goalie).toBeDefined();
    const mismatched = {
      metadata: catalogMetadata,
      players: gameCatalog.players,
      cards: gameCatalog.cards.map((card) =>
        card.id === goalie?.id ? { ...card, role: 'skater' as const } : card,
      ),
    };
    expect(catalogSchema.safeParse(mismatched).success).toBe(false);
  });
});
