import type {
  CardCatalog,
  CardVersion,
  HockeyPosition,
  League,
  Player,
} from '../../domain/cards/types';
import { cardEligiblePositions, cardPrimaryPosition } from '../../domain/cards/catalog';
import { EVENT_IDS, type EventId } from '../../domain/shop/eventCalendar';

export type EventCardManifestEntry = CardVersion & {
  readonly eventId: EventId;
  readonly league: League;
  readonly position: HockeyPosition;
  readonly eligiblePositions: readonly HockeyPosition[];
};

export function buildEventCardManifest(
  players: readonly Player[],
  cards: readonly CardVersion[],
): readonly EventCardManifestEntry[] {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const eventIds = new Set<string>(EVENT_IDS);
  return cards.filter((card) => card.cardType === 'event').map((card) => {
    const player = playersById.get(card.playerId);
    if (!player || !eventIds.has(card.setId)) {
      throw new TypeError(`Event card ${card.id} has invalid player or Event Calendar set references.`);
    }
    return {
      ...card,
      eventId: card.setId as EventId,
      league: player.league,
      position: cardPrimaryPosition(card, player),
      eligiblePositions: cardEligiblePositions(card, player),
    };
  });
}

export function eventCardsFromManifest(
  manifest: readonly EventCardManifestEntry[],
): readonly CardVersion[] {
  return manifest.map(({ eventId: _eventId, league: _league, position: _position, eligiblePositions: _eligiblePositions, ...card }) => card);
}

export function eventManifestCatalogProjection(
  manifest: readonly EventCardManifestEntry[],
): CardCatalog['cards'] {
  return eventCardsFromManifest(manifest);
}
