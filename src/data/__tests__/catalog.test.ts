import { describe, expect, it } from 'vitest';

import { RIVALRY_REWARD_CARD_IDS } from '../../domain/progression';
import { EVENT_IDS } from '../../domain/shop';
import { catalogSchema } from '../catalogSchema';
import { catalogMetadata, eventCardManifest, gameCatalog, starterLineups } from '../generated/gameCatalog';
import { validateGameCatalog } from '../../../scripts/lib/catalogValidation';

describe('generated game catalog', () => {
  it('contains a balanced base catalog, ten recurring event sets, and Rivalry rewards', () => {
    const report = validateGameCatalog(gameCatalog, catalogMetadata, starterLineups);

    expect(report.players).toBe(36);
    expect(report.baseCards).toBe(36);
    expect(report.eventCards).toBe(70);
    expect(report.calendarEventCards).toBe(60);
    expect(report.rivalryCards).toBe(10);
    expect(Object.values(report.calendarEventCounts)).toEqual(Array(10).fill(6));
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

  it('generates six balanced tradeoff cards for every recurring event', () => {
    expect(eventCardManifest).toHaveLength(60);
    const baseByPlayer = new Map(gameCatalog.cards
      .filter((card) => card.cardType === 'base')
      .map((card) => [card.playerId, card]));
    for (const eventId of EVENT_IDS) {
      const cards = eventCardManifest.filter((card) => card.eventId === eventId);
      expect(cards).toHaveLength(6);
      expect(cards.filter(({ league }) => league === 'NHL')).toHaveLength(3);
      expect(cards.filter(({ league }) => league === 'PWHL')).toHaveLength(3);
      for (const card of cards) {
        const base = baseByPlayer.get(card.playerId);
        expect(base).toBeDefined();
        expect(card.id).toBe(`${card.playerId}-${eventId}`);
        expect(Math.abs(card.overall - (base?.overall ?? 0))).toBeLessThanOrEqual(1);
        const deltas = Object.entries(card.attributes).map(([key, value]) =>
          value - Number((base?.attributes as unknown as Record<string, number> | undefined)?.[key]));
        expect(deltas.some((delta) => delta > 0)).toBe(true);
        expect(deltas.some((delta) => delta < 0)).toBe(true);
      }
    }
  });

  it('keeps Rivalry choices outside the purchasable calendar sets', () => {
    for (const rewardCardId of RIVALRY_REWARD_CARD_IDS) {
      const card = gameCatalog.cards.find(({ id }) => id === rewardCardId);
      expect(card?.setId).toBe('rivalry-series-2026');
      expect(EVENT_IDS).not.toContain(card?.setId);
    }
  });
});
