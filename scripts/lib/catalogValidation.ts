import type { CardCatalog } from '../../src/domain/cards/types';
import type { Lineup } from '../../src/domain/lineups/types';
import { EVENT_CALENDAR, EVENT_IDS, type EventId } from '../../src/domain/shop/eventCalendar';
import { catalogSchema } from '../../src/data/catalogSchema';

export interface CatalogValidationReport {
  readonly players: number;
  readonly baseCards: number;
  readonly eventCards: number;
  readonly calendarEventCards: number;
  readonly rivalryCards: number;
  readonly calendarEventCounts: Readonly<Record<EventId, number>>;
  readonly baseOverallAverage: Readonly<Record<'NHL' | 'PWHL', number>>;
  readonly slotCounts: Readonly<Record<'NHL' | 'PWHL', Readonly<Record<string, number>>>>;
}

export function validateGameCatalog(
  catalog: CardCatalog,
  metadata: unknown,
  starterLineups: readonly Lineup[],
): CatalogValidationReport {
  const parsed = catalogSchema.safeParse({ metadata, ...catalog });
  if (!parsed.success) {
    throw new Error(`Catalog schema validation failed:\n${parsed.error.message}`);
  }

  const playerById = new Map(parsed.data.players.map((player) => [player.id, player]));
  const cardById = new Map(parsed.data.cards.map((card) => [card.id, card]));
  const baseCards = parsed.data.cards.filter((card) => card.cardType === 'base');
  const eventCards = parsed.data.cards.filter((card) => card.cardType !== 'base');
  const calendarEventCards = eventCards.filter((card) => EVENT_IDS.includes(card.setId as EventId));
  const rivalryCards = eventCards.filter((card) => card.setId === 'rivalry-series-2026');

  if (parsed.data.players.length !== 36) {
    throw new Error(`Expected 36 players, received ${parsed.data.players.length}`);
  }
  if (baseCards.length !== 36) {
    throw new Error(`Expected 36 base cards, received ${baseCards.length}`);
  }
  if (calendarEventCards.length !== 60) {
    throw new Error(`Expected 60 calendar event cards, received ${calendarEventCards.length}`);
  }
  if (rivalryCards.length !== 10) {
    throw new Error(`Expected 10 reward-only Rivalry cards, received ${rivalryCards.length}`);
  }
  if (eventCards.length !== calendarEventCards.length + rivalryCards.length) {
    throw new Error('Every non-base card must belong to the recurring calendar or Rivalry rewards');
  }

  const slotCounts = {
    NHL: Object.fromEntries(['LW', 'C', 'RW', 'LD', 'RD', 'G'].map((slot) => [slot, 0])),
    PWHL: Object.fromEntries(['LW', 'C', 'RW', 'LD', 'RD', 'G'].map((slot) => [slot, 0])),
  } as Record<'NHL' | 'PWHL', Record<string, number>>;
  for (const player of parsed.data.players) {
    slotCounts[player.league][player.primaryPosition] += 1;
    if (!player.imageReference.startsWith('placeholder:')) {
      throw new Error(`Non-placeholder asset reference found for ${player.id}`);
    }
  }
  for (const league of ['NHL', 'PWHL'] as const) {
    const leaguePlayers = parsed.data.players.filter((player) => player.league === league);
    if (leaguePlayers.length !== 18) {
      throw new Error(`Expected 18 ${league} players, received ${leaguePlayers.length}`);
    }
    for (const [slot, count] of Object.entries(slotCounts[league])) {
      if (count !== 3) {
        throw new Error(`Expected 3 ${league} ${slot} players, received ${count}`);
      }
    }

    const leagueEventCards = calendarEventCards.filter(
      (card) => playerById.get(card.playerId)?.league === league,
    );
    if (leagueEventCards.length !== 30) {
      throw new Error(`Expected 30 ${league} calendar event cards, received ${leagueEventCards.length}`);
    }
  }

  if (EVENT_CALENDAR.length !== 10 || new Set(EVENT_CALENDAR.map(({ id }) => id)).size !== 10) {
    throw new Error('The recurring Event Calendar must contain ten unique events');
  }
  const calendarEventCounts = {} as Record<EventId, number>;
  for (const eventId of EVENT_IDS) {
    const setCards = calendarEventCards.filter((card) => card.setId === eventId);
    calendarEventCounts[eventId] = setCards.length;
    if (setCards.length !== 6) {
      throw new Error(`Expected 6 ${eventId} cards, received ${setCards.length}`);
    }
    for (const league of ['NHL', 'PWHL'] as const) {
      const count = setCards.filter((card) => playerById.get(card.playerId)?.league === league).length;
      if (count !== 3) throw new Error(`${eventId} must contain exactly 3 ${league} cards`);
    }
    for (const card of setCards) {
      const base = baseCards.find((candidate) => candidate.playerId === card.playerId);
      if (!base || base.role !== card.role) throw new Error(`${card.id} requires a matching base card`);
      if (card.id !== `${card.playerId}-${eventId}`) throw new Error(`${card.id} does not follow the stable event-card id contract`);
      if (Math.abs(card.overall - base.overall) > 1) throw new Error(`${card.id} exceeds the no-power-creep overall band`);
      const baseAttributes = base.attributes as unknown as Record<string, number>;
      const eventAttributes = card.attributes as unknown as Record<string, number>;
      const deltas = Object.keys(eventAttributes).map((key) => eventAttributes[key] - baseAttributes[key]);
      if (!deltas.some((delta) => delta > 0) || !deltas.some((delta) => delta < 0)) {
        throw new Error(`${card.id} must contain both an event strength and a tradeoff`);
      }
      if (!card.availableFrom || !card.availableTo) throw new Error(`${card.id} requires an availability window`);
    }
  }

  for (const player of parsed.data.players) {
    const ownedBaseVersions = baseCards.filter((card) => card.playerId === player.id);
    if (ownedBaseVersions.length !== 1 || !ownedBaseVersions[0]?.isPermanent) {
      throw new Error(`${player.id} must have exactly one permanent base card`);
    }
  }

  const starterModes = starterLineups.map((lineup) => lineup.mode);
  if (
    starterLineups.length !== 3 ||
    !['nhl-circuit', 'pwhl-circuit', 'open-ice'].every((mode) => starterModes.includes(mode as never))
  ) {
    throw new Error('Expected exactly one starter lineup for each game mode');
  }

  for (const lineup of starterLineups) {
    const expectedLeague =
      lineup.mode === 'nhl-circuit'
        ? 'NHL'
        : lineup.mode === 'pwhl-circuit'
          ? 'PWHL'
          : undefined;
    if (new Set(Object.values(lineup.slots)).size !== 6) {
      throw new Error(`${lineup.id} contains a duplicate card`);
    }
    for (const [slot, cardId] of Object.entries(lineup.slots)) {
      const card = cardById.get(cardId);
      const player = card ? playerById.get(card.playerId) : undefined;
      if (!card || !player) {
        throw new Error(`${lineup.id} references unknown card ${cardId}`);
      }
      if (!player.eligiblePositions.includes(slot as never)) {
        throw new Error(`${lineup.id} places ${player.id} in invalid slot ${slot}`);
      }
      if (expectedLeague && player.league !== expectedLeague) {
        throw new Error(`${lineup.id} violates its ${expectedLeague}-only rule`);
      }
    }
  }

  const baseOverallAverage = Object.fromEntries(
    (['NHL', 'PWHL'] as const).map((league) => {
      const values = baseCards
        .filter((card) => playerById.get(card.playerId)?.league === league)
        .map((card) => card.overall);
      return [league, values.reduce((sum, value) => sum + value, 0) / values.length];
    }),
  ) as Record<'NHL' | 'PWHL', number>;

  if (Math.abs(baseOverallAverage.NHL - baseOverallAverage.PWHL) > 1) {
    throw new Error(
      `League base overall averages differ by more than 1 point: NHL ${baseOverallAverage.NHL.toFixed(2)}, PWHL ${baseOverallAverage.PWHL.toFixed(2)}`,
    );
  }

  return {
    players: parsed.data.players.length,
    baseCards: baseCards.length,
    eventCards: eventCards.length,
    calendarEventCards: calendarEventCards.length,
    rivalryCards: rivalryCards.length,
    calendarEventCounts,
    baseOverallAverage,
    slotCounts,
  };
}
