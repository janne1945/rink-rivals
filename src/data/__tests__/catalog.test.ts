import { describe, expect, it } from 'vitest';

import { RIVALRY_REWARD_CARD_IDS } from '../../domain/progression';
import { EVENT_IDS } from '../../domain/shop';
import { catalogSchema } from '../catalogSchema';
import { STARTER_OVR_FLOOR_EXCEPTION_PLAYER_IDS } from '../starterFloorExceptions';
import {
  catalogMetadata,
  eventCardManifest,
  gameCatalog,
  starterLineups,
  starterSquads,
} from '../generated/gameCatalog';
import { validateGameCatalog } from '../../../scripts/lib/catalogValidation';
import { validateCardAssets } from '../../domain/cards/assets';

describe('generated content foundation catalog', () => {
  it('contains the complete launch universe and passes the cross-domain validator', () => {
    const report = validateGameCatalog(gameCatalog, catalogMetadata, starterLineups);
    expect(report).toMatchObject({
      teams: 44,
      players: 794,
      activePlayers: 792,
      legacyPlayers: 2,
      starterCards: 264,
      baseCards: 792,
      eventCards: 107,
      rewardCards: 15,
      rivalryCards: 10,
    });
    expect(report.starterAverageRange).toEqual([72, 72]);
    expect(Math.abs(report.baseOverallAverage.NHL - report.baseOverallAverage.PWHL))
      .toBeLessThanOrEqual(1);
    expect(Math.min(...Object.values(report.eventCoverageByTeam))).toBeGreaterThanOrEqual(2);
  });

  it('gives every CardVersion one valid asset reference and a direct or safe fallback image', () => {
    const report = validateCardAssets(gameCatalog);
    expect(report.valid).toBe(true);
    expect(report.directCards + report.baseFallbackCards + report.placeholderCards)
      .toBe(gameCatalog.cards.length);
    expect(report.issues.filter(({ severity }) => severity === 'error')).toEqual([]);
  });

  it('gives every active team 18 Base identities and one complete StarterSquad', () => {
    const activePlayers = gameCatalog.players.filter((player) => player.active);
    for (const team of gameCatalog.teams) {
      expect(activePlayers.filter((player) => player.currentTeamId === team.id)).toHaveLength(18);
      expect(gameCatalog.cards.filter((card) => card.cardType === 'base' && card.teamId === team.id)).toHaveLength(18);
      const squad = starterSquads.find((candidate) => candidate.teamId === team.id);
      expect(squad).toBeDefined();
      expect(new Set(Object.values(squad?.lineup ?? {}))).toHaveProperty('size', 6);
      expect(squad?.averageOverall).toBe(72);
    }
  });

  it('keeps Starter OVR below Base except for the six reviewed weaker-profile 68 floor cases', () => {
    const baseByPlayer = new Map(gameCatalog.cards
      .filter((card) => card.cardType === 'base')
      .map((card) => [card.playerId, card]));
    const starters = gameCatalog.cards.filter((candidate) => candidate.cardType === 'starter');
    const floorCases = starters.filter((card) => card.overall === baseByPlayer.get(card.playerId)?.overall);
    expect(floorCases.map((card) => card.playerId).sort())
      .toEqual([...STARTER_OVR_FLOOR_EXCEPTION_PLAYER_IDS].sort());
    expect(floorCases.every((card) => card.overall === 68)).toBe(true);
    for (const card of starters) {
      const base = baseByPlayer.get(card.playerId);
      expect(card.overall).toBeLessThanOrEqual(base?.overall ?? 0);
      if ((base?.overall ?? 0) > 68) expect(card.overall).toBeLessThan(base?.overall ?? 0);
      const deltas = Object.entries(card.attributes).map(([key, value]) =>
        value - Number((base?.attributes as unknown as Record<string, number> | undefined)?.[key]));
      expect(deltas.every((delta) => delta <= 0)).toBe(true);
      expect(deltas.some((delta) => delta < 0)).toBe(true);
    }

    const starter = starters.find((card) => (baseByPlayer.get(card.playerId)?.overall ?? 0) > 68);
    const matchingBase = baseByPlayer.get(starter?.playerId ?? '');
    expect(matchingBase).toBeDefined();
    const cards = gameCatalog.cards.map((card) => card.id === starter?.id
      ? { ...card, overall: matchingBase?.overall }
      : card);
    expect(catalogSchema.safeParse({ metadata: catalogMetadata, ...gameCatalog, cards }).success)
      .toBe(false);

    const floorBase = baseByPlayer.get(floorCases[0]?.playerId ?? '');
    const flattenedFloor = gameCatalog.cards.map((card) => card.id === floorCases[0]?.id
      ? { ...card, attributes: floorBase?.attributes }
      : card);
    expect(catalogSchema.safeParse({ metadata: catalogMetadata, ...gameCatalog, cards: flattenedFloor }).success)
      .toBe(false);
  });

  it('rejects StarterSquad card/lineup set mismatches', () => {
    const squad = starterSquads[0];
    const replacement = gameCatalog.cards.find((card) =>
      card.cardType === 'base' && card.teamId === squad.teamId && !squad.cards.includes(card.id));
    expect(replacement).toBeDefined();
    const starterSquadsMutation = starterSquads.map((candidate) => candidate.teamId === squad.teamId
      ? { ...candidate, cards: [replacement?.id, ...candidate.cards.slice(1)] }
      : candidate);
    expect(catalogSchema.safeParse({
      metadata: catalogMetadata,
      ...gameCatalog,
      starterSquads: starterSquadsMutation,
    }).success).toBe(false);
  });

  it('excludes every top-cutoff identity and Connor McDavid from Starter grants', () => {
    const cardById = new Map(gameCatalog.cards.map((card) => [card.id, card]));
    for (const squad of starterSquads) {
      const teamBase = gameCatalog.cards
        .filter((card) => card.cardType === 'base' && card.teamId === squad.teamId)
        .sort((left, right) => right.overall - left.overall || left.playerId.localeCompare(right.playerId));
      const cutoff = teamBase[2]?.overall ?? 100;
      const protectedIds = new Set(teamBase.filter((card) => card.overall >= cutoff).map((card) => card.playerId));
      const starterPlayerIds = squad.cards.map((id) => cardById.get(id)?.playerId);
      expect(starterPlayerIds.some((id) => id && protectedIds.has(id))).toBe(false);
      expect(starterPlayerIds).not.toContain('nhl-connor-mcdavid');
    }
  });

  it('keeps card categories inside launch power and market boundaries', () => {
    for (const card of gameCatalog.cards) {
      if (card.cardType === 'starter') {
        expect(card.overall).toBeGreaterThanOrEqual(68);
        expect(card.overall).toBeLessThanOrEqual(76);
        expect(card.marketAvailability).toBe('unavailable');
      } else if (card.cardType === 'base') {
        expect(card.overall).toBeGreaterThanOrEqual(68);
        expect(card.overall).toBeLessThanOrEqual(86);
        expect(card.marketAvailability).toBe('base-market');
      } else if (card.cardType === 'event') {
        expect(card.overall).toBeGreaterThanOrEqual(84);
        expect(card.overall).toBeLessThanOrEqual(90);
        expect(card.marketAvailability).toBe('event-shop');
        const comparableBasePrice = Math.max(...gameCatalog.cards
          .filter((candidate) => candidate.cardType === 'base'
            && candidate.overall <= Math.min(86, card.overall))
          .map((candidate) => candidate.price));
        expect(card.price).toBeGreaterThan(comparableBasePrice);
      } else {
        expect(card.overall).toBeLessThanOrEqual(90);
        expect(card.marketAvailability).toBe('reward-only');
      }
    }
  });

  it('generates ten recurring Event sets with a real strength and tradeoff', () => {
    expect(eventCardManifest).toHaveLength(107);
    const baseByPlayer = new Map(gameCatalog.cards
      .filter((card) => card.cardType === 'base')
      .map((card) => [card.playerId, card]));
    for (const eventId of EVENT_IDS) {
      expect(eventCardManifest.filter((card) => card.eventId === eventId).length).toBeGreaterThanOrEqual(6);
    }
    for (const card of eventCardManifest) {
      const base = baseByPlayer.get(card.playerId);
      expect(base).toBeDefined();
      expect(card.id).toBe(`${card.playerId}-${card.eventId}`);
      const deltas = Object.entries(card.attributes).map(([key, value]) =>
        value - Number((base?.attributes as unknown as Record<string, number> | undefined)?.[key]));
      expect(deltas.some((delta) => delta > 0)).toBe(true);
      expect(deltas.some((delta) => delta < 0)).toBe(true);
    }
  });

  it('retains legacy IDs as inactive, reward-only records without making roster claims', () => {
    for (const playerId of ['pwhl-kendall-coyne-schofield', 'pwhl-claire-thompson']) {
      const player = gameCatalog.players.find((candidate) => candidate.id === playerId);
      expect(player).toMatchObject({ active: false });
      expect(player?.sourceMetadata).toMatchObject({
        provider: 'legacy-catalog',
        sourceRosterStatus: 'legacy-retained',
        requiresManualReview: true,
      });
    }
    for (const rewardCardId of RIVALRY_REWARD_CARD_IDS) {
      const card = gameCatalog.cards.find(({ id }) => id === rewardCardId);
      expect(card?.setId).toBe('rivalry-series-2026');
      expect(card?.marketAvailability).toBe('reward-only');
    }
  });

  it('rejects duplicate IDs, invalid references, and unexplained manual-review flags', () => {
    expect(catalogSchema.safeParse({
      metadata: catalogMetadata,
      ...gameCatalog,
      players: [...gameCatalog.players, gameCatalog.players[0]],
    }).success).toBe(false);

    const invalidReference = gameCatalog.cards.map((card, index) =>
      index === gameCatalog.cards.length - 1 ? { ...card, playerId: 'missing-player' } : card);
    expect(catalogSchema.safeParse({ metadata: catalogMetadata, ...gameCatalog, cards: invalidReference }).success)
      .toBe(false);

    const first = gameCatalog.players[0];
    const unexplained = gameCatalog.players.map((player) => player.id === first.id
      ? { ...player, sourceMetadata: { ...player.sourceMetadata, requiresManualReview: true, manualReviewReasons: [] } }
      : player);
    expect(catalogSchema.safeParse({ metadata: catalogMetadata, ...gameCatalog, players: unexplained }).success)
      .toBe(false);
  });
});
